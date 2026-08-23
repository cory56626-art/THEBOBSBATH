const KEY = 'tug-tussle-save-v1';

const DEFAULTS = { unlocked: 1, beaten: {}, bestCps: 0, wins: 0, plays: 0 };

export const Store = {
  data: { ...DEFAULTS },

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch { /* corrupt or blocked storage — play as a newcomer */ }
    return this.data;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ }
  },

  recordWin(botId, index, cps) {
    this.data.beaten[botId] = true;
    this.data.wins++;
    this.data.unlocked = Math.max(this.data.unlocked, index + 2);
    this.data.bestCps = Math.max(this.data.bestCps, cps);
    this.save();
  },

  recordLoss(cps) {
    this.data.plays++;
    this.data.bestCps = Math.max(this.data.bestCps, cps);
    this.save();
  },

  rank() {
    const n = Object.keys(this.data.beaten).length;
    return ['Rookie', 'Tugger', 'Puller', 'Hauler', 'Anchor', 'Bruiser', 'Champion', 'Legend', 'KRAKENSLAYER'][Math.min(n, 8)];
  },
};
