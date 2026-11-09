import { LIMIT, SAMPLES, tokenize, speechChunk, wordAtBoundary, wordDuration } from './reader-core.js?v=4';
import { clamp, createRig, updateRig, translateBodyForScroll, legPose } from './crawler-motion.js?v=4';
import { analyzeDocument, summarizeDocument } from './text-analysis.js?v=4';
import { createInspection, advanceInspection, releaseInspection, retargetInspection } from './crawler-inspection.js?v=4';

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
let rig = null;
let rigLastScroll = 0;
let activeInspection = null;
let inspectionQueue = [];
let readingDone = false;
let simulationTime = 0;
let scanPlan = [];
let textModel = null;
let targetEnds = new Map();
let foundTargets = new Set();
let summaryText = '';
let huntIndex = -1;
let pendingHunt = null;
let huntHoldUntil = 0;
let activeSpans = [];
let seen = new Set();
let annotations = [];
let wordRects = [];
let scrollTarget = null;
let voices = [];
let fieldBounds = { left: 0, right: 500, center: 250 };

input.value = typeof saved.text === 'string' ? saved.text.slice(0, LIMIT) : SAMPLES[0];
$('speed').value = Number.isFinite(Number(saved.speed)) && Number(saved.speed) >= 70 && Number(saved.speed) <= 950 ? String(saved.speed) : '190';
$('voice').checked = canSpeak && saved.voice === true;
$('reading-mode').value = saved.mode === 'all' ? 'all' : 'hunt';
const hunting = () => $('reading-mode').value === 'hunt';

function save() {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify({ text: input.value, speed: Number($('speed').value), voice: $('voice').checked, voiceName: $('voice-select').value, mode: $('reading-mode').value }));
  } catch { /* The reader still works without storage. */ }
}

function announce(message) { $('announcement').textContent = message; }
function status(label) { $('state-label').textContent = label; }
function speed() { return Number($('speed').value); }
function pace() { return speed() / 190; }
function updateSpeedLabel() {
  $('speed-label').value = `${pace().toFixed(1)}×`;
  for (const button of document.querySelectorAll('[data-speed]')) button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === speed()));
  document.querySelector('.mode-field p').textContent = hunting() ? 'Follows standout words and phrases.' : 'Follows every word, in order.';
}
function formatCount(n) { return String(n).padStart(3, '0'); }

function setPhase(value) {
  phase = value;
  document.body.classList.toggle('is-running', value === 'running');
  $('pause').disabled = value === 'ready' || value === 'finished' || !words.length;
  $('pause').innerHTML = value === 'paused' ? 'Resume <span aria-hidden="true">▶</span>' : 'Pause <span aria-hidden="true">Ⅱ</span>';
  $('start-label').textContent = value === 'finished' ? 'Crawl again' : value === 'paused' && !dirty ? 'Keep crawling' : value === 'running' && !dirty ? 'Restart crawling' : 'Start crawling';
  status(value === 'running' ? hunting() ? 'HUNTING WORDS & PHRASES' : 'SCANNING YOUR WORDS' : value === 'paused' ? 'TAKING A BREATHER' : value === 'finished' ? hunting() ? 'HUNT COMPLETE' : 'EVERY WORD FOUND' : 'READY TO READ');
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
  if(activeInspection) releaseInspection(rig,activeInspection);
  activeInspection=null;inspectionQueue=[];readingDone=false;
  const bounded = text.slice(0, LIMIT);
  words = tokenize(bounded);
  textModel = analyzeDocument(words, bounded);
  scanPlan = textModel.targets;
  targetEnds = new Map(scanPlan.map((t,i)=>[t.end,i]));
  foundTargets = new Set();
  summaryText = '';
  $('read-summary').hidden = true;
  $('summary-text').textContent = '';
  $('summary-topics').replaceChildren();
  $('summary-copy').textContent = 'Copy summary';
  const keyIndices = new Set(scanPlan.flatMap(t=>Array.from({length:t.end-t.index+1},(_,i)=>t.index+i)));
  huntIndex = -1; pendingHunt = null; huntHoldUntil = 0;
  seen = new Set(); annotations = []; activeSpans = [];
  simulationTime = 0;
  spans = [];
  let at = 0;
  const fragment = document.createDocumentFragment();
  let block = document.createElement('div');
  block.className = 'passage';
  for (const word of words) {
    let gap = bounded.slice(at, word.offset);
    if (/\n[ \t]*\n/.test(gap) && block.childNodes.length) {
      fragment.append(block);
      block = document.createElement('div'); block.className = 'passage';
      gap = '';
    }
    block.append(document.createTextNode(gap));
    const span = document.createElement('span');
    span.className = `token ${word.signal}${keyIndices.has(spans.length) ? ' key' : ''}`;
    span.textContent = word.text;
    span.dataset.word = String(spans.length);
    block.append(span);
    spans.push(span);
    at = word.offset + word.text.length;
  }
  block.append(document.createTextNode(bounded.slice(at)));
  if (words.length) fragment.append(block);
  doc.replaceChildren(fragment);
  cursor = visited = -1;
  positives = negatives = 0;
  viewport.scrollTop = 0;
  scrollTarget = null;
  rig = null; rigLastScroll = 0; wordRects = [];
  $('love-count').textContent = $('hate-count').textContent = '000';
  $('love-word').textContent = $('hate-word').textContent = '—';
  $('topic-word').textContent = 'WAITING FOR IDEAS';
  $('topic-count').textContent = `0 / ${scanPlan.length}`;
  $('reader-empty').hidden = words.length > 0;
  $('current-word').textContent = words.length ? 'AWAITING INPUT' : 'WAITING FOR WORDS';
  $('read-count').textContent = hunting() ? `TARGET 000 / ${formatCount(scanPlan.length)}` : `000 / ${formatCount(words.length)} WORDS`;
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
  const field = doc.getBoundingClientRect();
  fieldBounds = { left: field.left - rect.left + 25, right: field.right - rect.left - 25, center: field.left - rect.left + field.width / 2 };
  const marks=new Set(annotations.map(a=>a.inspection));
  if(activeInspection) marks.add(activeInspection);
  for(const mark of marks) if(mark) {
    const boxes=phraseBoxes(mark.target.index,mark.target.end);
    if(boxes.length) retargetInspection(mark,boxes);
  }
  rig = null; rigLastScroll = viewport.scrollTop;
  if (cursor >= 0) trackWord(false);
}

function trackWord(follow = true) {
  const rect = wordRects[pendingHunt?.target.index ?? Math.max(0, cursor)];
  if (!rect) return;
  if (follow && performance.now() > scrollUntil) {
    if (hunting()) {
      scrollTarget = Math.max(0, Math.min(viewport.scrollHeight - height, rect.y - height * .44));
      return;
    }
    const top = rect.y - viewport.scrollTop;
    if (top < height * .24 || top > height * .68) {
      scrollTarget = Math.max(0, Math.min(viewport.scrollHeight - height, rect.y - height * .44));
    }
  }
}

function visit(index, end = index, enqueueMarks = true) {
  if (!words.length || index < 0 || index >= words.length) return;
  for (const span of activeSpans) span.classList.remove('active');
  activeSpans = [];
  cursor = index;
  // Boundary events may skip words; every passed word still counts exactly once.
  for (let i = hunting() ? index : visited + 1; i <= end; i++) {
    if (seen.has(i)) continue;
    seen.add(i);
    spans[i].classList.add('read');
    if (words[i].signal === 'positive') { positives++; $('love-word').textContent = words[i].text.toLocaleUpperCase(); }
    if (words[i].signal === 'negative') { negatives++; $('hate-word').textContent = words[i].text.toLocaleUpperCase(); }
    const targetId = targetEnds.get(i);
    if (targetId !== undefined && !foundTargets.has(targetId)) {
      const t = scanPlan[targetId];
      if (Array.from({length:t.end-t.index+1},(_,j)=>t.index+j).every(j=>seen.has(j))) {
        foundTargets.add(targetId);
        $('topic-word').textContent = words.slice(t.index,t.end+1).map(w=>w.text).join(' ').toLocaleUpperCase();
        if(!hunting() && enqueueMarks) inspectionQueue.push(t);
      }
    }
  }
  visited = Math.max(visited, end);
  for (let i = index; i <= end; i++) { spans[i].classList.add('active'); activeSpans.push(spans[i]); }
  $('love-count').textContent = formatCount(positives);
  $('hate-count').textContent = formatCount(negatives);
  $('topic-count').textContent = `${foundTargets.size} / ${scanPlan.length}`;
  $('read-count').textContent = hunting() ? `TARGET ${formatCount(huntIndex + 1)} / ${formatCount(scanPlan.length)}` : `${formatCount(index + 1)} / ${formatCount(words.length)} WORDS`;
  $('current-word').textContent = words.slice(index, end + 1).map(w => w.text).join(' ').toLocaleUpperCase();
  const pct = Math.round(hunting() ? (huntIndex + 1) / scanPlan.length * 100 : (index + 1) / words.length * 100);
  $('progress').style.width = `${pct}%`;
  document.querySelector('[role=progressbar]').setAttribute('aria-valuenow', String(pct));
  trackWord();
}

function finish() {
  stopSpeech();
  setPhase('finished');
  pendingHunt = null;
  scrollTarget = null;
  showSummary();
  announce((hunting() ? `Hunt complete. Found ${scanPlan.length} word and phrase targets.` : `Finished reading ${words.length} words.`) + ' Summary ready.');
}

function requestFinish() { readingDone=true; }

function startInspection(target) {
  if(!rig) return false;
  const boxes=phraseBoxes(target.index,target.end);
  if(!boxes.length) return false;
  activeInspection=createInspection(rig,boxes,target);
  return true;
}

function recordInspection(state) {
  if(state.recorded || !state.frame.touched) return;
  state.recorded=true;
  const target=state.target;
  if(hunting()) visit(target.index,target.end);
  annotations.push({index:target.index,end:target.end,signal:target.signal,born:simulationTime,inspection:state});
  annotations=annotations.slice(-10);
  if(hunting() && $('voice').checked) speakTarget(target);
}

function showSummary() {
  const result = summarizeDocument(textModel);
  summaryText = result.text;
  $('summary-text').textContent = summaryText;
  $('summary-meta').textContent = `${words.length} words in the text · ${foundTargets.size} key ideas followed`;
  const fragment = document.createDocumentFragment();
  for (const topic of result.topics) {
    const chip = document.createElement('span'); chip.textContent = topic.text; fragment.append(chip);
  }
  $('summary-topics').replaceChildren(fragment);
  $('summary-topics-label').hidden = !result.topics.length;
  $('read-summary').hidden = false;
  if (!document.body.classList.contains('focus-mode')) requestAnimationFrame(()=>$('read-summary').scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'nearest'}));
}

$('summary-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(summaryText); $('summary-copy').textContent = 'Copied'; }
  catch { $('summary-copy').textContent = 'Select the text to copy'; }
});

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
  const run = { ...chunk, kind: 'all', nativeBoundary: false, started: false, begun: now, lastEvent: now, duration: chunk.text.length * 95 / u.rate + 10000 };
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
    if (chunk.end + 1 >= words.length) requestFinish();
    else { visit(chunk.end + 1); speakFrom(chunk.end + 1); }
  };
  u.onerror = event => {
    if (ticket !== generation || phase !== 'running') return;
    if (event.error === 'canceled' || event.error === 'interrupted') return;
    speechFailed('Voice is unavailable here. The crawler will keep reading visually.');
  };
  try { synth.speak(u); } catch { speechFailed('Voice is unavailable here. The crawler will keep reading visually.'); }
}

function speakTarget(target) {
  if (!canSpeak || !$('voice').checked || !target || phase !== 'running') return;
  const text = words.slice(target.index, target.end + 1).map(w => w.text).join(' ');
  if (text.length > 1000) return;
  const ticket = generation;
  const u = new SpeechSynthesisUtterance(text);
  utterance = u;
  const selected = voices.find(v => v.name === $('voice-select').value);
  if (selected) { u.voice = selected; u.lang = selected.lang; }
  u.rate = clamp(pace(), .35, 5);
  const run = { kind: 'hunt', begun: performance.now(), started: false, duration: 10000 + text.length * 100 / u.rate };
  voiceRun = run;
  u.onstart = () => { if (ticket === generation) run.started = true; };
  u.onend = () => { if (ticket === generation) { voiceRun = null; utterance = null; } };
  u.onerror = event => {
    if (ticket === generation && !['canceled', 'interrupted'].includes(event.error)) speechFailed('Voice is unavailable here. The crawler will keep reading visually.');
  };
  try { synth.speak(u); } catch { speechFailed('Voice is unavailable here. The crawler will keep reading visually.'); }
}

function speakCurrent() {
  if (hunting()) { if(activeInspection?.recorded) speakTarget(activeInspection.target); else if (!pendingHunt) speakTarget(scanPlan[huntIndex]); }
  else if(!readingDone) speakFrom(Math.max(0, cursor));
}

function nextHunt() {
  huntIndex++;
  if (huntIndex >= scanPlan.length) { finish(); return; }
  pendingHunt = { target: scanPlan[huntIndex], begun: simulationTime };
  trackWord();
}

function begin(resume = false) {
  clearTimeout(inputTimer);
  if (dirty || !resume || phase === 'finished') renderText(input.value);
  if (!words.length) { announce('Add some text first.'); input.focus(); return; }
  stopSpeech();
  scrollUntil = 0;
  setPhase('running');
  if (hunting()) {
    if (huntIndex < 0) nextHunt();
    else if ((!pendingHunt || activeInspection?.recorded) && $('voice').checked) speakCurrent();
    trackWord();
  } else if(!readingDone) {
    visit(Math.max(0, cursor));
    nextAt = performance.now() + wordDuration(words[cursor].text, speed());
    if ($('voice').checked) speakFrom(cursor);
  }
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
    scrollTarget = null;
    announce('Reading paused.');
  } else if (phase === 'paused') begin(true);
}

$('start').addEventListener('click', () => begin(phase === 'paused' && !dirty));
$('pause').addEventListener('click', pause);
$('restart').addEventListener('click', () => begin(false));
input.addEventListener('input', () => {
  $('read-summary').hidden = true;
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
  updateSpeedLabel();
  nextAt = performance.now() + wordDuration(words[cursor]?.text || '', speed());
});
$('speed').addEventListener('change', () => {
  save();
  if (phase === 'running' && $('voice').checked) { stopSpeech(); speakCurrent(); }
});
for (const button of document.querySelectorAll('[data-speed]')) button.addEventListener('click', () => {
  $('speed').value = button.dataset.speed;
  updateSpeedLabel();
  nextAt = performance.now() + wordDuration(words[cursor]?.text || '', speed());
  save();
  if (phase === 'running' && $('voice').checked) { stopSpeech(); speakCurrent(); }
});
$('reading-mode').addEventListener('change', () => { renderText(input.value); updateSpeedLabel(); save(); });
$('voice').addEventListener('change', () => {
  $('voice-select').disabled = !$('voice').checked;
  $('voice-note').textContent = $('voice').checked ? 'Uses the voices available on your device.' : 'Sound off. The crawler will read visually.';
  stopSpeech();
  if (phase === 'running') {
    nextAt = performance.now() + wordDuration(words[cursor]?.text || '', speed());
    if ($('voice').checked) speakCurrent();
  }
  save();
});
$('voice-select').addEventListener('change', () => {
  save();
  if (phase === 'running' && $('voice').checked) { stopSpeech(); speakCurrent(); }
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
  if(activeInspection) releaseInspection(rig,activeInspection);
  activeInspection=null;inspectionQueue=[];readingDone=false;
  // Rebuild the tally on backward seeks instead of counting the same word twice.
  spans.forEach(s => s.classList.remove('read', 'active'));
  cursor = visited = -1; positives = negatives = 0; seen.clear(); foundTargets.clear(); activeSpans = []; annotations = []; rig = null;
  $('read-summary').hidden = true;
  $('love-word').textContent = $('hate-word').textContent = '—';
  if (hunting()) {
    huntIndex = scanPlan.findIndex(t => t.end >= index);
    if (huntIndex < 0) huntIndex = scanPlan.length - 1;
    pendingHunt = {target:scanPlan[huntIndex],begun:simulationTime};
    const t = scanPlan[huntIndex];
    visit(t.index, t.end,false);
    huntHoldUntil = simulationTime + .55 / pace();
  } else {
    visit(index,index,false);
    inspectionQueue.push(scanPlan.find(t=>t.index<=index && t.end>=index)||{index,end:index,signal:words[index].signal});
  }
  if (wasRunning) {
    nextAt = performance.now() + wordDuration(words[index].text, speed());
    if ($('voice').checked) speakCurrent();
  } else setPhase('paused');
});
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'running') pause(); });
window.addEventListener('pagehide', stopSpeech);
new ResizeObserver(measure).observe(viewport);
if (document.fonts?.ready) document.fonts.ready.then(measure);

function goalForTarget() {
  const target = activeInspection?.target || pendingHunt?.target || inspectionQueue[0] || (hunting() ? scanPlan[Math.max(0, huntIndex)] : null);
  const index = target?.index ?? Math.max(0, cursor);
  const first = wordRects[index];
  const last = wordRects[target?.end ?? index] || first;
  if (!first) return null;
  const center = Math.abs(first.y - last.y) < 15 ? (first.x + last.x + last.w) / 2 : first.x + first.w / 2;
  const range = Math.max(20, (fieldBounds.right - fieldBounds.left) * .28);
  return {
    x: clamp(fieldBounds.center + (center - fieldBounds.center) * .55 + Math.sin(index * 1.73) * 8, fieldBounds.center - range, fieldBounds.center + range),
    y: viewport.scrollTop + height * .44 + clamp((first.y - viewport.scrollTop - height * .44) * .045, -7, 7),
  };
}

function findContact(ideal, leg) {
  let chosen = { x: clamp(ideal.x, 12, width - 12), y: Math.max(5, ideal.y) };
  let best = (65 * (rig?.scale || 1)) ** 2;
  const center = pendingHunt?.target.index ?? Math.max(0, cursor);
  for (let i = Math.max(0, center - 55); i < Math.min(wordRects.length, center + 65); i++) {
    const r = wordRects[i];
    const p = { x: r.x + r.w * (leg.side < 0 ? .18 : .82), y: r.y + r.h + 1 };
    if (p.x < 9 || p.x > width - 9) continue;
    let cost = (p.x - ideal.x) ** 2 + (p.y - ideal.y) ** 2;
    if (rig?.legs.some(other => { const foot=other.stepping?other.to:other.toe;return other!==leg && Math.hypot(foot.x-p.x,foot.y-p.y)<10; })) cost += 1600;
    if (cost < best) { best = cost; chosen = p; }
  }
  return chosen;
}

function phraseBoxes(index, end) {
  const rows = [];
  for (let i = index; i <= end; i++) {
    const r = wordRects[i];
    if (!r) continue;
    const row = rows.find(b => Math.abs(b.y - r.y) < r.h * .5);
    if (row) { row.right = Math.max(row.right, r.x + r.w); row.x = Math.min(row.x, r.x); }
    else rows.push({ x: r.x, y: r.y, h: r.h, right: r.x + r.w });
  }
  return rows;
}

function markColor(signal) { return signal==='positive'?'#f000c8':signal==='negative'?'#5b00ff':'#007e9e'; }

function drawTargets() {
  annotations = annotations.filter(a => simulationTime - a.born < 11);
  const labeled = annotations.slice(-5);
  for (const a of annotations) {
    const boxes = phraseBoxes(a.index, a.end);
    const color = markColor(a.signal);
    const alpha = clamp((11 - simulationTime + a.born) / 1.5, 0, 1);
    ctx.save();ctx.globalAlpha = alpha;
    for(const stroke of a.inspection.frame.paths) {
      if(stroke.points.length<2) continue;
      ctx.beginPath();
      stroke.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y-viewport.scrollTop):ctx.moveTo(p.x,p.y-viewport.scrollTop));
      ctx.strokeStyle=color;ctx.lineWidth=stroke.kind==='circle'?.95:.7;ctx.stroke();
    }
    if (labeled.includes(a) && boxes.length) {
      ctx.globalAlpha=alpha*a.inspection.frame.labelProgress;
      const b = boxes[0], x = (b.x + b.right) / 2, y = b.y - viewport.scrollTop;
      const text = words.slice(a.index, a.end + 1).map(w => w.text.replace(/[^\p{L}\p{N}'’-]/gu, '')).join(' ').toLocaleUpperCase().slice(0, 23);
      const font = width < 420 ? 13 : 16;
      ctx.font = `${font}px Arial`;
      const tw = ctx.measureText(text).width + 13;
      const lx = clamp(x - tw / 2 + ((a.index % 3) - 1) * 14, 6, width - tw - 6);
      const ly = y - 60 - (a.index % 3) * 16;
      ctx.strokeStyle = color;ctx.lineWidth = .65;ctx.beginPath();ctx.moveTo(lx + tw / 2, ly + 27);ctx.lineTo(lx + tw / 2, y + b.h / 2);ctx.lineTo(x, y + b.h / 2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x - 2, y + b.h / 2 - 3);ctx.lineTo(x, y + b.h / 2);ctx.lineTo(x + 2, y + b.h / 2 - 3);ctx.stroke();
      ctx.fillStyle = color;ctx.fillRect(lx, ly, tw, 24);
      ctx.strokeRect(lx - 3, ly - 3, tw + 6, 34);ctx.strokeRect(lx, ly + 26, tw, 5);
      ctx.fillStyle = '#fff';ctx.fillText(text, lx + 6, ly + 17);
    }
    ctx.restore();
  }
}

function taperedSegment(a, b, rootWidth, tipWidth) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  ctx.beginPath();ctx.moveTo(a.x + nx * rootWidth / 2, a.y - viewport.scrollTop + ny * rootWidth / 2);
  ctx.lineTo(b.x + nx * tipWidth / 2, b.y - viewport.scrollTop + ny * tipWidth / 2);
  ctx.lineTo(b.x - nx * tipWidth / 2, b.y - viewport.scrollTop - ny * tipWidth / 2);
  ctx.lineTo(a.x - nx * rootWidth / 2, a.y - viewport.scrollTop - ny * rootWidth / 2);ctx.closePath();ctx.fill();
}

function draw(now, dt) {
  ctx.clearRect(0, 0, width, height);
  if (!words.length || !width || !height) return;
  const goal = goalForTarget();
  if (!goal) return;
  if (!rig) {
    rig = createRig(goal.x, goal.y, width < 420 ? 1.05 : 1.3);
    rigLastScroll = viewport.scrollTop;
    for (const leg of rig.legs) leg.toe = findContact(leg.toe, leg);
  }
  translateBodyForScroll(rig, viewport.scrollTop - rigLastScroll);
  rigLastScroll = viewport.scrollTop;
  rig.goal = goal;
  updateRig(rig, dt, simulationTime, findContact, { running: phase === 'running', reduced: reducedMotion.matches, pace: clamp(pace(), .35, 5) });
  if(activeInspection) {
    advanceInspection(rig,activeInspection,dt,{running:phase==='running',reduced:reducedMotion.matches,pace:pace()});
    recordInspection(activeInspection);
    const target=activeInspection.target;
    $('topic-word').textContent=words.slice(target.index,target.end+1).map(w=>w.text).join(' ').toLocaleUpperCase();
  }
  const action=activeInspection?.frame.phase||'walking';
  canvas.dataset.action=action;
  canvas.dataset.traceProgress=String(activeInspection?.frame.progress||0);
  if(phase==='running') {
    const label=readingDone?'FINISHING ITS MARKS':action==='reaching'?'POINTING AT AN IDEA':action==='circling'?'CIRCLING AN IDEA':action==='underlining'?'UNDERLINING AN IDEA':hunting()?'HUNTING WORDS & PHRASES':'SCANNING YOUR WORDS';
    if($('state-label').textContent!==label) status(label);
  }
  drawTargets();
  const s = rig.scale, poses = rig.legs.map(leg => legPose(rig, leg));
  // Sparse, fine triangulation stays behind the eight heavier articulated legs.
  ctx.strokeStyle = '#3c34482a';ctx.lineWidth = .55;
  for (const [a, b] of [[0, 5], [2, 7], [1, 3], [4, 6]]) {
    ctx.beginPath();ctx.moveTo(poses[a].toe.x, poses[a].toe.y - viewport.scrollTop);ctx.lineTo(poses[b].knee.x, poses[b].knee.y - viewport.scrollTop);ctx.stroke();
  }
  for (const pose of poses) {
    ctx.fillStyle = '#080709';
    taperedSegment(pose.root, pose.knee, 3.8 * s, 1.45 * s);
    taperedSegment(pose.knee, pose.toe, 1.65 * s, .5 * s);
    ctx.fillStyle = '#f27ee7';
    for (const [point, size] of [[pose.root, 2.4], [pose.knee, 3], [pose.toe, 1.5]]) ctx.fillRect(point.x - size * s / 2, point.y - viewport.scrollTop - size * s / 2, size * s, size * s);
  }
  if(activeInspection) {
    const f=activeInspection.frame,color=markColor(activeInspection.target.signal);
    const pointer=f.pointer,box=activeInspection.geometry.boxes[f.row];
    const center={x:box.x+box.w/2,y:box.y+box.h/2};
    const length=Math.hypot(center.x-pointer.x,center.y-pointer.y)||1;
    const ux=(center.x-pointer.x)/length,uy=(center.y-pointer.y)/length;
    ctx.strokeStyle=color;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(pointer.x-ux*5-uy*3,pointer.y-viewport.scrollTop-uy*5+ux*3);
    ctx.lineTo(pointer.x,pointer.y-viewport.scrollTop);
    ctx.lineTo(pointer.x-ux*5+uy*3,pointer.y-viewport.scrollTop-uy*5-ux*3);ctx.stroke();
    if(f.penDown) {
      ctx.beginPath();ctx.arc(f.tip.x,f.tip.y-viewport.scrollTop,3*s,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      ctx.beginPath();ctx.arc(f.tip.x,f.tip.y-viewport.scrollTop,1*s,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
    }
  }
  const b = rig.body;
  ctx.save();ctx.translate(b.x, b.y - viewport.scrollTop);ctx.rotate(b.angle);ctx.scale(s, s * .82);ctx.fillStyle = '#050406';
  // Three distinct angular body segments, small spinnerets, no floating eye box.
  for (const shape of [ [[-4,-17],[5,-17],[4,-8],[-4,-7]], [[-6,-7],[6,-8],[5,7],[-5,8]], [[-4,10],[4,9],[4,18],[-3,18]] ]) {
    ctx.beginPath();shape.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  }
  ctx.fillRect(-3,19,2,5);ctx.fillRect(1,19,2,4);ctx.fillStyle='#a6a1aa';ctx.fillRect(-1,4,2,2);ctx.restore();
  const lx = clamp(b.x + 10 * s, 5, width - 62 * s), ly = b.y - viewport.scrollTop - 9 * s;
  ctx.fillStyle = '#009aca';ctx.fillRect(lx, ly, 55 * s, 19 * s);
  ctx.strokeStyle = '#40d4ef';ctx.lineWidth = .5;ctx.strokeRect(lx - 1, ly - 1, 57 * s, 21 * s);
  ctx.fillStyle = '#fff';ctx.font = `${5.4 * s}px monospace`;ctx.fillText('CRAWLER/01', lx + 3 * s, ly + 7 * s);
  ctx.fillText(`${hunting() ? 'SCAN' : 'WORD'} ${formatCount(hunting() ? Math.max(1,Math.min(scanPlan.length,huntIndex+1)) : Math.max(1,cursor+1))}`, lx + 3 * s, ly + 14 * s);
}

function frame(now) {
  const dt = Math.min((now - (lastFrame || now)) / 1000, .12);
  lastFrame = now;
  if (phase === 'running') {
    simulationTime += dt;
    if (voiceRun && (now - voiceRun.begun > voiceRun.duration || (!voiceRun.started && now - voiceRun.begun > 6000))) speechFailed('The voice did not respond. Continuing with visual reading.');
    if(activeInspection?.frame.complete) {
      releaseInspection(rig,activeInspection);activeInspection=null;
      if(hunting()) { pendingHunt=null;huntHoldUntil=simulationTime+.06/pace(); }
    }
    if (hunting()) {
      if (pendingHunt && !activeInspection) {
        const atGoal = rig && Math.hypot(rig.body.x - rig.goal.x, rig.body.y - rig.goal.y) < 9 && (scrollTarget === null || Math.abs(viewport.scrollTop - scrollTarget) < 9);
        if (atGoal || simulationTime - pendingHunt.begun > 1.7 / pace()) {
          startInspection(pendingHunt.target);
        }
      } else if (!pendingHunt && !activeInspection && simulationTime >= huntHoldUntil && !voiceRun) nextHunt();
    } else {
      if(!readingDone) {
        if(voiceRun) {
          if(!voiceRun.nativeBoundary && now>=nextAt && cursor<voiceRun.end) { visit(cursor+1);nextAt=now+wordDuration(words[cursor].text,speed()); }
        } else if(now>=nextAt) {
          if(cursor+1>=words.length) requestFinish();
          else { visit(cursor+1);nextAt=now+wordDuration(words[cursor].text,speed()); }
        }
      }
      if(!activeInspection && inspectionQueue.length && startInspection(inspectionQueue[0])) inspectionQueue.shift();
      if(readingDone && !activeInspection && !inspectionQueue.length) finish();
    }
  }
  if (scrollTarget !== null && phase === 'running') {
    const diff = scrollTarget - viewport.scrollTop;
    viewport.scrollTop = reducedMotion.matches ? scrollTarget : viewport.scrollTop + diff * (1 - Math.exp(-dt * 8 * pace()));
    if (Math.abs(diff) < 2) { viewport.scrollTop = scrollTarget; scrollTarget = null; }
  }
  draw(now, dt);
  requestAnimationFrame(frame);
}

updateSpeedLabel();
$('input-count').textContent = `${tokenize(input.value).length} WORDS`;
if (reducedMotion.matches) $('motion-note').textContent = 'Reduced motion. Same curious creature.';
renderText(input.value);
requestAnimationFrame(frame);
