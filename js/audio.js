/**
 * Sound, synthesised at runtime — no asset files anywhere in this project.
 * Everything is a short envelope on an oscillator or a burst of filtered noise.
 */

let ctx = null;
let master = null;
let enabled = true;
let noiseBuf = null;
let lastAt = 0;
let budget = 0;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setAudioEnabled(on) {
  enabled = on;
  if (ctx) master.gain.value = on ? 0.32 : 0;
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

/**
 * A battle can generate hundreds of hits a second. This caps how many sounds
 * start per frame so the mix stays a battle and not a wall of clipping.
 */
function allow() {
  if (!ctx || !enabled) return false;
  const now = ctx.currentTime;
  if (now - lastAt > 0.016) {
    budget = 3;
    lastAt = now;
  }
  if (budget <= 0) return false;
  budget--;
  return true;
}

function noise(dur, freq, q, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
  src.stop(ctx.currentTime + dur);
}

function tone(type, f0, f1, dur, gain) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ctx.currentTime + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(ctx.currentTime + dur);
}

export function sfx(kind) {
  if (!allow()) return;
  switch (kind) {
    case 'swing':
      noise(0.09, 1400 + Math.random() * 700, 1.2, 0.1);
      break;
    case 'shoot':
      noise(0.07, 2600, 2, 0.14);
      tone('square', 420, 120, 0.06, 0.05);
      break;
    case 'boom':
      noise(0.45, 180, 0.7, 0.5);
      tone('sine', 120, 26, 0.4, 0.28);
      break;
    case 'death':
      tone('triangle', 260 + Math.random() * 80, 70, 0.22, 0.09);
      break;
    case 'place':
      tone('sine', 620, 880, 0.08, 0.1);
      break;
    case 'start':
      tone('sawtooth', 180, 420, 0.35, 0.12);
      break;
    case 'win':
      tone('triangle', 440, 880, 0.5, 0.16);
      break;
    case 'lose':
      tone('triangle', 380, 110, 0.6, 0.16);
      break;
  }
}
