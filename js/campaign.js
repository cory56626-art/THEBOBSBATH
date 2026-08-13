/**
 * Campaign levels.
 *
 * Each level is a fixed enemy army and a budget that is deliberately smaller
 * than what you are facing. That is the shape of the real campaign: the fights
 * are puzzles about counters — spread out against splash, close fast on
 * artillery, put something heavy in front of archers — not about out-spending.
 */

import { UNIT_BY_ID } from './units.js';

export const LEVELS = [
  {
    id: 'first-blood',
    name: 'A Polite Disagreement',
    budget: 400,
    hint: 'Two clubbers and a shove. Anything works here.',
    enemy: [['clubber', 4]],
  },
  {
    id: 'pitchforks',
    name: 'Pitchforks at Dawn',
    budget: 600,
    hint: 'Farmers outnumber you. Reach beats numbers.',
    enemy: [['farmer', 5], ['halfling', 4]],
  },
  {
    id: 'arrows',
    name: 'Arrow to the Everything',
    budget: 900,
    hint: 'Archers are made of paper. Something fast, or something shielded.',
    enemy: [['archer', 5], ['squire', 3]],
  },
  {
    id: 'shieldwall',
    name: 'The Shield Wall',
    budget: 1200,
    hint: 'A frontal charge dies here. Go over it, around it, or lob something.',
    enemy: [['shieldbearer', 6], ['sarissa', 4]],
  },
  {
    id: 'raiders',
    name: 'Northern Raiders',
    budget: 1500,
    hint: 'Berserkers hit fast and die fast. Kill them before they arrive.',
    enemy: [['berserker', 5], ['brawler', 4], ['icearcher', 3]],
  },
  {
    id: 'siege',
    name: 'Under Siege',
    budget: 1800,
    hint: 'The catapults will flatten anything you bunch together. Spread out.',
    enemy: [['catapult', 2], ['squire', 6], ['archer', 4]],
  },
  {
    id: 'boneyard',
    name: 'Boneyard',
    budget: 2000,
    hint: 'Bone Mages keep making more. Cut the head off.',
    enemy: [['bonemage', 3], ['skeletonwarrior', 8], ['skeletonarcher', 4]],
  },
  {
    id: 'gunpowder',
    name: 'Gunpowder Plot',
    budget: 2600,
    hint: 'Muskets hit like a truck and reload like a glacier. Rush the gap.',
    enemy: [['musketeer', 6], ['fencer', 5], ['halberd', 3]],
  },
  {
    id: 'highnoon',
    name: 'High Noon',
    budget: 3000,
    hint: 'A Deadeye can cross the whole field. Do not stand still.',
    enemy: [['deadeye', 2], ['gunslinger', 3], ['dynamitethrower', 4], ['miner', 4]],
  },
  {
    id: 'broadside',
    name: 'Broadside',
    budget: 3400,
    hint: 'Cannons and bombs. Anything clumped together becomes confetti.',
    enemy: [['cannon', 2], ['bombthrower', 4], ['blunderbuss', 5], ['captain', 1]],
  },
  {
    id: 'dynasty',
    name: 'Ten Thousand Sparks',
    budget: 3800,
    hint: 'Fast melee behind fireworks. Ninjas will get past your front line.',
    enemy: [['hwacha', 2], ['ninja', 4], ['samurai', 6], ['monk', 3]],
  },
  {
    id: 'thunder',
    name: 'Thunder on the Hill',
    budget: 4600,
    hint: 'Zeus deletes whatever gets close. Kill him from range, or with numbers.',
    enemy: [['zeus', 1], ['hoplite', 6], ['ballista', 2], ['snakearcher', 4]],
  },
  {
    id: 'court',
    name: 'The King and His Court',
    budget: 5200,
    hint: 'The King barely flinches. Chip him down while his knights are busy.',
    enemy: [['king', 1], ['knight', 4], ['archer', 6], ['healer', 3], ['catapult', 1]],
  },
  {
    id: 'reaping',
    name: 'The Reaping',
    budget: 6000,
    hint: 'The Reaper heals off every hit it lands. Do not let it land many.',
    enemy: [['reaper', 1], ['vampire', 6], ['swordcaster', 2], ['pumpkincatapult', 2], ['candlehead', 5]],
  },
  {
    id: 'tank',
    name: 'The Machine',
    budget: 7000,
    hint: 'Four thousand points of armoured nonsense. Swarm it or out-range it.',
    enemy: [['davincitank', 1], ['jouster', 3], ['musketeer', 5], ['halberd', 4]],
  },
  {
    id: 'everything',
    name: 'Everything, All At Once',
    budget: 9000,
    hint: 'Every boss in the game. Good luck.',
    enemy: [
      ['mammoth', 1],
      ['king', 1],
      ['minotaur', 1],
      ['jarl', 1],
      ['piratequeen', 1],
      ['scarecrow', 1],
      ['quickdraw', 1],
    ],
  },
];

/**
 * Places a level's enemy army across the right-hand half.
 *
 * Units are sorted by how far they want to be from the fight, so artillery and
 * archers form up at the back and melee stands in front — the same shape a
 * player would build by hand, and it makes the levels read as armies rather
 * than as a scatter of units.
 */
export function deployLevel(sim, level, halfW, halfD) {
  const list = [];
  for (const [id, n] of level.enemy) for (let i = 0; i < n; i++) list.push(id);

  list.sort((a, b) => rankOf(a) - rankOf(b));

  const front = halfW * 0.16;
  const back = halfW * 0.82;
  const perRow = Math.max(3, Math.ceil(Math.sqrt(list.length * 1.8)));
  const rows = Math.ceil(list.length / perRow);

  list.forEach((id, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inThisRow = Math.min(perRow, list.length - row * perRow);
    const t = rows <= 1 ? 0 : row / (rows - 1);
    const x = front + (back - front) * t + (Math.random() - 0.5) * 2.5;
    const spread = Math.min(halfD * 1.55, inThisRow * 3.4);
    const z =
      inThisRow <= 1
        ? (Math.random() - 0.5) * 3
        : -spread / 2 + (spread * col) / (inThisRow - 1) + (Math.random() - 0.5) * 1.6;
    sim.spawn(id, 1, x, z);
  });
}

/** Lower sorts closer to the enemy. */
function rankOf(id) {
  const u = UNIT_BY_ID[id];
  if (!u) return 0;
  if (u.speed === 0) return 3; // emplaced siege
  if (u.type === 'ranged') return 2;
  if (u.ability && (u.ability.kind === 'heal' || u.ability.kind === 'summon')) return 2.5;
  return u.shield ? 0 : 1;
}
