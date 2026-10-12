const $ = id => document.getElementById(id);
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646 + 1;
let sim, renderer, layout, started = false, paused = false, speed = 1, cameraMode = 'overview', showPerception = false, resultShown = false;
let lastFrame = performance.now(), uiTime = 0, accumulator = 0, helpWasPaused = false, lastFocus;
let Simulation, audio;

function setCamera(mode) {
  cameraMode = mode;
  renderer?.setCameraMode(mode);
  document.querySelectorAll('[data-camera]').forEach(button => {
    const active = button.dataset.camera === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('viewport-note').textContent = mode === 'overview' ? 'DRAG TO ORBIT · SCROLL TO ZOOM' : 'FOLLOW CAMERA · DRAG TO LOOK AROUND';
}

function setPaused(value) {
  paused = value;
  document.body.classList.toggle('paused', value);
  $('pause-button').innerHTML = value
    ? '<svg viewBox="0 0 18 18" width="13" height="13" aria-hidden="true"><path d="m5 3 10 6-10 6Z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 18 18" width="13" height="13" aria-hidden="true"><path d="M5 3v12M13 3v12" stroke="currentColor" stroke-width="2"/></svg>';
  $('pause-button').setAttribute('aria-label', value ? 'Resume simulation' : 'Pause simulation');
  updateUI();
}

function start(fresh = false) {
  if (!renderer) return;
  if (fresh) sim = new Simulation({ seed: freshSeed(), difficulty: $('difficulty').value });
  started = true;
  paused = false;
  resultShown = false;
  accumulator = 0;
  $('intro').hidden = true;
  $('intro-caption').hidden = true;
  $('session').hidden = false;
  $('result').hidden = true;
  document.body.classList.add('playing');
  setPaused(false);
  updateUI();
  $('pause-button').focus({ preventScroll: true });
}

function togglePerception() {
  showPerception = !showPerception;
  renderer?.setPerception(showPerception);
  $('perception-button').setAttribute('aria-pressed', String(showPerception));
}

function showModal(id) {
  lastFocus = document.activeElement;
  $(id).hidden = false;
  $(id).querySelector('button').focus({ preventScroll: true });
}

function closeHelp() {
  $('help').hidden = true;
  setPaused(helpWasPaused);
  lastFocus?.focus({ preventScroll: true });
}

function showResult() {
  resultShown = true;
  const escaped = sim.status === 'escaped';
  $('result-title').textContent = escaped ? 'The door opened.' : 'The house kept its guest.';
  $('result-description').textContent = escaped
    ? `The survivor found all three objects and escaped in ${clock(sim.time)}, with ${sim.survivor.lives} ${sim.survivor.lives === 1 ? 'life' : 'lives'} left. A little distance. A lost trail. One final door.`
    : `Three chances, and the resident found them all. The survivor recovered ${sim.items.filter(item => item.collected).length} of three escape objects. A new attempt brings different decisions.`;
  $('result-stats').replaceChildren();
  for (const [value, label] of [[clock(sim.time), 'ELAPSED'], [sim.stats?.chases ?? 0, 'CHASES'], [sim.stats?.searches ?? 0, 'SEARCHES']]) {
    const box = document.createElement('div');
    const b = document.createElement('b'); b.textContent = value;
    const text = document.createElement('span'); text.textContent = label;
    box.append(b, text); $('result-stats').append(box);
  }
  showModal('result');
}

function roomAt(actor) {
  return layout.ROOMS.find(room => Math.abs(actor.x - room.x) < room.w / 2 && Math.abs(actor.z - room.z) < room.d / 2)?.name || 'Connecting hall';
}

function updateUI() {
  if (!sim) return;
  const survivor = sim.survivor, monster = sim.monster;
  const terminal = sim.status === 'escaped' || sim.status === 'lost';
  audio?.update(sim, paused || !started);
  $('live-label').textContent = !started ? 'AWAITING OBSERVATION' : terminal ? 'OBSERVATION COMPLETE' : paused ? 'OBSERVATION PAUSED' : 'LIVE OBSERVATION';
  $('clock').textContent = clock(sim.time);
  $('seed-label').textContent = String(sim.seed).slice(-6).padStart(6, '0');
  $('survivor-state').textContent = survivor.label || survivor.state;
  $('survivor-detail').textContent = `${roomAt(survivor)} · ${survivor.hidden ? 'Concealed' : 'Moving through the house'}`;
  $('monster-state').textContent = monster.label || monster.state;
  const monsterDetails = {
    patrol: 'Listening for a reason to move.', patrolling: 'Listening for a reason to move.',
    investigate: 'Following a sound, not a location.', investigating: 'Following a sound, not a location.',
    chase: 'A clear sighting. The hunt is on.', chasing: 'A clear sighting. The hunt is on.',
    search: 'Checking the area for a lost trail.', searching: 'Checking the area for a lost trail.'
  };
  $('monster-detail').textContent = monsterDetails[monster.state] || roomAt(monster);
  const memory = Math.max(0, monster.memoryRemaining || 0);
  $('memory-value').textContent = memory > 0 ? `${memory.toFixed(1)} S` : 'NO TRACE';
  $('memory-fill').style.width = `${Math.min(100, memory / (sim.config?.memory || 8) * 100)}%`;
  $('lives').textContent = Array.from({ length: 3 }, (_, i) => i < survivor.lives ? '●' : '○').join(' ');
  $('lives').setAttribute('aria-label', `${survivor.lives} lives remaining`);
  const labels = sim.items.map(item => `${item.id}:${item.collected}`).join('|');
  if ($('items').dataset.state !== labels) {
    $('items').dataset.state = labels;
    $('items').replaceChildren();
    for (const item of sim.items) {
      const chip = document.createElement('div'); chip.className = `item${item.collected ? ' found' : ''}`;
      chip.title = `${item.label}: ${item.collected ? 'found' : 'missing'}`;
      const icon = document.createElement('b'); icon.textContent = item.collected ? '✓' : '◇';
      const name = document.createElement('span'); name.textContent = item.label;
      chip.append(icon, name); $('items').append(chip);
    }
  }
  $('session-message').textContent = terminal ? (sim.status === 'escaped' ? 'The survivor escaped' : 'No lives remaining') : paused ? 'Time stands still' : survivor.hidden ? 'Waiting out the hunt' : sim.items.every(item => item.collected) ? 'The final door is waiting' : 'Searching for a way out';
  const events = sim.events || [];
  const eventKey = events.length ? `${events.length}:${events.at(-1).time}:${events.at(-1).text}` : '';
  if ($('journal').dataset.state !== eventKey) {
    $('journal').dataset.state = eventKey;
    $('journal').replaceChildren();
    for (const event of events.slice(-4).reverse()) {
      const row = document.createElement('li');
      row.className = ['catch', 'caught', 'chase', 'danger'].includes(event.kind) ? 'danger' : '';
      const time = document.createElement('time'); time.textContent = clock(event.time || 0);
      const text = document.createElement('span'); text.textContent = event.text;
      row.append(time, text); $('journal').append(row);
    }
    $('event-count').textContent = String(events.length).padStart(2, '0');
  }
  drawMap();
}

function drawMap() {
  const canvas = $('minimap'), ctx = canvas.getContext('2d');
  const scale = Math.min((canvas.width - 22) / layout.HOUSE.width, (canvas.height - 22) / layout.HOUSE.depth);
  const px = x => canvas.width / 2 + x * scale;
  const pz = z => canvas.height / 2 + z * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#232d26';
  ctx.fillRect(px(-layout.HOUSE.width / 2), pz(-layout.HOUSE.depth / 2), layout.HOUSE.width * scale, layout.HOUSE.depth * scale);
  for (const room of layout.ROOMS) {
    ctx.fillStyle = '#29352c'; ctx.fillRect(px(room.x - room.w / 2), pz(room.z - room.d / 2), room.w * scale, room.d * scale);
  }
  ctx.fillStyle = '#475343';
  for (const wall of layout.WALLS) ctx.fillRect(px(wall.x - wall.w / 2), pz(wall.z - wall.d / 2), Math.max(2, wall.w * scale), Math.max(2, wall.d * scale));
  ctx.fillStyle = '#343f33';
  for (const f of layout.FURNITURE) ctx.fillRect(px(f.x - f.w / 2), pz(f.z - f.d / 2), f.w * scale, f.d * scale);
  for (const item of sim.items) if (!item.collected) {
    ctx.fillStyle = '#c6b18d'; ctx.fillRect(px(item.x) - 2, pz(item.z) - 2, 4, 4);
  }
  ctx.strokeStyle = sim.items.every(i => i.collected) ? '#a2c9b9' : '#b89d75'; ctx.lineWidth = 2;
  ctx.strokeRect(px(layout.EXIT.x) - 7, pz(layout.EXIT.z) - 3, 14, 6);
  if (showPerception && sim.monster.lastSeen && sim.monster.memoryRemaining > 0) {
    ctx.strokeStyle = '#bd776873'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(px(sim.monster.lastSeen.x), pz(sim.monster.lastSeen.z), 9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const [actor, color] of [[sim.monster, '#d68b76'], [sim.survivor, '#b8efda']]) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px(actor.x), pz(actor.z), actor.hidden ? 3 : 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px(actor.x), pz(actor.z)); ctx.lineTo(px(actor.x) + Math.cos(actor.heading) * 8, pz(actor.z) + Math.sin(actor.heading) * 8); ctx.stroke();
  }
}

$('start-button').addEventListener('click', () => start());
$('restart-button').addEventListener('click', () => start(true));
$('again-button').addEventListener('click', () => start(true));
$('pause-button').addEventListener('click', () => setPaused(!paused));
$('speed').addEventListener('change', event => { speed = Number(event.target.value); });
$('perception-button').addEventListener('click', togglePerception);
document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => setCamera(button.dataset.camera)));
$('inspect-button').addEventListener('click', () => { $('result').hidden = true; $('restart-button').focus(); });
$('help-button').addEventListener('click', () => { helpWasPaused = paused; setPaused(true); showModal('help'); });
$('close-help').addEventListener('click', closeHelp);
$('quality').addEventListener('change', event => renderer?.setQuality?.(event.target.value));
$('sound-button').addEventListener('click', async () => {
  try {
    if (!audio) { const { HouseAudio } = await import('./audio.js'); audio = new HouseAudio(); }
    const enabled = await audio.toggle();
    $('sound-button').setAttribute('aria-pressed', String(enabled));
    $('sound-button').setAttribute('aria-label', enabled ? 'Mute house audio' : 'Enable house audio');
    $('sound-button').title = enabled ? 'Mute house audio' : 'Enable house audio';
  } catch {
    $('sound-button').disabled = true;
    $('sound-button').title = 'House audio is unavailable in this browser';
  }
});
$('fullscreen-button').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('app').requestFullscreen(); } catch { $('fullscreen-button').hidden = true; }
});
document.addEventListener('keydown', event => {
  const modal = !$('help').hidden ? $('help') : !$('result').hidden ? $('result') : null;
  if (modal) {
    if (event.key === 'Escape' && modal.id === 'help') { event.preventDefault(); closeHelp(); }
    if (event.key === 'Tab') {
      const controls = [...modal.querySelectorAll('button,select')];
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    }
    return;
  }
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) && event.key === ' ') return;
  if (!started || event.repeat) return;
  if (event.code === 'Space') { event.preventDefault(); setPaused(!paused); }
  if (event.code === 'KeyC') { const modes = ['overview', 'survivor', 'monster']; setCamera(modes[(modes.indexOf(cameraMode) + 1) % modes.length]); }
  if (event.code === 'KeyV') togglePerception();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && started) setPaused(true); });

async function boot() {
  try {
    const [simulationModule, renderingModule, layoutModule] = await Promise.all([import('./simulation.js'), import('./renderer.js'), import('./layout.js')]);
    Simulation = simulationModule.Simulation;
    layout = layoutModule;
    sim = new Simulation({ seed: freshSeed(), difficulty: 'balanced' });
    renderer = new renderingModule.HouseRenderer($('scene'));
    renderer.render(sim, 0, { cameraMode, showPerception });
    $('room-count').textContent = layout.ROOMS.filter(room => !room.id.startsWith('hall')).length;
    $('start-label').textContent = 'Begin observation';
    $('start-button').disabled = false;
    updateUI();
    // Introspection for reproducible browser QA. All gameplay remains local.
    window.bobsBath = { get simulation() { return sim; }, get renderer() { return renderer; }, get ready() { return !!renderer; }, get paused() { return paused; }, get started() { return started; } };
    requestAnimationFrame(frame);
  } catch (error) {
    console.error('The house could not start:', error);
    $('start-label').textContent = 'House unavailable';
    $('boot-error').textContent = `The 3D house could not load. ${/webgl|context/i.test(error.message) ? 'Please enable hardware acceleration or try a browser with WebGL support.' : 'Please reload the page. If it persists, try a current version of Chrome, Firefox, or Safari.'}`;
    $('boot-error').hidden = false;
  }
}

function frame(now) {
  const dt = Math.min(.08, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  const running = started && !paused && sim.status === 'running';
  if (running) {
    accumulator += dt * speed;
    while (accumulator >= 1 / 30 && sim.status === 'running') { sim.update(1 / 30); accumulator -= 1 / 30; }
  }
  renderer.render(sim, dt, { cameraMode, showPerception });
  uiTime += dt;
  if (uiTime > .15) { updateUI(); uiTime = 0; }
  if (started && !resultShown && ['escaped', 'lost'].includes(sim.status)) { updateUI(); showResult(); }
  requestAnimationFrame(frame);
}

boot();
