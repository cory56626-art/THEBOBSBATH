import { LIMIT, SAMPLES, tokenize, speechChunk, wordAtBoundary, wordDuration } from './reader-core.js';

const $ = id => document.getElementById(id);
const input = $('text-input');
const viewport = $('viewport');
const doc = $('document');
const canvas = $('creature');
const ctx = canvas.getContext('2d');
const synth = window.speechSynthesis;
const canSpeak = !!synth && 'SpeechSynthesisUtterance' in window;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const preferenceKey = 'bobsbath.crawler.v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}') || {}; } catch { /* Private browsing can disable storage. */ }
let words = [];
let spans = [];
let phase = 'ready';
let cursor = -1;
let visited = -1;
let positives = 0;
let negatives = 0;
let nextAt = 0;
let generation = 0;
let voiceRun = null;
let utterance = null; // Retain the live utterance until its callbacks finish.
let sampleIndex = 0;
let dirty = false;
let inputTimer;
let scrollUntil = 0;
let lastFrame = 0;
let width = 0;
let height = 0;
let crawler = { x: 130, y: 150, angle: 0, initialized: false };
let target = { x: 130, y: 150, w: 40, h: 28 };
let wordRects = [];
let scrollTarget = null;
let voices = [];

input.value = typeof saved.text === 'string' ? saved.text.slice(0, LIMIT) : SAMPLES[0];
$('speed').value = Number.isFinite(Number(saved.speed)) && Number(saved.speed) >= 70 && Number(saved.speed) <= 390 ? String(saved.speed) : '190';
$('voice').checked = canSpeak && saved.voice !== false;

function save() {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify({ text: input.value, speed: Number($('speed').value), voice: $('voice').checked, voiceName: $('voice-select').value }));
  } catch { /* The reader still works without storage. */ }
}

function announce(message) { $('announcement').textContent = message; }
function status(label) { $('state-label').textContent = label; }
function speed() { return Number($('speed').value); }
function formatCount(n) { return String(n).padStart(3, '0'); }

function setPhase(value) {
  phase = value;
  document.body.classList.toggle('is-running', value === 'running');
  $('pause').disabled = value === 'ready' || value === 'finished' || !words.length;
  $('pause').innerHTML = value === 'paused' ? 'Resume <span aria-hidden="true">▶</span>' : 'Pause <span aria-hidden="true">Ⅱ</span>';
  $('start-label').textContent = value === 'finished' ? 'Crawl again' : value === 'paused' && !dirty ? 'Keep crawling' : value === 'running' && !dirty ? 'Restart crawling' : 'Start crawling';
  status(value === 'running' ? 'SCANNING YOUR WORDS' : value === 'paused' ? 'TAKING A BREATHER' : value === 'finished' ? 'EVERY WORD FOUND' : 'READY TO READ');
}

function stopSpeech() {
  generation++;
  voiceRun = null;
  if (utterance) {
    utterance.onend = utterance.onerror = utterance.onboundary = utterance.onstart = null;
    utterance = null;
  }
  if (canSpeak) synth.cancel();
}

function renderText(text) {
  stopSpeech();
  const bounded = text.slice(0, LIMIT);
  words = tokenize(bounded);
  spans = [];
  let at = 0;
  const fragment = document.createDocumentFragment();
  for (const word of words) {
    fragment.append(document.createTextNode(bounded.slice(at, word.offset)));
    const span = document.createElement('span');
    span.className = `token ${word.signal}`;
    span.textContent = word.text;
    span.dataset.word = String(spans.length);
    fragment.append(span);
    spans.push(span);
    at = word.offset + word.text.length;
  }
  fragment.append(document.createTextNode(bounded.slice(at)));
  doc.replaceChildren(fragment);
  cursor = visited = -1;
  positives = negatives = 0;
  viewport.scrollTop = 0;
  scrollTarget = null;
  crawler.initialized = false;
  $('love-count').textContent = $('hate-count').textContent = '000';
  $('love-word').textContent = $('hate-word').textContent = '—';
  $('reader-empty').hidden = words.length > 0;
  $('current-word').textContent = words.length ? 'AWAITING INPUT' : 'WAITING FOR WORDS';
  $('read-count').textContent = `000 / ${formatCount(words.length)} WORDS`;
  $('progress').style.width = '0%';
  document.querySelector('[role=progressbar]').setAttribute('aria-valuenow', '0');
  $('start').disabled = words.length === 0;
  $('restart').disabled = words.length === 0;
  dirty = false;
  setPhase('ready');
  requestAnimationFrame(measure);
}

function measure() {
  const rect = viewport.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  // Cache word positions. Scrolling only subtracts scrollTop; no layout reads per frame.
  wordRects = spans.map(span => {
    const r = span.getClientRects()[0] || span.getBoundingClientRect();
    return { x: r.left - rect.left, y: r.top - rect.top + viewport.scrollTop, w: r.width, h: r.height };
  });
  if (cursor >= 0) trackWord(false);
}

function trackWord(follow = true) {
  const rect = wordRects[Math.max(0, cursor)];
  if (!rect) return;
  if (follow && performance.now() > scrollUntil) {
    const top = rect.y - viewport.scrollTop;
    if (top < height * .24 || top > height * .68) {
      scrollTarget = Math.max(0, Math.min(viewport.scrollHeight - height, rect.y - height * .44));
    }
  }
}

function visit(index) {
  if (!words.length || index < 0 || index >= words.length) return;
  if (cursor >= 0) spans[cursor]?.classList.remove('active');
  cursor = index;
  // Boundary events may skip words; every passed word still counts exactly once.
  for (let i = visited + 1; i <= index; i++) {
    spans[i].classList.add('read');
    if (words[i].signal === 'positive') { positives++; $('love-word').textContent = words[i].text.toLocaleUpperCase(); }
    if (words[i].signal === 'negative') { negatives++; $('hate-word').textContent = words[i].text.toLocaleUpperCase(); }
  }
  visited = Math.max(visited, index);
  spans[index].classList.add('active');
  $('love-count').textContent = formatCount(positives);
  $('hate-count').textContent = formatCount(negatives);
  $('read-count').textContent = `${formatCount(index + 1)} / ${formatCount(words.length)} WORDS`;
  $('current-word').textContent = words[index].text.toLocaleUpperCase();
  const pct = Math.round((index + 1) / words.length * 100);
  $('progress').style.width = `${pct}%`;
  document.querySelector('[role=progressbar]').setAttribute('aria-valuenow', String(pct));
  trackWord();
}

function finish() {
  stopSpeech();
  setPhase('finished');
  announce(`Finished reading ${words.length} words.`);
}

function speechFailed(message) {
  stopSpeech();
  $('voice-note').textContent = message;
  $('voice').checked = false;
  $('voice-select').disabled = true;
  if (phase === 'running') nextAt = performance.now() + wordDuration(words[cursor]?.text || '', speed());
}

function speakFrom(index) {
  if (!canSpeak || !$('voice').checked || phase !== 'running') return;
  const chunk = speechChunk(words, index);
  if (chunk.text.length > 1000) {
    speechFailed('This word is too long for a voice. Continuing with visual reading.');
    return;
  }
  const ticket = generation;
  const u = new SpeechSynthesisUtterance(chunk.text);
  utterance = u;
  const selected = voices.find(v => v.name === $('voice-select').value);
  if (selected) { u.voice = selected; u.lang = selected.lang; }
  u.rate = speed() / 190;
  const now = performance.now();
  const run = { ...chunk, nativeBoundary: false, started: false, begun: now, lastEvent: now, duration: chunk.text.length * 95 / u.rate + 10000 };
  voiceRun = run;
  nextAt = now + wordDuration(words[index].text, speed());
  u.onstart = () => {
    if (ticket !== generation || phase !== 'running') return;
    run.started = true;
    run.begun = run.lastEvent = performance.now();
    nextAt = performance.now() + wordDuration(words[index].text, speed());
  };
  u.onboundary = event => {
    if (ticket !== generation || phase !== 'running' || event.name === 'sentence') return;
    run.nativeBoundary = true;
    run.lastEvent = performance.now();
    const next = wordAtBoundary(chunk, event.charIndex);
    if (next >= cursor) visit(next);
  };
  u.onend = () => {
    if (ticket !== generation || phase !== 'running') return;
    voiceRun = null;
    utterance = null;
    visit(chunk.end);
    if (chunk.end + 1 >= words.length) finish();
    else { visit(chunk.end + 1); speakFrom(chunk.end + 1); }
  };
  u.onerror = event => {
    if (ticket !== generation || phase !== 'running') return;
    if (event.error === 'canceled' || event.error === 'interrupted') return;
    speechFailed('Voice is unavailable here. The crawler will keep reading visually.');
  };
  try { synth.speak(u); } catch { speechFailed('Voice is unavailable here. The crawler will keep reading visually.'); }
}

function begin(resume = false) {
  clearTimeout(inputTimer);
  if (dirty || !resume || phase === 'finished') renderText(input.value);
  if (!words.length) { announce('Add some text first.'); input.focus(); return; }
  stopSpeech();
  scrollUntil = 0;
  setPhase('running');
  visit(Math.max(0, cursor));
  nextAt = performance.now() + wordDuration(words[cursor].text, speed());
  if ($('voice').checked) speakFrom(cursor);
  save();
  if (window.matchMedia('(max-width: 600px)').matches) {
    document.querySelector('.reader-panel').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  }
  announce(resume ? 'Reading resumed.' : 'The crawler is reading your text.');
}

function pause() {
  if (phase === 'running') {
    stopSpeech();
    setPhase('paused');
    announce('Reading paused.');
  } else if (phase === 'paused') begin(true);
}

$('start').addEventListener('click', () => begin(phase === 'paused' && !dirty));
$('pause').addEventListener('click', pause);
$('restart').addEventListener('click', () => begin(false));
input.addEventListener('input', () => {
  if (phase === 'running') { stopSpeech(); setPhase('paused'); }
  dirty = true;
  $('input-count').textContent = `${tokenize(input.value).length} WORDS`;
  $('start-label').textContent = 'Start crawling';
  $('start').disabled = !input.value.trim();
  status('NEW WORDS WAITING');
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => { renderText(input.value); save(); }, 300);
});
$('clear').addEventListener('click', () => { clearTimeout(inputTimer); input.value = ''; $('input-count').textContent = '0 WORDS'; renderText(''); save(); input.focus(); });
$('sample').addEventListener('click', () => {
  clearTimeout(inputTimer);
  sampleIndex = (sampleIndex + 1) % SAMPLES.length;
  input.value = SAMPLES[sampleIndex];
  $('input-count').textContent = `${tokenize(input.value).length} WORDS`;
  renderText(input.value);
  save();
  announce('Sample loaded. Press Start crawling.');
});
$('speed').addEventListener('input', () => {
  $('speed-label').value = `${speed()} WPM`;
  nextAt = performance.now() + wordDuration(words[cursor]?.text || '', speed());
});
$('speed').addEventListener('change', () => {
  save();
  if (phase === 'running' && $('voice').checked) { stopSpeech(); speakFrom(Math.max(0, cursor)); }
});
$('voice').addEventListener('change', () => {
  $('voice-select').disabled = !$('voice').checked;
  $('voice-note').textContent = $('voice').checked ? 'Uses the voices available on your device.' : 'Sound off. The crawler will read visually.';
  stopSpeech();
  if (phase === 'running') {
    nextAt = performance.now() + wordDuration(words[cursor]?.text || '', speed());
    if ($('voice').checked) speakFrom(Math.max(0, cursor));
  }
  save();
});
$('voice-select').addEventListener('change', () => {
  save();
  if (phase === 'running' && $('voice').checked) { stopSpeech(); speakFrom(Math.max(0, cursor)); }
});

function loadVoices() {
  const previous = $('voice-select').value || saved.voiceName || '';
  voices = synth.getVoices();
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement('option');
  defaultOption.value = ''; defaultOption.textContent = 'Device default voice'; fragment.append(defaultOption);
  for (const voice of voices) {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} · ${voice.lang}`;
    fragment.append(option);
  }
  $('voice-select').replaceChildren(fragment);
  $('voice-select').value = voices.some(v => v.name === previous) ? previous : '';
}
if (canSpeak) { loadVoices(); synth.addEventListener('voiceschanged', loadVoices); }
else {
  $('voice').disabled = true;
  $('voice-note').textContent = 'This browser has no read-aloud voice. Visual reading still works.';
}
$('voice-select').disabled = !$('voice').checked;

function focusView(force) {
  const value = typeof force === 'boolean' ? force : !document.body.classList.contains('focus-mode');
  document.body.classList.toggle('focus-mode', value);
  $('focus').setAttribute('aria-pressed', String(value));
  $('focus').setAttribute('aria-label', value ? 'Exit expanded reader' : 'Expand reader');
  $('focus').title = value ? 'Exit expanded reader' : 'Expand reader';
  requestAnimationFrame(() => { measure(); trackWord(); });
}
$('focus').addEventListener('click', () => focusView());
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') focusView(false);
  const tag = e.target.tagName;
  if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag) && (phase === 'running' || phase === 'paused')) { e.preventDefault(); pause(); }
});
for (const name of ['wheel', 'touchstart', 'pointerdown']) viewport.addEventListener(name, () => { scrollUntil = performance.now() + 3500; scrollTarget = null; }, { passive: true });
doc.addEventListener('click', e => {
  const el = e.target.closest('[data-word]');
  if (!el || dirty) return;
  const index = Number(el.dataset.word);
  const wasRunning = phase === 'running';
  stopSpeech();
  // Rebuild the tally on backward seeks instead of counting the same word twice.
  spans.forEach(s => s.classList.remove('read', 'active'));
  cursor = visited = -1; positives = negatives = 0;
  $('love-word').textContent = $('hate-word').textContent = '—';
  visit(index);
  if (wasRunning) {
    nextAt = performance.now() + wordDuration(words[index].text, speed());
    if ($('voice').checked) speakFrom(index);
  } else setPhase('paused');
});
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'running') pause(); });
window.addEventListener('pagehide', stopSpeech);
new ResizeObserver(measure).observe(viewport);
if (document.fonts?.ready) document.fonts.ready.then(measure);

function draw(now, dt) {
  ctx.clearRect(0, 0, width, height);
  if (!words.length || !width || !height) return;
  const index = Math.max(0, cursor);
  const rect = wordRects[index];
  if (!rect) return;
  const t = now / 1000;
  const moving = phase === 'running' && !reducedMotion.matches;
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y - viewport.scrollTop + rect.h / 2;
  const drift = moving ? 1 : reducedMotion.matches ? 0 : .2;
  const spread = Math.min(1, width / 520);
  target = { x: centerX + (width < 400 ? 35 : 58) * (centerX > width * .6 ? -1 : 1), y: centerY - 18, w: rect.w, h: rect.h };
  if (!crawler.initialized) { crawler.x = target.x; crawler.y = target.y; crawler.initialized = true; }
  const lerp = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 7);
  crawler.x += (target.x - crawler.x) * lerp;
  crawler.y += (target.y - crawler.y) * lerp;
  if (crawler.y < -180 || crawler.y > height + 180) return;
  const bx = crawler.x + Math.sin(t * 3.6) * 2 * drift;
  const by = crawler.y + Math.cos(t * 4.1) * 3 * drift;
  const color = words[index].signal === 'negative' ? '#6825fa' : '#ed00ac';
  const points = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const leg = i % 4;
    const linkedIndex = Math.max(0, Math.min(words.length - 1, index + leg * 2 - 2 + (side > 0 ? 3 : 0)));
    const linked = wordRects[linkedIndex] || rect;
    const gait = Math.sin(t * (moving ? 5 : 1.1) + i * 2.4) * drift;
    const footX = Math.max(8, Math.min(width - 8, linked.x + linked.w * (side > 0 ? .9 : .1) + side * (22 + leg * 5) * spread + gait * 10));
    const footY = linked.y - viewport.scrollTop + linked.h * .7 + ((leg % 2) ? 20 : -16) * spread + Math.cos(t * 3 + i) * 5 * drift;
    const kneeX = bx + side * (58 + leg * 19) * spread + gait * 14;
    const kneeY = by + (leg - 1.5) * 39 * spread - Math.abs(gait) * 10;
    points.push({ footX, footY, kneeX, kneeY, side, leg });
    ctx.beginPath();ctx.moveTo(bx + side * 4, by + (leg - 1.5) * 5);ctx.lineTo(kneeX, kneeY);ctx.lineTo(footX, footY);
    ctx.strokeStyle = '#1d201de6';ctx.lineWidth = leg % 2 ? 1 : 1.4;ctx.stroke();
    ctx.fillStyle = '#ed00ac';ctx.fillRect(kneeX - 1.6, kneeY - 1.6, 3.2, 3.2);
    ctx.beginPath();ctx.arc(footX, footY, 1.7, 0, Math.PI * 2);ctx.fill();
    // Faint triangulated threads follow the legs, as in the reference.
    if (i > 0) {
      ctx.beginPath();ctx.moveTo(footX, footY);ctx.lineTo(points[i - 1].kneeX, points[i - 1].kneeY);ctx.strokeStyle = '#6825fa32';ctx.lineWidth = .6;ctx.stroke();
    }
  }
  ctx.save();ctx.translate(bx, by);
  const tilt = Math.max(-.32, Math.min(.32, (target.x - crawler.x) * .012)) + Math.sin(t * 1.7) * .05 * drift;
  ctx.rotate(tilt);
  ctx.fillStyle = '#191c18';ctx.fillRect(-6, -19, 12, 32);ctx.fillRect(-9, -10, 18, 13);ctx.fillRect(-4, 15, 8, 9);
  ctx.fillStyle = color;ctx.fillRect(-3, -15, 6, 4);ctx.fillRect(-2, 4, 4, 3);ctx.restore();
  // A fine reading ring and a tiny specimen tag make its current target legible.
  ctx.beginPath();ctx.ellipse(centerX, centerY + 3, Math.min(rect.w / 2 + 8, width / 2 - 10), rect.h / 2 - 1, -.06, 0, Math.PI * 2);ctx.strokeStyle = `${color}99`;ctx.lineWidth = .75;ctx.stroke();
  const labelX = Math.max(8, Math.min(width - 91, bx + 15));
  const labelY = Math.max(8, Math.min(height - 25, by - 25));
  ctx.fillStyle = '#08a5c8';ctx.fillRect(labelX, labelY, 77, 23);
  ctx.font = '6px monospace';ctx.fillStyle = '#fff';ctx.fillText('CRAWLER_01', labelX + 5, labelY + 9);ctx.fillText(`WORD ${formatCount(index + 1)}`, labelX + 5, labelY + 18);
  if (phase === 'running' && words[index].signal !== 'neutral') {
    const label = words[index].text.replace(/[^\p{L}\p{N}'’-]/gu, '').toLocaleUpperCase().slice(0, 19);
    ctx.font = '11px monospace';const lw = ctx.measureText(label).width + 14;
    const lx = Math.max(7, Math.min(width - lw - 7, centerX - lw / 2));
    const ly = Math.max(8, centerY - 73);
    ctx.strokeStyle = color;ctx.lineWidth = .6;ctx.beginPath();ctx.moveTo(centerX, centerY - 15);ctx.lineTo(lx + lw / 2, ly + 24);ctx.stroke();
    ctx.fillStyle = color;ctx.fillRect(lx, ly, lw, 24);ctx.fillStyle = '#fff';ctx.fillText(label, lx + 7, ly + 16);
  }
}

function frame(now) {
  const dt = Math.min((now - (lastFrame || now)) / 1000, .05);
  lastFrame = now;
  if (phase === 'running') {
    if (voiceRun) {
      if (now - voiceRun.begun > voiceRun.duration || (!voiceRun.started && now - voiceRun.begun > 6000)) {
        speechFailed('The voice did not respond. Continuing with visual reading.');
      } else if (!voiceRun.nativeBoundary && now >= nextAt && cursor < voiceRun.end) {
        visit(cursor + 1);
        nextAt = now + wordDuration(words[cursor].text, speed());
      }
    } else if (now >= nextAt) {
      if (cursor + 1 >= words.length) finish();
      else { visit(cursor + 1); nextAt = now + wordDuration(words[cursor].text, speed()); }
    }
  }
  if (scrollTarget !== null) {
    const diff = scrollTarget - viewport.scrollTop;
    viewport.scrollTop = reducedMotion.matches ? scrollTarget : viewport.scrollTop + diff * (1 - Math.exp(-dt * 10));
    if (Math.abs(diff) < 2) { viewport.scrollTop = scrollTarget; scrollTarget = null; }
  }
  draw(now, dt);
  requestAnimationFrame(frame);
}

$('speed-label').value = `${speed()} WPM`;
$('input-count').textContent = `${tokenize(input.value).length} WORDS`;
if (reducedMotion.matches) $('motion-note').textContent = 'Reduced motion. Same curious creature.';
renderText(input.value);
requestAnimationFrame(frame);
