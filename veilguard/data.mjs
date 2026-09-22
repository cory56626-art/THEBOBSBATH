// Veilguard is an original static, single-player tower-defense game.
export const PATH = [
  [-14, 2], [-9, 2], [-9, -5], [-3, -5], [-3, 4],
  [3, 4], [3, -3], [9, -3], [9, 0], [14, 0],
];

export const MODES = {
  ember: { name: 'Ember', subtitle: 'A first stand', waves: 18, health: 120, cash: 680, difficulty: 1, reward: 1, color: '#f3b95f' },
  tempest: { name: 'Tempest', subtitle: 'The long siege', waves: 26, health: 100, cash: 640, difficulty: 1.38, reward: 1.6, color: '#72d1df' },
  eclipse: { name: 'Eclipse', subtitle: 'Beyond the veil', waves: 34, health: 90, cash: 620, difficulty: 1.8, reward: 2.35, color: '#ca93ff' },
};

export const TOWERS = {
  spark: {
    name: 'Spark', role: 'Rapid fire', description: 'Reliable shots. Tracks airborne targets.', cost: 140, unlock: 0,
    color: '#f6be69', damage: 12, rate: 1.35, range: 4.8, air: true, upgrades: [100, 160, 260, 390, 570],
    bonus: ['Improved coil', 'Double capacitor', 'Long sight', 'Veil lens · detects hidden', 'Overcharged core'],
  },
  prism: {
    name: 'Prism', role: 'Energy beam', description: 'Ignores armor. Sees hidden units at level 2.', cost: 260, unlock: 0,
    color: '#71dfe9', damage: 25, rate: .76, range: 5.5, air: true, energy: true, upgrades: [160, 245, 360, 510, 730],
    bonus: ['Focused ray', 'True sight · detects hidden', 'Refracted charge', 'Extended array', 'Supernova lens'],
  },
  frost: {
    name: 'Glacier', role: 'Control', description: 'Slows ground units for a short time.', cost: 300, unlock: 0,
    color: '#92b7ff', damage: 8, rate: .85, range: 4.4, slow: .48, upgrades: [175, 250, 340, 490, 680],
    bonus: ['Deep chill', 'Wide aperture', 'Lasting frost', 'Cold front', 'Absolute zero'],
  },
  relay: {
    name: 'Relay', role: 'Support', description: 'Pays cash each wave and boosts nearby attack speed.', cost: 390, unlock: 0,
    color: '#e4d280', range: 4.7, income: 105, upgrades: [190, 285, 395, 550, 740],
    bonus: ['Expanded reserve', 'Signal boost', 'Double circuit', 'Crystal bank', 'Golden frequency'],
  },
  mortar: {
    name: 'Comet', role: 'Area damage', description: 'Ground-only blasts hit nearby enemies.', cost: 460, unlock: 120,
    color: '#ff9075', damage: 48, rate: .42, range: 6.5, splash: 1.8, upgrades: [260, 380, 520, 680, 880],
    bonus: ['Wider burst', 'Dense payload', 'Tuned arc', 'Meteor casing', 'Starfall engine'],
  },
  aegis: {
    name: 'Sentinel', role: 'Heavy hitter', description: 'Pierces armor. Can target airborne units.', cost: 650, unlock: 270,
    color: '#bd9cff', damage: 92, rate: .48, range: 6.1, air: true, pierce: true, upgrades: [330, 470, 650, 850, 1100],
    bonus: ['Hardened focus', 'Long arc', 'Veil lens · detects hidden', 'Twin engine', 'Final protocol'],
  },
};

export const ENEMIES = {
  drifter: { name: 'Drifter', hp: 62, speed: 1.8, bounty: 13, color: '#c9ab88', leak: 4 },
  skitter: { name: 'Skitter', hp: 38, speed: 3.3, bounty: 14, color: '#efbe79', leak: 3 },
  plated: { name: 'Plated', hp: 170, speed: 1.25, bounty: 24, color: '#a3b5bf', leak: 8, armor: true },
  shroud: { name: 'Shroud', hp: 88, speed: 2.05, bounty: 19, color: '#aa8be2', leak: 5, hidden: true },
  glider: { name: 'Glider', hp: 95, speed: 2.45, bounty: 22, color: '#75d8d6', leak: 6, air: true },
  mender: { name: 'Mender', hp: 185, speed: 1.45, bounty: 28, color: '#8fd6a2', leak: 9, regen: 5 },
  cluster: { name: 'Cluster', hp: 185, speed: 1.65, bounty: 31, color: '#ef9a83', leak: 8, split: true },
  titan: { name: 'Warden', hp: 1900, speed: .82, bounty: 240, color: '#f0b968', leak: 35, armor: true, boss: true },
  sovereign: { name: 'Sovereign', hp: 4400, speed: .9, bounty: 550, color: '#cb9cf5', leak: 55, regen: 9, boss: true },
};

export const TILE_X = Array.from({ length: 13 }, (_, i) => -12 + i * 2);
export const TILE_Z = Array.from({ length: 9 }, (_, i) => -8 + i * 2);

export function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 95)) + 1;
}

export function xpForLevel(level) {
  return 95 * (level - 1) ** 2;
}
