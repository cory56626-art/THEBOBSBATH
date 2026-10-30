import { loadNeuralModel } from '../model/index.js';
import { chooseMove, restorePosition } from './engine.js';
import { runSuite, runPairedMatches, calibrateController } from './benchmark.js';

let active = null;
const modelPromise = loadNeuralModel(message => postMessage({ type: 'loading', message }));
modelPromise.then(model => postMessage({ type: 'ready', metadata: model.metadata, modelId: model.metadata.modelId })).catch(error => postMessage({ type: 'init-error', error: error.message }));

self.onmessage = async event => {
  const { id, type, position, options = {} } = event.data;
  if (type === 'cancel') { active?.abort(); return; }
  if (type === 'init') return;
  if (active) { postMessage({ id, type: 'error', error: 'Another experiment is running. Cancel it first.' }); return; }
  const controller = new AbortController();
  active = controller;
  const progress = payload => postMessage({ id, type: 'progress', progress: payload });
  try {
    const model = await modelPromise;
    const settings = { ...options, signal: controller.signal, onProgress: progress };
    let result;
    if (type === 'choose') result = await chooseMove(restorePosition(position), model, settings);
    else if (type === 'compare') {
      result = [];
      for (const mode of ['direct', 'search', 'selective']) {
        result.push(await chooseMove(restorePosition(position), model, { ...settings, mode }));
        progress({ completed: result.length, total: 3, phase: 'Comparing modes', row: result.at(-1) });
      }
    } else if (type === 'suite') result = await runSuite(model, settings);
    else if (type === 'matches') result = await runPairedMatches(model, settings);
    else if (type === 'calibrate') result = await calibrateController(model, settings);
    else throw new Error(`Unknown request: ${type}`);
    postMessage({ id, type: 'result', result });
  } catch (error) {
    postMessage({ id, type: error.name === 'AbortError' ? 'cancelled' : 'error', error: error.message });
  } finally { active = null; }
};
