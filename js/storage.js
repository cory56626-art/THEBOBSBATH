// localStorage-backed persistence. Everything is wrapped because private
// browsing modes throw on write rather than failing quietly.

const KEY = 'primordia.v1';

const blank = () => ({ creatures: [], settings: {}, run: null, hall: [] });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return { ...blank(), ...JSON.parse(raw) };
  } catch {
    return blank();
  }
}

let cache = load();

function flush() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* quota or private mode */ }
}

export const state = () => cache;

export function saveCreature(entry) {
  const i = cache.creatures.findIndex((c) => c.id === entry.id);
  if (i >= 0) cache.creatures[i] = entry; else cache.creatures.unshift(entry);
  cache.creatures = cache.creatures.slice(0, 60);
  flush();
  return entry;
}

export function deleteCreature(id) {
  cache.creatures = cache.creatures.filter((c) => c.id !== id);
  flush();
}

export function creatures() { return cache.creatures; }

export function setSettings(patch) {
  cache.settings = { ...cache.settings, ...patch };
  flush();
}

export function settings() { return cache.settings; }

export function saveRun(json) { cache.run = json; flush(); }
export function loadRun() { return cache.run; }
export function clearRun() { cache.run = null; flush(); }

/** Hall of fame: the best result each creature has ever posted, per trial. */
export function recordHall(entry) {
  const i = cache.hall.findIndex((h) => h.name === entry.name && h.trial === entry.trial);
  if (i >= 0) {
    if (cache.hall[i].fitness >= entry.fitness) return cache.hall[i];
    cache.hall[i] = entry;
  } else {
    cache.hall.push(entry);
  }
  cache.hall.sort((a, b) => b.fitness - a.fitness);
  cache.hall = cache.hall.slice(0, 40);
  flush();
  return entry;
}

export function hall() { return cache.hall; }

export function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function uploadJSON() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('no file'));
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(String(reader.result))); }
        catch (e) { reject(e); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    input.click();
  });
}

export const uid = () => 'c' + Math.random().toString(36).slice(2, 9);
