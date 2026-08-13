/**
 * Faction and unit data.
 *
 * The roster and the point costs follow the real game: ten main factions of
 * seven units each, running from a 50-point Halfling up to the 4000-point
 * Da Vinci Tank, with each faction built around a cheap melee body, a ranged
 * option, a heavy, and a boss. Health, reach and weight are tuned for this
 * 2D simulation rather than copied, but the shape of each unit — what it is
 * for and what beats it — is meant to be recognisable.
 */

export const FACTIONS = [
  { id: 'tribal', name: 'Tribal', color: '#cf8f4e', blurb: 'Cheap bodies, thrown rocks, one very large mammoth.' },
  { id: 'farmer', name: 'Farmer', color: '#8fbf47', blurb: 'Peasants with tools. Numbers over quality.' },
  { id: 'medieval', name: 'Medieval', color: '#9aa7c7', blurb: 'The classic line: squires, archers, a knight, a king.' },
  { id: 'ancient', name: 'Ancient', color: '#d8c07a', blurb: 'Shield walls and long spears. Hard to break head-on.' },
  { id: 'viking', name: 'Viking', color: '#7fb0c9', blurb: 'Aggressive brawlers who hit far above their cost.' },
  { id: 'dynasty', name: 'Dynasty', color: '#e06a5a', blurb: 'Fast, precise, and fond of fireworks.' },
  { id: 'renaissance', name: 'Renaissance', color: '#b58fd0', blurb: 'Gunpowder, jousters, and an armoured tank.' },
  { id: 'pirate', name: 'Pirate', color: '#5fbba0', blurb: 'Short-range gunpowder and a lot of shouting.' },
  { id: 'spooky', name: 'Spooky', color: '#a98fd8', blurb: 'Cheap skeletons, vampires, and a Reaper.' },
  { id: 'wildwest', name: 'Wild West', color: '#e0a35f', blurb: 'Fast draws and dynamite. Fragile but deadly.' },
];

export const FACTION_BY_ID = Object.fromEntries(FACTIONS.map((f) => [f.id, f]));

/**
 * The table below is authored in a readable "design scale" — reaches and
 * speeds as round numbers in the low hundreds. These constants convert that
 * scale into world units, where a wobbler stands about 1.8 units tall.
 * Melee reach converts on the body-size scale (a pike really is ~3 units of
 * pointy stick); ranged reach converts on a longer scale so archers can cover
 * a meaningful slice of a 120-unit battlefield.
 */
const S_MELEE = 0.03125;
const S_RANGED = 0.05;
const S_KNOCKBACK = 0.04;
const S_PROJ_SPEED = 0.045;
const S_PROJ_GRAV = 0.013;

/**
 * @param {object} d unit definition
 * Defaults keep the table readable — most units override only a few fields.
 */
function unit(d) {
  const u = {
    size: 1,
    weight: 1,
    speed: 1,
    windup: 0.22,
    cooldown: 0.85,
    knockback: 40,
    reach: 34,
    type: 'melee',
    shield: false,
    flying: false,
    ...d,
  };

  u.reach *= u.type === 'ranged' ? S_RANGED : S_MELEE;
  u.knockback *= S_KNOCKBACK;
  if (u.proj) {
    u.proj = {
      ...u.proj,
      speed: u.proj.speed * S_PROJ_SPEED,
      gravity: u.proj.gravity * S_PROJ_GRAV,
      r: u.proj.r * S_MELEE,
      ...(u.proj.splash ? { splash: u.proj.splash * S_MELEE } : {}),
    };
  }
  if (u.ability?.radius) u.ability = { ...u.ability, radius: u.ability.radius * S_RANGED };
  return u;
}

export const UNITS = [
  // ---------------- Tribal ----------------
  unit({ id: 'clubber', name: 'Clubber', faction: 'tribal', cost: 70, hp: 80, dmg: 22, weapon: 'club', reach: 32, hat: 'bone' }),
  unit({ id: 'protector', name: 'Protector', faction: 'tribal', cost: 80, hp: 130, dmg: 14, weapon: 'club', reach: 28, shield: true, weight: 1.5, speed: 0.8, cooldown: 1.1 }),
  unit({ id: 'spearthrower', name: 'Spear Thrower', faction: 'tribal', cost: 120, hp: 50, dmg: 34, weapon: 'spear', type: 'ranged', reach: 360, cooldown: 1.7, windup: 0.35, knockback: 60, proj: { kind: 'spear', speed: 780, gravity: 900, r: 4 } }),
  unit({ id: 'stoner', name: 'Stoner', faction: 'tribal', cost: 160, hp: 70, dmg: 26, weapon: 'sling', type: 'ranged', reach: 400, cooldown: 1.5, windup: 0.4, knockback: 70, proj: { kind: 'rock', speed: 620, gravity: 1400, r: 6 } }),
  unit({ id: 'bonemage', name: 'Bone Mage', faction: 'tribal', cost: 300, hp: 60, dmg: 0, weapon: 'staff', type: 'ranged', reach: 340, cooldown: 4.5, windup: 0.6, ability: { kind: 'summon', spawn: 'skeletonwarrior', count: 2 } }),
  unit({ id: 'chieftain', name: 'Chieftain', faction: 'tribal', cost: 400, hp: 300, dmg: 46, weapon: 'club', reach: 42, size: 1.2, weight: 2.6, cooldown: 1.0, knockback: 120, hat: 'crownbone' }),
  unit({ id: 'mammoth', name: 'Mammoth', faction: 'tribal', cost: 2200, hp: 1900, dmg: 90, weapon: 'tusks', reach: 60, size: 2.6, weight: 14, speed: 0.85, cooldown: 1.4, knockback: 520, boss: true, beast: 'mammoth' }),

  // ---------------- Farmer ----------------
  unit({ id: 'halfling', name: 'Halfling', faction: 'farmer', cost: 50, hp: 45, dmg: 12, weapon: 'dagger', reach: 22, size: 0.6, weight: 0.5, speed: 1.25, cooldown: 0.6 }),
  unit({ id: 'farmer', name: 'Farmer', faction: 'farmer', cost: 80, hp: 95, dmg: 20, weapon: 'pitchfork', reach: 46, hat: 'straw' }),
  unit({ id: 'haybaler', name: 'Hay Baler', faction: 'farmer', cost: 140, hp: 120, dmg: 30, weapon: 'scythe', reach: 52, cooldown: 1.1, knockback: 70, hat: 'straw' }),
  unit({ id: 'potionseller', name: 'Potion Seller', faction: 'farmer', cost: 340, hp: 90, dmg: 26, weapon: 'flask', type: 'ranged', reach: 320, cooldown: 2.4, windup: 0.4, proj: { kind: 'potion', speed: 520, gravity: 1500, r: 6, splash: 46, splashDmg: 30 } }),
  unit({ id: 'harvester', name: 'Harvester', faction: 'farmer', cost: 500, hp: 340, dmg: 44, weapon: 'scythe', reach: 62, size: 1.25, weight: 2.4, cooldown: 1.05, knockback: 110 }),
  unit({ id: 'wheelbarrow', name: 'Wheelbarrow', faction: 'farmer', cost: 1000, hp: 420, dmg: 60, weapon: 'barrow', reach: 54, size: 1.3, weight: 3.4, speed: 1.7, cooldown: 1.2, knockback: 320, charger: true }),
  unit({ id: 'scarecrow', name: 'Scarecrow', faction: 'farmer', cost: 1200, hp: 900, dmg: 70, weapon: 'scythe', reach: 76, size: 1.9, weight: 5, speed: 0.9, cooldown: 1.2, knockback: 260, boss: true, hat: 'straw' }),

  // ---------------- Medieval ----------------
  unit({ id: 'bard', name: 'Bard', faction: 'medieval', cost: 60, hp: 70, dmg: 8, weapon: 'lute', reach: 26, ability: { kind: 'inspire', radius: 190, power: 1.28 } }),
  unit({ id: 'squire', name: 'Squire', faction: 'medieval', cost: 100, hp: 110, dmg: 24, weapon: 'sword', reach: 34 }),
  unit({ id: 'archer', name: 'Archer', faction: 'medieval', cost: 140, hp: 40, dmg: 30, weapon: 'bow', type: 'ranged', reach: 440, cooldown: 1.6, windup: 0.45, knockback: 45, proj: { kind: 'arrow', speed: 900, gravity: 620, r: 3 } }),
  unit({ id: 'healer', name: 'Healer', faction: 'medieval', cost: 180, hp: 85, dmg: 0, weapon: 'staff', type: 'ranged', reach: 260, cooldown: 2.2, ability: { kind: 'heal', amount: 55, radius: 260 } }),
  unit({ id: 'knight', name: 'Knight', faction: 'medieval', cost: 650, hp: 480, dmg: 48, weapon: 'sword', reach: 40, size: 1.15, weight: 3.4, speed: 0.9, shield: true, cooldown: 0.95, knockback: 130, hat: 'helm' }),
  unit({ id: 'catapult', name: 'Catapult', faction: 'medieval', cost: 1000, hp: 320, dmg: 110, weapon: 'catapult', type: 'ranged', reach: 820, cooldown: 4.2, windup: 0.8, speed: 0, size: 1.5, weight: 6, knockback: 420, proj: { kind: 'boulder', speed: 700, gravity: 1000, r: 12, splash: 90, splashDmg: 70 } }),
  unit({ id: 'king', name: 'The King', faction: 'medieval', cost: 1500, hp: 1100, dmg: 85, weapon: 'hammer', reach: 52, size: 1.5, weight: 12, speed: 0.75, cooldown: 1.3, knockback: 480, boss: true, hat: 'crown' }),

  // ---------------- Ancient ----------------
  unit({ id: 'shieldbearer', name: 'Shield Bearer', faction: 'ancient', cost: 100, hp: 180, dmg: 14, weapon: 'sword', reach: 26, shield: true, weight: 2.2, speed: 0.72, cooldown: 1.15, hat: 'helm' }),
  unit({ id: 'sarissa', name: 'Sarissa', faction: 'ancient', cost: 120, hp: 90, dmg: 30, weapon: 'pike', reach: 96, speed: 0.8, cooldown: 1.25, windup: 0.3, hat: 'helm' }),
  unit({ id: 'hoplite', name: 'Hoplite', faction: 'ancient', cost: 180, hp: 200, dmg: 30, weapon: 'spear', reach: 58, shield: true, weight: 1.9, speed: 0.85, cooldown: 1.0, hat: 'helm' }),
  unit({ id: 'snakearcher', name: 'Snake Archer', faction: 'ancient', cost: 300, hp: 70, dmg: 26, weapon: 'bow', type: 'ranged', reach: 430, cooldown: 1.5, windup: 0.4, proj: { kind: 'snake', speed: 820, gravity: 500, r: 4, poison: 16 } }),
  unit({ id: 'ballista', name: 'Ballista', faction: 'ancient', cost: 900, hp: 300, dmg: 220, weapon: 'ballista', type: 'ranged', reach: 900, cooldown: 4.6, windup: 0.7, speed: 0, size: 1.45, weight: 6, knockback: 700, proj: { kind: 'bolt', speed: 1500, gravity: 200, r: 5, pierce: 2 } }),
  unit({ id: 'minotaur', name: 'Minotaur', faction: 'ancient', cost: 1600, hp: 1250, dmg: 95, weapon: 'axe', reach: 58, size: 1.8, weight: 8, speed: 1.05, cooldown: 1.15, knockback: 420, boss: true, hat: 'horns' }),
  unit({ id: 'zeus', name: 'Zeus', faction: 'ancient', cost: 2000, hp: 1000, dmg: 70, weapon: 'bolt', type: 'ranged', reach: 620, size: 1.7, weight: 7, cooldown: 2.4, windup: 0.5, knockback: 300, boss: true, ability: { kind: 'lightning', dmg: 130, radius: 70 }, hat: 'laurel' }),

  // ---------------- Viking ----------------
  unit({ id: 'headbutter', name: 'Headbutter', faction: 'viking', cost: 90, hp: 120, dmg: 26, weapon: 'none', reach: 24, speed: 1.3, cooldown: 1.0, knockback: 120, hat: 'horns' }),
  unit({ id: 'icearcher', name: 'Ice Archer', faction: 'viking', cost: 160, hp: 55, dmg: 24, weapon: 'bow', type: 'ranged', reach: 430, cooldown: 1.7, windup: 0.45, proj: { kind: 'ice', speed: 860, gravity: 620, r: 4, slow: 0.45 } }),
  unit({ id: 'brawler', name: 'Brawler', faction: 'viking', cost: 220, hp: 210, dmg: 28, weapon: 'axe', reach: 34, weight: 1.6, cooldown: 0.7, hat: 'horns' }),
  unit({ id: 'berserker', name: 'Berserker', faction: 'viking', cost: 250, hp: 190, dmg: 38, weapon: 'axe', reach: 38, speed: 1.35, cooldown: 0.55, windup: 0.15, knockback: 70, hat: 'horns' }),
  unit({ id: 'valkyrie', name: 'Valkyrie', faction: 'viking', cost: 500, hp: 300, dmg: 52, weapon: 'spear', reach: 56, size: 1.15, weight: 1.4, speed: 1.2, cooldown: 0.9, knockback: 150, flying: true, wings: true }),
  unit({ id: 'longship', name: 'Longship', faction: 'viking', cost: 1000, hp: 850, dmg: 55, weapon: 'ram', reach: 66, size: 1.9, weight: 7, speed: 0.95, cooldown: 1.3, knockback: 380 }),
  unit({ id: 'jarl', name: 'Jarl', faction: 'viking', cost: 1500, hp: 1000, dmg: 78, weapon: 'axe', reach: 50, size: 1.5, weight: 8, speed: 0.95, cooldown: 1.05, knockback: 380, boss: true, hat: 'horns' }),

  // ---------------- Dynasty ----------------
  unit({ id: 'samurai', name: 'Samurai', faction: 'dynasty', cost: 140, hp: 130, dmg: 34, weapon: 'katana', reach: 40, cooldown: 0.72, windup: 0.18, hat: 'kabuto' }),
  unit({ id: 'fireworkarcher', name: 'Firework Archer', faction: 'dynasty', cost: 180, hp: 60, dmg: 22, weapon: 'bow', type: 'ranged', reach: 460, cooldown: 2.0, windup: 0.4, proj: { kind: 'firework', speed: 760, gravity: 380, r: 5, splash: 60, splashDmg: 34 } }),
  unit({ id: 'monk', name: 'Monk', faction: 'dynasty', cost: 250, hp: 160, dmg: 26, weapon: 'none', reach: 28, speed: 1.15, cooldown: 0.5, ability: { kind: 'heal', amount: 32, radius: 170 } }),
  unit({ id: 'ninja', name: 'Ninja', faction: 'dynasty', cost: 500, hp: 140, dmg: 44, weapon: 'dagger', reach: 30, speed: 1.75, weight: 0.7, cooldown: 0.42, windup: 0.1, hat: 'hood' }),
  unit({ id: 'dragon', name: 'Dragon', faction: 'dynasty', cost: 1000, hp: 700, dmg: 40, weapon: 'fire', type: 'ranged', reach: 300, size: 1.7, weight: 4, cooldown: 1.4, windup: 0.3, flying: true, wings: true, proj: { kind: 'fire', speed: 560, gravity: 120, r: 8, splash: 54, splashDmg: 26 } }),
  unit({ id: 'hwacha', name: 'Hwacha', faction: 'dynasty', cost: 1500, hp: 340, dmg: 46, weapon: 'hwacha', type: 'ranged', reach: 760, cooldown: 5.0, windup: 0.6, speed: 0, size: 1.5, weight: 6, knockback: 160, volley: 7, proj: { kind: 'rocket', speed: 880, gravity: 300, r: 4 } }),
  unit({ id: 'monkeyking', name: 'Monkey King', faction: 'dynasty', cost: 2000, hp: 1150, dmg: 82, weapon: 'staffgold', reach: 74, size: 1.45, weight: 6, speed: 1.3, cooldown: 0.8, knockback: 340, boss: true, hat: 'circlet' }),

  // ---------------- Renaissance ----------------
  unit({ id: 'painter', name: 'Painter', faction: 'renaissance', cost: 50, hp: 60, dmg: 14, weapon: 'brush', reach: 30, cooldown: 0.9 }),
  unit({ id: 'fencer', name: 'Fencer', faction: 'renaissance', cost: 150, hp: 105, dmg: 30, weapon: 'rapier', reach: 46, speed: 1.25, cooldown: 0.5, windup: 0.12, hat: 'plume' }),
  unit({ id: 'balloonarcher', name: 'Balloon Archer', faction: 'renaissance', cost: 200, hp: 60, dmg: 26, weapon: 'bow', type: 'ranged', reach: 470, cooldown: 1.8, windup: 0.4, flying: true, balloon: true, proj: { kind: 'arrow', speed: 880, gravity: 620, r: 3 } }),
  unit({ id: 'musketeer', name: 'Musketeer', faction: 'renaissance', cost: 250, hp: 90, dmg: 85, weapon: 'musket', type: 'ranged', reach: 560, cooldown: 3.4, windup: 0.55, knockback: 190, proj: { kind: 'bullet', speed: 1900, gravity: 60, r: 3 }, hat: 'plume' }),
  unit({ id: 'halberd', name: 'Halberd', faction: 'renaissance', cost: 400, hp: 220, dmg: 46, weapon: 'halberd', reach: 76, weight: 1.7, speed: 0.9, cooldown: 1.2, knockback: 150, hat: 'helm' }),
  unit({ id: 'jouster', name: 'Jouster', faction: 'renaissance', cost: 1000, hp: 520, dmg: 120, weapon: 'lance', reach: 96, size: 1.35, weight: 4.5, speed: 1.9, cooldown: 2.2, knockback: 620, charger: true, hat: 'plume' }),
  unit({ id: 'davincitank', name: 'Da Vinci Tank', faction: 'renaissance', cost: 4000, hp: 3000, dmg: 130, weapon: 'tankguns', type: 'ranged', reach: 640, size: 2.4, weight: 20, speed: 0.55, cooldown: 2.6, windup: 0.4, knockback: 380, boss: true, volley: 3, proj: { kind: 'cannonball', speed: 1000, gravity: 420, r: 7, splash: 60, splashDmg: 50 } }),

  // ---------------- Pirate ----------------
  unit({ id: 'flintlock', name: 'Flintlock', faction: 'pirate', cost: 100, hp: 75, dmg: 42, weapon: 'pistol', type: 'ranged', reach: 380, cooldown: 2.6, windup: 0.35, knockback: 120, proj: { kind: 'bullet', speed: 1500, gravity: 120, r: 3 }, hat: 'bandana' }),
  unit({ id: 'blunderbuss', name: 'Blunderbuss', faction: 'pirate', cost: 160, hp: 95, dmg: 22, weapon: 'blunderbuss', type: 'ranged', reach: 240, cooldown: 3.0, windup: 0.4, knockback: 110, volley: 6, spread: 0.22, proj: { kind: 'pellet', speed: 1100, gravity: 500, r: 2 }, hat: 'tricorn' }),
  unit({ id: 'bombthrower', name: 'Bomb Thrower', faction: 'pirate', cost: 250, hp: 110, dmg: 20, weapon: 'bomb', type: 'ranged', reach: 340, cooldown: 3.2, windup: 0.45, knockback: 260, proj: { kind: 'bomb', speed: 520, gravity: 1200, r: 7, splash: 110, splashDmg: 95 }, hat: 'bandana' }),
  unit({ id: 'harpooner', name: 'Harpooner', faction: 'pirate', cost: 300, hp: 130, dmg: 60, weapon: 'harpoon', type: 'ranged', reach: 400, cooldown: 2.6, windup: 0.4, knockback: 340, proj: { kind: 'harpoon', speed: 1000, gravity: 400, r: 4 }, hat: 'bandana' }),
  unit({ id: 'cannon', name: 'Cannon', faction: 'pirate', cost: 1000, hp: 300, dmg: 150, weapon: 'cannon', type: 'ranged', reach: 800, cooldown: 4.4, windup: 0.6, speed: 0, size: 1.4, weight: 7, knockback: 560, proj: { kind: 'cannonball', speed: 950, gravity: 560, r: 9, splash: 80, splashDmg: 80 } }),
  unit({ id: 'captain', name: 'Captain', faction: 'pirate', cost: 1500, hp: 620, dmg: 64, weapon: 'cutlass', reach: 44, size: 1.25, weight: 3.6, speed: 1.1, cooldown: 0.7, knockback: 180, ability: { kind: 'inspire', radius: 220, power: 1.35 }, hat: 'tricorn' }),
  unit({ id: 'piratequeen', name: 'Pirate Queen', faction: 'pirate', cost: 2500, hp: 1500, dmg: 92, weapon: 'cutlass', reach: 52, size: 1.55, weight: 8, speed: 1.15, cooldown: 0.75, knockback: 340, boss: true, ability: { kind: 'inspire', radius: 260, power: 1.4 }, hat: 'tricorn' }),

  // ---------------- Spooky ----------------
  unit({ id: 'skeletonwarrior', name: 'Skeleton Warrior', faction: 'spooky', cost: 80, hp: 65, dmg: 22, weapon: 'sword', reach: 32, weight: 0.7, bones: true }),
  unit({ id: 'skeletonarcher', name: 'Skeleton Archer', faction: 'spooky', cost: 180, hp: 45, dmg: 26, weapon: 'bow', type: 'ranged', reach: 440, cooldown: 1.7, windup: 0.42, weight: 0.7, bones: true, proj: { kind: 'arrow', speed: 880, gravity: 620, r: 3 } }),
  unit({ id: 'candlehead', name: 'Candlehead', faction: 'spooky', cost: 200, hp: 120, dmg: 26, weapon: 'torch', reach: 34, burn: 18, hat: 'candle' }),
  unit({ id: 'vampire', name: 'Vampire', faction: 'spooky', cost: 200, hp: 140, dmg: 30, weapon: 'claws', reach: 30, speed: 1.3, cooldown: 0.6, ability: { kind: 'lifesteal', ratio: 0.85 }, hat: 'cape' }),
  unit({ id: 'pumpkincatapult', name: 'Pumpkin Catapult', faction: 'spooky', cost: 1000, hp: 300, dmg: 95, weapon: 'catapult', type: 'ranged', reach: 780, cooldown: 4.0, windup: 0.7, speed: 0, size: 1.45, weight: 6, knockback: 340, proj: { kind: 'pumpkin', speed: 700, gravity: 1000, r: 11, splash: 96, splashDmg: 62 } }),
  unit({ id: 'swordcaster', name: 'Swordcaster', faction: 'spooky', cost: 1000, hp: 420, dmg: 54, weapon: 'staff', type: 'ranged', reach: 480, size: 1.2, weight: 2.6, cooldown: 1.5, windup: 0.35, knockback: 130, volley: 3, proj: { kind: 'sword', speed: 900, gravity: 260, r: 5 } }),
  unit({ id: 'reaper', name: 'Reaper', faction: 'spooky', cost: 2500, hp: 1400, dmg: 110, weapon: 'scythe', reach: 84, size: 1.75, weight: 7, speed: 1.1, cooldown: 1.1, knockback: 380, boss: true, flying: true, ability: { kind: 'lifesteal', ratio: 0.6 }, hat: 'hood' }),

  // ---------------- Wild West ----------------
  unit({ id: 'dynamitethrower', name: 'Dynamite Thrower', faction: 'wildwest', cost: 100, hp: 80, dmg: 16, weapon: 'dynamite', type: 'ranged', reach: 330, cooldown: 3.4, windup: 0.45, knockback: 300, proj: { kind: 'dynamite', speed: 540, gravity: 1150, r: 6, splash: 120, splashDmg: 105 }, hat: 'cowboy' }),
  unit({ id: 'miner', name: 'Miner', faction: 'wildwest', cost: 200, hp: 160, dmg: 34, weapon: 'pickaxe', reach: 36, weight: 1.4, cooldown: 0.9, hat: 'minerhat' }),
  unit({ id: 'cactus', name: 'Cactus', faction: 'wildwest', cost: 400, hp: 320, dmg: 18, weapon: 'none', reach: 34, speed: 0.5, weight: 2.4, cooldown: 0.5, thorns: 24, plant: true }),
  unit({ id: 'gunslinger', name: 'Gunslinger', faction: 'wildwest', cost: 650, hp: 150, dmg: 40, weapon: 'revolver', type: 'ranged', reach: 480, cooldown: 2.4, windup: 0.25, knockback: 90, volley: 4, proj: { kind: 'bullet', speed: 1700, gravity: 80, r: 3 }, hat: 'cowboy' }),
  unit({ id: 'lasso', name: 'Lasso', faction: 'wildwest', cost: 740, hp: 190, dmg: 30, weapon: 'lasso', type: 'ranged', reach: 360, cooldown: 2.8, windup: 0.4, knockback: 520, proj: { kind: 'lasso', speed: 800, gravity: 300, r: 5, yank: true }, hat: 'cowboy' }),
  unit({ id: 'deadeye', name: 'Deadeye', faction: 'wildwest', cost: 900, hp: 130, dmg: 240, weapon: 'rifle', type: 'ranged', reach: 950, cooldown: 4.2, windup: 0.8, knockback: 260, proj: { kind: 'bullet', speed: 2400, gravity: 30, r: 3, pierce: 1 }, hat: 'cowboy' }),
  unit({ id: 'quickdraw', name: 'Quick Draw', faction: 'wildwest', cost: 1200, hp: 480, dmg: 55, weapon: 'revolver', type: 'ranged', reach: 520, size: 1.3, weight: 3.5, cooldown: 1.3, windup: 0.12, knockback: 120, volley: 6, boss: true, proj: { kind: 'bullet', speed: 1900, gravity: 70, r: 3 }, hat: 'cowboy' }),
];

export const UNIT_BY_ID = Object.fromEntries(UNITS.map((u) => [u.id, u]));

export const unitsOf = (factionId) => UNITS.filter((u) => u.faction === factionId);
