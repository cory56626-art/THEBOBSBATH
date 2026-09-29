import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };
export const DT = 1 / 90;
const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const PLAYER = (2 << 16) | (1 | 4);
const WORLD = (1 << 16) | (2 | 4);
const CHIMP = (4 << 16) | (1 | 2);
const S = RAPIER.ColliderDesc;

const spaced = (count, step, y, variation = []) => Array.from({ length: count }, (_, i) => ({
  x: i * step, y: y + (variation[i] || 0), z: 0
}));

export const MAPS = [
  { id: 'classic', name: 'Classic Bars', detail: 'the open concrete park', theme: 'sky',
    bars: spaced(20, .90, 5.12, [0, -.12, .10, 0, -.18, .10, 0, .05, -.12, 0, .08, 0]),
    floor: [[-3, 23, 0]], blocks: [[5.8, .75, .75], [13.8, .8, 1.0]], springs: [] },
  { id: 'roof', name: 'Rooftop Lines', detail: 'ledges, gaps, and long shadows', theme: 'sunset',
    bars: spaced(20, .90, 5.12, [0, 0, -.16, -.20, .12, .16, 0, -.1, .08, .15, -.14, 0]),
    floor: [[-3, 5.4, 0], [6.1, 12.9, .55], [13.7, 23, .25]], blocks: [[8.2, .7, 1.1]], springs: [] },
  { id: 'tramp', name: 'Trampoline Yard', detail: 'elastic landings and tumbling', theme: 'sky',
    bars: spaced(20, .90, 5.12, [0, -.15, .04, -.2, 0, .18, -.1, .06, -.12, .12, 0, -.1]),
    floor: [[-3, 23, 0]], blocks: [], springs: [[3.6, 1.35], [10.7, 1.4], [17.6, 1.35]] },
  { id: 'gym', name: 'Concrete Gym', detail: 'pillars and raised platforms', theme: 'cloud',
    bars: spaced(20, .90, 5.12, [0, -.1, .16, .12, -.1, 0, .17, .12, -.06, .08, 0, -.1]),
    floor: [[-3, 23, 0]], blocks: [[4.6, .8, 1.2], [9.9, 1.05, 1.65], [16.2, .7, 1.3]], springs: [] },
  { id: 'neon', name: 'Neon Underpass', detail: 'glowing bars after dark', theme: 'night',
    bars: spaced(20, .90, 5.12, [0, .1, -.05, .12, -.08, 0, .1, -.12, .1, 0, -.1, 0]),
    floor: [[-3, 23, 0]], blocks: [[7.3, .7, .75], [15, .75, .8]], springs: [[11.7, 1.35]] },
  { id: 'grove', name: 'Canopy Grove', detail: 'swing under the trees', theme: 'grove',
    bars: spaced(20, .90, 5.12, [0, -.12, .14, 0, .08, -.08, .16, .05, -.15, .1, 0, .08]),
    floor: [[-3, 23, 0]], blocks: [[9.4, .6, .75]], springs: [[14.9, 1.3]] },
  { id: 'chimp', name: 'Chimp Chase', detail: 'the chimp climbs after you', theme: 'grove', chimp: true,
    bars: spaced(22, .88, 5.12, [0, -.08, .1, -.16, .10, -.08, .12, 0, -.1, .08, -.16, .1, 0]),
    floor: [[-3, 25, 0]], blocks: [[7.6, .6, .7], [15.4, .7, .8]], springs: [[18.4, 1.25]] }
];

export async function initializePhysics() { await RAPIER.init(); }

export class Simulation {
  constructor(map) {
    this.map = map;
    this.world = new RAPIER.World(V(0, -9.81, 0));
    this.world.timestep = DT;
    this.world.numSolverIterations = 10;
    this.world.maxCcdSubsteps = 3;
    this.bodies = [];
    this.barBodies = [];
    this.grips = [];
    this.pose = 'loose';
    this.grabOpen = false;
    this.regrabs = 0;
    this.flips = 0;
    this.rotationSum = 0;
    this.lastAngle = null;
    this.events = [];
    this.clock = 0;
    this.chimp = null;
    this.chimpClimb = null;
    this.caught = false;
    this.escaped = false;
    this.createStage();
    this.createRagdoll();
    if (map.chimp) this.createChimp();
  }
  dispose() { this.world.free(); }
  body(name, x, y, z, shape, mass, material = {}) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z).setLinearDamping(.035).setAngularDamping(.11)
      .setAdditionalSolverIterations(5).setCcdEnabled(true));
    const collider = this.world.createCollider(shape.setMass(mass).setFriction(material.friction ?? .66)
      .setRestitution(material.bounce ?? .03).setCollisionGroups(PLAYER), body);
    const part = { name, body, collider };
    this.bodies.push(part);
    return part;
  }
  fixedBox(x, y, z, hx, hy, hz, bounce = .06) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    this.world.createCollider(S.cuboid(hx, hy, hz).setFriction(.84).setRestitution(bounce).setCollisionGroups(WORLD), body);
    return body;
  }
  createStage() {
    for (const [a, b, height] of this.map.floor)
      this.fixedBox((a + b) / 2, height - .36, 0, (b - a) / 2, .36, 3.3);
    for (const [x, width, height] of this.map.blocks)
      this.fixedBox(x, height / 2, 0, width / 2, height / 2, 1.15);
    for (const [x, width] of this.map.springs)
      this.fixedBox(x, .11, 0, width / 2, .11, 1.25, 1.35);
    for (const [i, bar] of this.map.bars.entries()) {
      const body = this.fixedBox(bar.x, bar.y, 0, .095, .095, 1.55);
      this.barBodies.push({ ...bar, body });
      if (i % 3 === 0 || i === this.map.bars.length - 1)
        for (const z of [-1.48, 1.48])
          this.fixedBox(bar.x, bar.y / 2, z, .12, bar.y / 2, .12);
    }
  }
  joint(a, b, anchorA, anchorB, type = 'spherical') {
    const data = type === 'revolute'
      ? RAPIER.JointData.revolute(anchorA, anchorB, V(0, 0, 1))
      : RAPIER.JointData.spherical(anchorA, anchorB);
    const joint = this.world.createImpulseJoint(data, a.body, b.body, true);
    joint.setContactsEnabled(false);
    return joint;
  }
  motor(joint, maxForce, arch, tuck) {
    joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    joint.configureMotorPosition(0, 50, 8);
    joint.setMotorMaxForce(0);
    return { joint, maxForce, arch, tuck };
  }
  createRagdoll() {
    const x = this.map.bars[0].x, z = 0;
    this.torso = this.body('torso', x, 3.60, z, S.capsule(.31, .22), 3.6);
    const pelvis = this.body('pelvis', x, 3.02, z, S.capsule(.16, .20), 2.2);
    const head = this.body('head', x, 4.17, z, S.ball(.23), 1.15);
    this.joint(this.torso, head, V(0, .33, 0), V(0, -.24, 0));
    const motors = [];
    const spine = this.joint(this.torso, pelvis, V(0, -.34, 0), V(0, .24, 0), 'revolute');
    spine.setLimits(-.7, .8); motors.push(this.motor(spine, 80, -.48, .67));
    this.arms = [];
    this.legs = [];
    for (const side of [-1, 1]) {
      const armZ = side * .29;
      const upper = this.body('upperArm', x, 4.20, armZ, S.capsule(.25, .105), .72);
      const fore = this.body('forearm', x, 4.77, armZ, S.capsule(.24, .095), .62);
      const shoulder = this.joint(this.torso, upper, V(0, .31, armZ), V(0, -.29, 0), 'revolute');
      shoulder.setLimits(-1.25, 1.25);
      motors.push(this.motor(shoulder, 78, -1.05, .75));
      const elbow = this.joint(upper, fore, V(0, .29, 0), V(0, -.28, 0), 'revolute');
      elbow.setLimits(-.2, 1.9);
      motors.push(this.motor(elbow, 32, -.12, .75));
      this.arms.push({ side, upper, fore, elbow });
      const legZ = side * .17;
      const thigh = this.body('thigh', x, 2.55, legZ, S.capsule(.24, .14), 1.28);
      const shin = this.body('shin', x, 2.01, legZ, S.capsule(.23, .115), 1.02);
      const hip = this.joint(pelvis, thigh, V(0, -.19, legZ), V(0, .28, 0), 'revolute');
      hip.setLimits(-.6, 1.75); motors.push(this.motor(hip, 49, -.30, 1.42));
      const knee = this.joint(thigh, shin, V(0, -.28, 0), V(0, .26, 0), 'revolute');
      knee.setLimits(-1.7, .2); motors.push(this.motor(knee, 30, .05, -1.25));
      this.legs.push({ side, thigh, shin, hip, knee });
    }
    this.motors = motors;
    // Start displaced from the vertical. Gravity, rather than a launch impulse,
    // begins the first swing. Every rigid body shares the same initial rotation.
    const angle = -.68, pivotY = this.map.bars[0].y - .05;
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const rotation = { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) };
    for (const part of this.bodies) {
      const p = part.body.translation(), dx = p.x - x, dy = p.y - pivotY;
      part.body.setTranslation(V(x + dx * cs - dy * sn, pivotY + dx * sn + dy * cs, p.z), true);
      part.body.setRotation(rotation, true);
    }
    this.gripNearest(true);
  }
  handPoint(arm) {
    const p = arm.fore.body.translation();
    const q = arm.fore.body.rotation();
    // Rapier rotations are read as quaternions; compute the top end directly.
    const v = rotate(V(0, .30, 0), q);
    return V(p.x + v.x, p.y + v.y, p.z + v.z);
  }
  gripNearest(initial = false) {
    if (this.grabOpen) return false;
    let grabbed = false;
    for (const arm of this.arms) {
      if (this.grips.some(g => g.arm === arm)) continue;
      const hand = this.handPoint(arm);
      let target = null, best = initial ? .25 : .32;
      for (const bar of this.barBodies) {
        if (arm.blockedBar === bar && this.clock < arm.blockedUntil) continue;
        const z = Math.max(-1.44, Math.min(1.44, hand.z));
        const d = Math.hypot(hand.x - bar.x, hand.y - bar.y, hand.z - z);
        if (d < best) { best = d; target = { bar, z }; }
      }
      if (target) {
        const anchor = V(0, .30, 0);
        const data = RAPIER.JointData.spherical(anchor, V(0, 0, target.z));
        const joint = this.world.createImpulseJoint(data, arm.fore.body, target.bar.body, true);
        joint.setContactsEnabled(false);
        this.grips.push({ arm, bar: target.bar, joint });
        grabbed = true;
      }
    }
    if (grabbed && !initial) { this.regrabs++; this.events.push('regrab'); }
    return grabbed;
  }
  release() {
    this.grabOpen = true;
    for (const arm of this.arms) this.releaseArm(arm);
  }
  releaseArm(arm) {
    const index = this.grips.findIndex(g => g.arm === arm);
    if (index < 0) return;
    const [grip] = this.grips.splice(index, 1);
    arm.blockedBar = grip.bar;
    arm.blockedUntil = this.clock + .72;
    this.world.removeImpulseJoint(grip.joint, true);
  }
  closeHands() { this.grabOpen = false; this.gripNearest(); }
  setPose(pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this.motors.forEach(({ joint, maxForce, arch, tuck }) => {
      joint.configureMotorPosition(pose === 'tuck' ? tuck : pose === 'arch' ? arch : 0, 56, 9);
      joint.setMotorMaxForce(pose === 'loose' ? 0 : maxForce);
    });
  }
  createChimp() {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(-2.65, .46, 0).setLinearDamping(.32).setAngularDamping(.18).setCcdEnabled(true));
    this.world.createCollider(S.ball(.42).setMass(5.5).setFriction(1.25)
      .setRestitution(.02).setCollisionGroups(CHIMP), body);
    this.chimp = body;
  }
  updateChimp(dt) {
    if (!this.chimp || this.caught || this.escaped) return;
    const c = this.chimp.translation(), p = this.torso.body.translation();
    const climbBar = this.barBodies.find(b => Math.abs(b.x - c.x) < .22 &&
      Math.abs(p.x - b.x) < 2.1 && p.y > c.y + 1.1);
    if (this.chimpClimb) {
      const climb = this.chimpClimb;
      if (c.y > Math.min(climb.bar.y - .4, p.y + .34) || p.y < c.y - 1.2) {
        this.world.removeImpulseJoint(climb.joint, true); this.chimpClimb = null;
      }
    } else if (climbBar && c.y < climbBar.y - .6) {
      // A prismatic joint is a physical grip on the pillar. Its motor lifts the chimp.
      const anchor = V(c.x - climbBar.x, c.y - climbBar.y, c.z);
      const joint = this.world.createImpulseJoint(
        RAPIER.JointData.prismatic(anchor, V(), V(0, 1, 0)), climbBar.body, this.chimp, true);
      joint.setContactsEnabled(false);
      joint.configureMotorVelocity(2.4, 15);
      joint.setMotorMaxForce(1000);
      this.chimpClimb = { bar: climbBar, joint };
    }
    if (!this.chimpClimb && Math.abs(p.x - c.x) > .12) {
      // Rolling torque acts through ground friction; no position or velocity is assigned.
      this.chimp.addTorque(V(0, 0, p.x > c.x ? -9 : 9), true);
    }
    const distance = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    if (distance < .77) { this.caught = true; this.events.push('caught'); }
    if (p.x > this.map.bars.at(-1).x + 1.45) { this.escaped = true; this.events.push('escaped'); }
  }
  step(input) {
    this.clock += DT;
    this.setPose(input.pose);
    if (input.release && !this.grabOpen) this.release();
    if (!input.release && this.grabOpen) this.closeHands();
    if (!this.grabOpen) this.gripNearest();
    this.updateChimp(DT);
    this.world.step();
    const q = this.torso.body.rotation();
    const angle = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
    if (this.lastAngle !== null) {
      let delta = angle - this.lastAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.rotationSum += delta;
      const turns = Math.floor(Math.abs(this.rotationSum) / (Math.PI * 2));
      if (turns > this.flips) { this.flips = turns; this.events.push('flip'); }
    }
    this.lastAngle = angle;
  }
  snapshot() {
    const pos = this.torso.body.translation(), vel = this.torso.body.linvel();
    return { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y,
      grip: this.grips.length, bar: this.grips[0]?.bar.x ?? null,
      chimpX: this.chimp?.translation().x, chimpY: this.chimp?.translation().y,
      caught: this.caught, escaped: this.escaped, regrabs: this.regrabs, flips: this.flips };
  }
}

function rotate(v, q) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return V(v.x + q.w * tx + q.y * tz - q.z * ty,
    v.y + q.w * ty + q.z * tx - q.x * tz,
    v.z + q.w * tz + q.x * ty - q.y * tx);
}
