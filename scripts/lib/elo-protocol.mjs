export const DEFAULT_ELOS = Object.freeze([1320, 1520, 1720, 1920]);
export function eloOptions(elo) {
  if (!Number.isInteger(elo)) throw new Error('UCI_Elo must be an integer');
  return { Threads: 1, Hash: 16, MultiPV: 1, Ponder: false, 'Skill Level': 20, UCI_LimitStrength: true, UCI_Elo: elo };
}
export function validateEloOptions(advertised, elos) {
  for (const name of Object.keys(eloOptions(elos[0]))) {
    if (!advertised.some(line => line.startsWith(`option name ${name} type `))) throw new Error(`Engine does not advertise UCI option ${name}`);
  }
  const option = advertised.find(line => line.startsWith('option name UCI_Elo type spin '));
  const min = Number(/\bmin (-?\d+)/.exec(option)?.[1]);
  const max = Number(/\bmax (-?\d+)/.exec(option)?.[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || elos.some(elo => !Number.isInteger(elo) || elo < min || elo > max)) throw new Error('Requested Elo ladder lies outside the advertised UCI_Elo range');
}
