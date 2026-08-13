// Canvas + audio capture, so a battle can be exported straight to a video file
// at 1080x1920 without any screen-recording software.

import { Sound } from './audio.js';

const CANDIDATE_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of CANDIDATE_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export class Recorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.rec = null;
    this.chunks = [];
    this.recording = false;
    this.startedAt = 0;
  }

  static get supported() {
    return typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  start() {
    if (this.recording || !Recorder.supported) return false;

    const stream = this.canvas.captureStream(60);

    // Mix in the synth output so the export has its bounce/hit audio.
    const audio = Sound.stream;
    if (audio) {
      for (const track of audio.getAudioTracks()) stream.addTrack(track);
    }

    const mimeType = pickMimeType();
    if (mimeType === null) return false;

    try {
      this.rec = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 12_000_000,
      });
    } catch {
      this.rec = new MediaRecorder(stream);
    }

    this.chunks = [];
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.rec.start(100);
    this.recording = true;
    this.startedAt = performance.now();
    return true;
  }

  /** Stops and triggers a download. Returns the filename, or null. */
  stop() {
    if (!this.recording || !this.rec) return null;
    const rec = this.rec;
    this.recording = false;

    return new Promise((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || 'video/webm';
        const blob = new Blob(this.chunks, { type });
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const name = `ball-battle-${Date.now()}.${ext}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);

        this.chunks = [];
        this.rec = null;
        resolve(name);
      };
      rec.stop();
    });
  }

  get elapsed() {
    return this.recording ? (performance.now() - this.startedAt) / 1000 : 0;
  }
}
