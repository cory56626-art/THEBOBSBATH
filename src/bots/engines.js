/**
 * Engine modules for every released Gato. Older bots are byte-identical
 * snapshots of the exact source graph that was rated (verified against Git by
 * tests/bot-snapshots.test.js), so playing "Gato 1" here plays the same engine
 * that earned Gato 1's rating.
 */
import * as active from '../engine.js';
import * as gato2 from './gato2/engine.js';
import * as gato1 from './gato1/engine.js';

export const ENGINES = Object.freeze({
  // Gato 3 is the active engine; tests pin its source graph to the rated 94eab0e.
  'gato-3': active,
  'gato-2': gato2,
  'gato-1': gato1,
});
/** The engine in src/engine.js: the newest released Gato until the next one is frozen. */
export const ACTIVE_ENGINE = active;

export function engineFor(botId) {
  if (!botId) return ACTIVE_ENGINE;
  const engine = ENGINES[botId];
  if (!engine) throw new Error(`Unknown bot: ${botId}`);
  return engine;
}
