// Entry point: wires the canvas, the simulation, the setup panel and the
// recorder together, and runs the fixed-timestep loop.

import { W, H, SETTINGS } from './config.js';
import { World } from './world.js';
import { render } from './render.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { Recorder } from './recorder.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
canvas.width = W;
canvas.height = H;

const world = new World();
const recorder = new Recorder(canvas);

const ui = new UI({
  recorderSupported: Recorder.supported,
  onStart: () => {
    // Browsers only allow audio to start from a user gesture, so this is the
    // one place we can reliably spin the synth up.
    Sound.init();
    Sound.setEnabled(SETTINGS.sound);
    world.start(ui.roster);
    ui.setState('running');
  },
  onReset: () => {
    world.state = 'idle';
    ui.setState('idle');
  },
  onRecord: async () => {
    Sound.init();
    if (recorder.recording) {
      ui.setRecording(false);
      const name = await recorder.stop();
      if (name) toast(`Saved ${name}`);
    } else if (recorder.start()) {
      ui.setRecording(true, 0);
    } else {
      toast('Recording is not supported in this browser');
    }
  },
});

ui.onSoundToggle = (on) => {
  Sound.init();
  Sound.setEnabled(on);
};
ui.mount();

// --------------------------------------------------------------- idle screen

// Something has to be on the canvas before the first battle starts.
world.start(ui.roster);
world.state = 'idle';

// -------------------------------------------------------------------- loop

const FIXED = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  // Clamp so a backgrounded tab doesn't fast-forward the whole fight on return.
  acc += Math.min(0.25, raw) * SETTINGS.timeScale;

  let guard = 0;
  while (acc >= FIXED && guard++ < 8) {
    world.step(FIXED);
    acc -= FIXED;
  }

  render(ctx, world, ui.hookText.trim());

  if (recorder.recording) ui.setRecording(true, recorder.elapsed);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------- toasts

let toastTimer = null;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// Test hook, mirroring the convention used in the other project.
window.__battle = { world, ui, recorder, SETTINGS, Sound };
