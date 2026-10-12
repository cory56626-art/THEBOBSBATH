import {
  ROOMS, HIDING_SPOTS, ITEMS, EXIT, SURVIVOR_SPAWN, MONSTER_SPAWN,
  distance, findPath, pathLength, lineOfSight, isWalkable, canWalkSegment, nearestWalkable,
} from './layout.js';

const TICK = 0.1;
const DIFFICULTIES = {
  balanced: { chaseSpeed: 3.2, patrolSpeed: 2.25, investigateSpeed: 2.7, searchSpeed: 2.3,
    memory: 8, sight: 13, hearing: 1, searchTime: 22, hideChecks: 3 },
  relentless: { chaseSpeed: 3.22, patrolSpeed: 2.6, investigateSpeed: 3.05, searchSpeed: 2.6,
    memory: 10, sight: 14, hearing: 1.25, searchTime: 28, hideChecks: 4 },
  patient: { chaseSpeed: 2.94, patrolSpeed: 2.25, investigateSpeed: 2.7, searchSpeed: 2.3,
    memory: 6, sight: 12, hearing: 0.75, searchTime: 14, hideChecks: 2 },
};

function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function angleDelta(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function pointCopy(a) { return { x: a.x, z: a.z }; }

/** Autonomous actors: the monster's target is always a perception or a remembered guess. */
export class Simulation {
  constructor({ seed = 56626, difficulty = 'balanced' } = {}) {
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : 'balanced';
    this.config = DIFFICULTIES[this.difficulty];
    this.reset(seed);
  }

  random() {
    // Mulberry32, deliberately independent of Math.random and frame timing.
    let t = this._rng += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this._rng = hashSeed(seed);
    this._accumulator = 0;
    this._nextNoiseId = 1;
    this.time = 0;
    this.status = 'running';
    this.events = [];
    this.noises = [];
    this.items = ITEMS.map(item => ({ ...item, collected: false }));
    this.stats = { chases: 0, searches: 0, sounds: 0, catches: 0, escapes: 0, hidingChecks: 0, wrongTurns: 0 };
    this.survivor = {
      ...SURVIVOR_SPAWN, heading: -Math.PI / 2, state: 'explore', label: 'Looking for escape tools',
      lives: 3, hidden: false, hidingSpotId: null, items: [], graceRemaining: 3,
      speed: 0, target: null, _path: [], _pathTarget: null, _pathRefresh: 0,
      _decisionAt: 0, _dangerUntil: 0, _lastMonsterSeen: null, _lastMonsterHeardAt: -100,
      _lostSightAt: -100, _hideSince: 0, _hideMin: 0, _hideGoal: null,
      _footstepAt: 0, _interaction: 0, _interactId: null, _pauseUntil: 0, _escapeProgress: 0,
    };
    this.monster = {
      ...MONSTER_SPAWN, heading: Math.PI, state: 'patrol', label: 'Roaming the house',
      target: null, lastSeen: null, memoryRemaining: 0, alertness: 0, speed: 0,
      sightRange: this.config.sight, fov: Math.PI * 0.78,
      _path: [], _pathTarget: null, _pathRefresh: 0, _heardNoiseId: 0, _visible: false,
      _observedDirection: { x: 0, z: 0 }, _searchOrigin: null, _searchEnds: 0,
      _checkQueue: [], _checking: null, _checkStarted: 0, _patrolVisited: [],
      _decisionAt: 0, _lastNoiseAt: -100, _wasMoving: false, _patrolScanUntil: 0,
    };
    // Patrol order varies, but it never knows the survivor's objective or location.
    this._patrolPoints = [
      ...ROOMS.filter(r => !r.id.startsWith('hall')).map(r => nearestWalkable(r.x, r.z)),
      { x: 0, z: 0 }, { x: 0, z: -16 }, { x: 0, z: 16 }, { x: -19, z: 0 }, { x: 19, z: 0 },
    ];
    this._event('The survivor has three lives. Find the key, fuse, and cutters.', 'start');
    this._choosePatrol();
    return this;
  }

  _event(text, kind = 'info') {
    this.events.push({ time: this.time, text, kind });
    if (this.events.length > 40) this.events.shift();
  }

  emitNoise(x, z, radius = 12, type = 'noise') {
    if (![x, z, radius].every(Number.isFinite) || radius <= 0) return null;
    const noise = { id: this._nextNoiseId++, x, z, radius, type, age: 0, createdAt: this.time };
    this.noises.push(noise);
    this.stats.sounds++;
    return noise;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || this.status !== 'running') return;
    this._accumulator += Math.min(dt, 5);
    while (this._accumulator + 1e-9 >= TICK && this.status === 'running') {
      this._accumulator -= TICK;
      this._step(TICK);
    }
  }

  _step(dt) {
    this.time = Math.round((this.time + dt) * 1e8) / 1e8;
    for (const noise of this.noises) noise.age += dt;
    this.noises = this.noises.filter(n => n.age < 3.2);
    this.survivor.graceRemaining = Math.max(0, this.survivor.graceRemaining - dt);
    this._updateSurvivor(dt);
    this._updateMonster(dt);
    const s = this.survivor, m = this.monster;
    if (!s.hidden && s.graceRemaining <= 0 && distance(s, m) < 0.8 && lineOfSight(s, m)) this._catchSurvivor();
  }

  canMonsterSeeSurvivor() {
    const s = this.survivor, m = this.monster;
    if (s.hidden || s.graceRemaining > 0 || distance(s, m) > m.sightRange) return false;
    const angle = Math.atan2(s.z - m.z, s.x - m.x);
    // A little peripheral awareness at arm's length prevents walking directly through an NPC.
    if (distance(s, m) > 2 && Math.abs(angleDelta(angle, m.heading)) > m.fov / 2) return false;
    return lineOfSight(m, s);
  }

  _setTarget(actor, target, force = false) {
    actor.target = target ? pointCopy(target) : null;
    if (!target) { actor._path = []; actor._pathTarget = null; return; }
    if (force || !actor._pathTarget || distance(actor._pathTarget, target) > 1.1 ||
      (this.time > actor._pathRefresh && actor._path.length === 0 && distance(actor, target) > 0.45)) {
      actor._path = findPath(actor, target);
      actor._pathTarget = pointCopy(target);
      actor._pathRefresh = this.time + 0.7;
    }
  }

  _move(actor, speed, dt) {
    actor.speed = 0;
    let budget = speed * dt;
    while (actor._path.length && budget > 0.001) {
      const next = actor._path[0], d = distance(actor, next);
      if (d < 0.03) { actor._path.shift(); continue; }
      const move = Math.min(d, budget);
      const destination = { x: actor.x + (next.x - actor.x) * move / d, z: actor.z + (next.z - actor.z) * move / d };
      if (!canWalkSegment(actor, destination)) {
        // Should only occur after a caller deliberately repositions an actor.
        actor._path = []; actor._pathTarget = null; break;
      }
      actor.heading = Math.atan2(next.z - actor.z, next.x - actor.x);
      actor.x = destination.x; actor.z = destination.z;
      actor.speed = speed;
      budget -= move;
      if (move >= d - 1e-6) actor._path.shift();
    }
  }

  _updateSurvivor(dt) {
    const s = this.survivor, m = this.monster;
    const seesMonster = !s.hidden && distance(s, m) < 11.5 && lineOfSight(s, m);
    if (seesMonster) {
      s._lastMonsterSeen = { ...pointCopy(m), time: this.time };
      s._dangerUntil = this.time + 8;
      s._lostSightAt = this.time;
      s._lastMonsterHeardAt = this.time;
    } else if (m.speed > 0 && distance(s, m) < 7) {
      // Even inside a closet, nearby heavy footsteps are audible.
      s._lastMonsterHeardAt = this.time;
    }

    if (s.hidden) {
      s.state = 'hide';
      s.label = s.hidingSpotId?.startsWith('bed') ? 'Holding breath under a bed' : 'Holding breath in a closet';
      s.speed = 0;
      if (this.time - s._hideSince > s._hideMin && this.time - s._lastMonsterHeardAt > 3.8) {
        s.hidden = false; s.hidingSpotId = null; s._hideGoal = null;
        s._dangerUntil = 0; s._decisionAt = 0;
        this.emitNoise(s.x, s.z, 4.5, 'Leaving a hiding place');
        this._event('The survivor slips out of hiding.', 'hide');
      }
      return;
    }

    if (this.time < s._pauseUntil) { s.speed = 0; return; }
    const danger = seesMonster || this.time < s._dangerUntil;
    if (danger) {
      s.state = 'flee'; s.label = seesMonster ? 'Breaking line of sight' : 'Looking for a hiding place';
      s._interaction = 0; s._interactId = null;
      if (this.time >= s._decisionAt || !s._hideGoal || distance(s, s._hideGoal) < 0.65) {
        if (s._hideGoal && distance(s, s._hideGoal) < 0.65 && !seesMonster && this.time - s._lostSightAt > 0.7) {
          if (this._enterHiding(s._hideGoal)) return;
        }
        this._chooseFleeGoal(seesMonster);
        s._decisionAt = this.time + (seesMonster ? 1.5 : 2.8);
      }
      this._setTarget(s, s._hideGoal);
      this._move(s, seesMonster ? 3.2 : 2.8, dt);
      this._survivorFootsteps(seesMonster);
      // An occasional knocked-over object creates a real, local audible clue.
      if (seesMonster && this.random() < 0.0014) {
        this.emitNoise(s.x, s.z, 17, 'Dropped bottle');
        s._pauseUntil = this.time + 0.3;
        this._event('A bottle hits the floor while the survivor runs.', 'sound');
      }
      return;
    }

    s._hideGoal = null;
    if (s.items.length === this.items.length) {
      s.state = 'escape'; s.label = 'Reaching the exit';
      this._setTarget(s, EXIT);
      if (distance(s, EXIT) < 0.65) {
        s.label = 'Unlocking the front door'; s.speed = 0;
        if (s._escapeProgress === 0) {
          this.emitNoise(s.x, s.z, 28, 'Front door lock');
          this._event('The survivor works on the front door. The lock rattles loudly.', 'sound');
        }
        s._escapeProgress += dt;
        if (s._escapeProgress >= 5.5) {
          this.status = 'escaped'; s.state = 'escaped'; s.label = 'Escaped the house';
          this.stats.escapes++;
          this._event('The front door opens. The survivor escapes!', 'escape');
        }
      } else { s._escapeProgress = 0; this._move(s, 1.9, dt); }
      this._survivorFootsteps(false);
      return;
    }

    let objective = this.items.find(i => i.id === s._interactId && !i.collected);
    if (!objective) {
      const candidates = this.items.filter(i => !i.collected).map(item => {
        const path = findPath(s, item);
        return { item, path, score: path.length ? pathLength(s, path) + this.random() * 2.2 : Infinity };
      }).sort((a, b) => a.score - b.score);
      objective = candidates[0]?.item;
      if (!objective) return;
      s._interactId = objective.id;
      this._setTarget(s, objective, true);
    }
    s.state = 'explore'; s.label = `Searching for the ${objective.label.toLowerCase()}`;
    this._setTarget(s, objective);
    if (distance(s, objective) < 0.55) {
      s.state = 'collect'; s.label = `Picking up the ${objective.label.toLowerCase()}`;
      s.speed = 0;
      if (s._interaction === 0) this.emitNoise(s.x, s.z, 18, `Handling ${objective.label.toLowerCase()}`);
      s._interaction += dt;
      if (s._interaction >= 3.2) {
        objective.collected = true; s.items.push(objective.id);
        s._interaction = 0; s._interactId = null;
        this.emitNoise(s.x, s.z, 20, `Picked up ${objective.label.toLowerCase()}`);
        this._event(`The survivor found the ${objective.label.toLowerCase()} (${s.items.length}/3).`, 'item');
      }
    } else { s._interaction = 0; this._move(s, 1.85, dt); }
    this._survivorFootsteps(false);
  }

  _survivorFootsteps(running) {
    const s = this.survivor;
    if (s.speed <= 0 || this.time < s._footstepAt) return;
    this.emitNoise(s.x, s.z, running ? 12 : 6.5, running ? 'Running footsteps' : 'Quiet footsteps');
    s._footstepAt = this.time + (running ? 1.4 : 3.2);
  }

  _chooseFleeGoal(seesMonster) {
    const s = this.survivor;
    const threat = s._lastMonsterSeen || pointCopy(s);
    const candidates = HIDING_SPOTS.map(spot => {
      const path = findPath(s, spot);
      const travel = path.length ? pathLength(s, path) : Infinity;
      const away = distance(spot, threat);
      const concealed = !lineOfSight(threat, spot);
      // The survivor reasons from the monster's last observed position, never its unseen current one.
      const score = away * 0.7 - travel * 0.65 + (concealed ? 5 : 0) + this.random() * 3;
      return { spot, travel, score };
    }).filter(c => c.travel < 24 && c.travel > (seesMonster ? 2 : 0.1))
      .sort((a, b) => b.score - a.score);
    const choice = candidates[0];
    if (choice) {
      s._hideGoal = choice.spot;
      this._setTarget(s, choice.spot, true);
    } else {
      const fallback = nearestWalkable(s.x + (s.x - threat.x) * 1.5, s.z + (s.z - threat.z) * 1.5);
      s._hideGoal = { ...fallback, id: null, type: 'bed' };
      this._setTarget(s, fallback, true);
    }
  }

  _enterHiding(spot) {
    if (!spot.id || this.canMonsterSeeSurvivor()) { this.survivor._decisionAt = 0; return false; }
    const s = this.survivor;
    s.x = spot.x; s.z = spot.z; s.hidden = true; s.hidingSpotId = spot.id;
    s.state = 'hide'; s.speed = 0; s._hideSince = this.time;
    s._hideMin = 5.5 + this.random() * 4;
    s._path = [];
    this.emitNoise(s.x, s.z, spot.type === 'closet' ? 9 : 4, spot.type === 'closet' ? 'Closet door' : 'Crawling under a bed');
    this._event(`The survivor hides ${spot.type === 'closet' ? 'inside a closet' : 'under a bed'}.`, 'hide');
    return true;
  }

  _updateMonster(dt) {
    const m = this.monster, s = this.survivor;
    const visible = this.canMonsterSeeSurvivor();
    m._visible = visible;
    if (visible) {
      if (m.state !== 'chase') {
        this.stats.chases++;
        this._event('The monster sees the survivor. The chase begins.', 'chase');
      }
      if (m.lastSeen) {
        const d = distance(m.lastSeen, s);
        if (d > 0.01) m._observedDirection = { x: (s.x - m.lastSeen.x) / d, z: (s.z - m.lastSeen.z) / d };
      }
      m.lastSeen = { x: s.x, z: s.z, time: this.time };
      m.memoryRemaining = this.config.memory;
      m.state = 'chase'; m.label = 'Chasing a visible survivor'; m.alertness = 1;
      m._checking = null; m._checkQueue = [];
      this._setTarget(m, s);
    } else {
      m.memoryRemaining = m.lastSeen ? Math.max(0, this.config.memory - (this.time - m.lastSeen.time)) : 0;
      if (m.state === 'chase') {
        m.state = 'pursue'; m.label = 'Following the last sighting';
        // Extrapolation is a guess from observed movement. It can pick the wrong corridor.
        const dir = m._observedDirection;
        const continuation = nearestWalkable(m.lastSeen.x + dir.x * 2.5, m.lastSeen.z + dir.z * 2.5);
        const useGuess = this.random() < 0.58 && lineOfSight(m.lastSeen, continuation);
        this._setTarget(m, useGuess ? continuation : m.lastSeen, true);
        if (useGuess) this.stats.wrongTurns++;
        this._event('The survivor leaves its sight. The monster follows its last clue.', 'memory');
      }
    }

    this._hearNoises(visible);
    if (visible) {
      this._move(m, this.config.chaseSpeed, dt);
      return;
    }

    if (m.state === 'pursue') {
      m.label = `Remembering the last sighting (${Math.ceil(m.memoryRemaining)}s)`;
      if (m.memoryRemaining <= 0 || !m.target || distance(m, m.target) < 0.7 || !m._path.length) {
        this._beginSearch(m.target || m.lastSeen || m, 'last sighting');
      } else this._move(m, this.config.chaseSpeed * 0.9, dt);
      return;
    }
    if (m.state === 'investigate') {
      m.label = 'Investigating an approximate sound source';
      if (!m.target || distance(m, m.target) < 0.8 || !m._path.length) this._beginSearch(m.target || m, 'sound');
      else this._move(m, this.config.investigateSpeed, dt);
      m.alertness = Math.max(0.5, m.alertness - dt * 0.025);
      return;
    }
    if (m.state === 'search') {
      this._updateSearch(dt);
      return;
    }
    m.alertness = Math.max(0.08, m.alertness - dt * 0.035);
    m.label = 'Roaming and listening';
    if (!m.target || distance(m, m.target) < 0.65 || !m._path.length) {
      if (!m._patrolScanUntil) m._patrolScanUntil = this.time + 3.2;
      if (this.time < m._patrolScanUntil) {
        m.label = 'Listening and scanning the room';
        m.heading += dt * 1.55; m.speed = 0;
        return;
      }
      this._choosePatrol();
    }
    this._move(m, this.config.patrolSpeed, dt);
  }

  _hearNoises(visible) {
    const m = this.monster;
    let best = null, bestStrength = 0;
    for (const noise of this.noises) {
      if (noise.id <= m._heardNoiseId || noise.age > 0.25) continue;
      const d = distance(m, noise);
      const wallFactor = lineOfSight(m, noise) ? 1 : 0.8;
      const range = noise.radius * this.config.hearing * wallFactor;
      if (d > range) continue;
      const strength = (range - d) / range + (noise.radius > 10 ? 0.25 : 0);
      if (strength > bestStrength) { best = noise; bestStrength = strength; }
    }
    m._heardNoiseId = this._nextNoiseId - 1;
    if (!best || visible) return;
    m._lastNoiseAt = this.time;
    m.alertness = Math.max(m.alertness, 0.6 + bestStrength * 0.25);
    // Chase memory beats tiny footsteps; distinct furniture or object sounds can update a search.
    if (m.state === 'pursue' && best.radius < 10) return;
    if (m.state === 'search' && best.radius < 5) return;
    const error = 0.8 + distance(m, best) * 0.08;
    const angle = this.random() * Math.PI * 2;
    const offset = this.random() * error;
    const guess = nearestWalkable(best.x + Math.cos(angle) * offset, best.z + Math.sin(angle) * offset);
    if (m.state !== 'investigate' || !m.target || distance(m.target, guess) > 3) {
      this._event(`The monster hears ${best.type.toLowerCase()} and investigates.`, 'sound');
    }
    m.state = 'investigate'; m._checking = null;
    this._setTarget(m, guess, true);
  }

  _choosePatrol() {
    const m = this.monster;
    const available = this._patrolPoints.map((point, index) => ({ point, index }))
      .filter(p => distance(m, p.point) > 5 && !m._patrolVisited.includes(p.index));
    if (!available.length) { m._patrolVisited = []; return this._choosePatrol(); }
    // Nearby rooms are preferred, with enough variation to avoid a repeating circuit.
    const ranked = available.map(p => ({ ...p, score: distance(m, p.point) * (0.5 + this.random()) }))
      .sort((a, b) => a.score - b.score);
    const selected = ranked[Math.floor(this.random() * Math.min(3, ranked.length))];
    m._patrolVisited.push(selected.index);
    if (m._patrolVisited.length > 5) m._patrolVisited.shift();
    m.state = 'patrol'; m._checking = null; m._checkQueue = [];
    m._patrolScanUntil = 0;
    this._setTarget(m, selected.point, true);
  }

  _beginSearch(origin, reason) {
    const m = this.monster;
    m.state = 'search'; m.label = 'Checking nearby hiding places';
    m._searchOrigin = pointCopy(origin);
    m._searchEnds = this.time + this.config.searchTime;
    m._checking = null;
    m._checkQueue = HIDING_SPOTS.map(spot => ({ spot, d: distance(origin, spot) }))
      .filter(c => c.d < 8.5)
      .map(c => ({ ...c, score: c.d + this.random() * 4.5 }))
      .sort((a, b) => a.score - b.score)
      .slice(0, this.config.hideChecks).map(c => c.spot);
    this.stats.searches++;
    this._event(`The monster searches around the ${reason}.`, 'search');
    this._nextSearchSpot();
  }

  _nextSearchSpot() {
    const m = this.monster;
    m._checking = null;
    if (!m._checkQueue.length) {
      const origin = m._searchOrigin;
      const angle = this.random() * Math.PI * 2;
      const roam = nearestWalkable(origin.x + Math.cos(angle) * 4, origin.z + Math.sin(angle) * 4);
      this._setTarget(m, roam, true);
      return;
    }
    const spot = m._checkQueue.shift();
    m._checking = spot;
    m._checkStarted = 0;
    this._setTarget(m, spot, true);
  }

  _updateSearch(dt) {
    const m = this.monster;
    m.alertness = Math.max(0.2, m.alertness - dt * 0.024);
    if (this.time >= m._searchEnds) {
      m.lastSeen = null; m.memoryRemaining = 0;
      this._choosePatrol();
      return;
    }
    if (m._checking) {
      const spot = m._checking;
      m.label = `Checking ${spot.type === 'bed' ? 'under a bed' : 'a closet'}`;
      if (distance(m, spot) < 0.65) {
        m.speed = 0;
        m.heading += dt * 0.7;
        if (!m._checkStarted) m._checkStarted = this.time;
        if (this.time - m._checkStarted > 1.9) {
          this.stats.hidingChecks++;
          if (this.survivor.hidden && this.survivor.hidingSpotId === spot.id) {
            this._event('The monster discovers the occupied hiding place.', 'caught');
            this._catchSurvivor();
            return;
          }
          this._nextSearchSpot();
        }
      } else this._move(m, this.config.searchSpeed, dt);
    } else {
      m.label = 'Sweeping the nearby rooms';
      this._move(m, 1.65, dt);
      if (!m._path.length) { m.heading += dt * 0.9; m.speed = 0; }
    }
  }

  _catchSurvivor() {
    const s = this.survivor, m = this.monster;
    if (this.status !== 'running' || s.graceRemaining > 0) return;
    s.lives--; this.stats.catches++;
    s.hidden = false; s.hidingSpotId = null; s._escapeProgress = 0;
    this._event(`The monster caught the survivor. ${s.lives} ${s.lives === 1 ? 'life remains' : 'lives remain'}.`, 'caught');
    if (s.lives <= 0) {
      this.status = 'lost'; s.state = 'caught'; s.label = 'No lives left'; s.speed = 0;
      m.state = 'victory'; m.label = 'The house keeps its survivor'; m.speed = 0;
      return;
    }
    const candidates = this._patrolPoints.map(point => ({ point, d: distance(point, m), score: this.random() }))
      .filter(c => c.d > 13 && c.d < 26 && !lineOfSight(c.point, m)).sort((a, b) => b.score - a.score);
    if (!candidates.length) candidates.push({ point: SURVIVOR_SPAWN });
    const safe = candidates[0].point;
    s.x = safe.x; s.z = safe.z; s.graceRemaining = 4;
    s.state = 'recover'; s.label = 'Recovering in a safe room';
    s._path = []; s._pathTarget = null; s.target = null;
    s._dangerUntil = 0; s._lastMonsterSeen = null; s._lastMonsterHeardAt = -100;
    s._hideGoal = null; s._decisionAt = 0; s._interaction = 0; s._interactId = null;
    s._pauseUntil = this.time + 1.1;
    m.lastSeen = null; m.memoryRemaining = 0; m.alertness = 0.3;
    this._choosePatrol();
  }

  snapshot() {
    const publicActor = actor => structuredClone(Object.fromEntries(Object.entries(actor).filter(([key]) => !key.startsWith('_'))));
    return {
      time: this.time, status: this.status, seed: this.seed, difficulty: this.difficulty,
      survivor: publicActor(this.survivor), monster: publicActor(this.monster),
      items: this.items.map(i => ({ ...i })), noises: this.noises.map(n => ({ ...n })),
      stats: { ...this.stats }, events: this.events.map(e => ({ ...e })),
    };
  }
}
