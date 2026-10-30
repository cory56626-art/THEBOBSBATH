/** Offline, independent Stockfish oracle assessment. Stockfish is never used by the app. */
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import os from 'node:os';
import { Chess } from 'chess.js';
import { createModelFromBytes, MODEL_METADATA } from '../model/index.js';

const root = new URL('../', import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return [arg.slice(0, i < 0 ? undefined : i).replace(/^--/, ''), i < 0 ? true : arg.slice(i + 1)]; }));
const hash = text => createHash('sha256').update(text).digest('hex');
const oracleNodes = Math.max(1000, Math.floor(Number(args.nodes) || 100000));
const budgetMs = Math.max(1, Number(args.budget) || 500);
const maxNodes = Math.max(1, Math.floor(Number(args['max-nodes']) || 128));
const modes = String(args.modes || 'direct,search,selective').split(',');
const binary = args.stockfish || process.env.STOCKFISH_BINARY || '/workspace/tools/stockfish-19/stockfish/stockfish-linux-x86-64-universal';
const output = new URL(args.output || 'docs/ai-baseline.json', root);
const sourcePath = args['engine-source'] ? new URL(args['engine-source'], root) : new URL('src/engine.js', root);
const engineSource = await readFile(sourcePath, 'utf8');
const moduleSource = engineSource.replace(/(from\s+|import\s*)['"]([^'"]+)['"]/g, (_, prefix, specifier) => `${prefix}${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, new URL('src/engine.js', root)).href : import.meta.resolve(specifier))}`);
const { chooseMove, ENGINE_VERSION } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
const gateBytes = await readFile(args['gate-source'] ? new URL(args['gate-source'], root) : new URL('src/default-controller.json', root));
const gate = JSON.parse(gateBytes);
const model = createModelFromBytes(JSON.parse(await readFile(new URL('model/capsule.json', root), 'utf8')), await readFile(new URL('model/weights.bin', root)));
const uciOf = move => move.from + move.to + (move.promotion || '');
const key = fen => fen.split(' ').slice(0, 4).join(' ');

function positions() {
  const curated = [
    ['white-mate-one', 'White immediate mate', '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', 'development'],
    ['corner-mate-one', 'Corner immediate mate', 'k7/8/1QK5/8/8/8/8/8 w - - 0 1', 'development'],
    ['hanging-queen', 'Pawn can capture queen', '7k/8/8/4q3/3P4/8/8/K7 w - - 0 1', 'development'],
    ['black-mate-one', 'Black immediate mate', '8/8/8/8/8/6k1/5q2/7K b - - 0 1', 'heldout'],
    ['promotion-mate-one', 'Promotion immediate mate', '7k/P7/6K1/8/8/8/8/8 w - - 0 1', 'heldout'],
    ['rook-takes-queen', 'Rook can capture queen', '4k3/8/8/8/4q3/8/4R3/4K3 w - - 0 1', 'heldout'],
  ].map(([id, name, fen, split]) => ({ id, name, fen, split, group: id, source: 'Authored legal tactical stress position' }));
  const openings = [
    ['Ruy Lopez', ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6']],
    ['Queen’s Gambit', ['d4','d5','c4','e6','Nc3','Nf6','Bg5','Be7']],
    ['Sicilian', ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6']],
    ['French', ['e4','e6','d4','d5','Nc3','Nf6','Bg5','Be7']],
    ['King’s Indian', ['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6']],
    ['English', ['c4','e5','Nc3','Nf6','Nf3','Nc6','g3','d5']],
    ['Caro-Kann', ['e4','c6','d4','d5','Nc3','dxe4','Nxe4','Bf5']],
  ];
  let seed = 0xA17E2026;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const seen = new Set([...curated.map(p => key(p.fen)), ...(gate.samples || []).map(p => key(p.fen))]);
  for (let group = 0; group < openings.length; group++) {
    const [name, opening] = openings[group], board = new Chess();
    for (const move of opening) board.move(move);
    let added = 0;
    for (let ply = 0; ply < 36 && added < 2 && !board.isGameOver(); ply++) {
      const legal = board.moves({ verbose: true });
      // Independent seeded continuations deliberately include tactical stress,
      // rather than claiming to represent the distribution of human games.
      const weights = legal.map(m => m.captured ? 1.6 : m.piece === 'p' ? 1.1 : 1);
      let target = random() * weights.reduce((a,b) => a+b,0), index = 0;
      while (index < legal.length - 1 && target > weights[index]) target -= weights[index++];
      board.move(legal[index]);
      if (ply >= 9 && (ply - 9) % 6 === 0 && !board.isGameOver() && !seen.has(key(board.fen()))) {
        seen.add(key(board.fen())); added++;
        curated.push({ id: `generated-${group}-${added}`, name: `${name} independent continuation ${added}`, fen: board.fen(), split: group < 3 ? 'development' : 'heldout', group: `generated-game-${group}`, source: 'New seeded legal continuation, seed 0xA17E2026; excludes all controller calibration FENs' });
      }
    }
    if (added !== 2) throw new Error(`Could not create two independent positions for ${name}`);
  }
  return curated;
}

class Stockfish {
  constructor(path) {
    this.child = spawn(path, [], { stdio: ['pipe','pipe','pipe'] });
    this.lines = createInterface({ input: this.child.stdout });
    this.stderr = '';
    this.child.stderr.on('data', bytes => { this.stderr = (this.stderr + bytes).slice(-2000); });
    this.child.on('error', error => { this.error = error; });
  }
  send(command) { this.child.stdin.write(command + '\n'); }
  wait(predicate, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.lines.off('line', onLine); this.child.off('error', onError); this.child.off('exit', onExit); };
      const onLine = line => { if (predicate(line)) { cleanup(); resolve(line); } };
      const onError = error => { cleanup(); reject(error); };
      const onExit = code => { cleanup(); reject(new Error(`Stockfish exited ${code}: ${this.stderr}`)); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for Stockfish')); }, timeout);
      this.lines.on('line', onLine); this.child.on('error', onError); this.child.on('exit', onExit);
      if (this.error) onError(this.error);
    });
  }
  async ready() { const ready = this.wait(line => line === 'readyok'); this.send('isready'); await ready; }
  async init() {
    this.name = 'Unknown UCI engine';
    this.lines.on('line', line => { if (line.startsWith('id name ')) this.name = line.slice(8); });
    const initialized = this.wait(line => line === 'uciok'); this.send('uci'); await initialized;
    this.send('setoption name Threads value 1'); this.send('setoption name Hash value 16'); this.send('setoption name MultiPV value 1'); this.send('setoption name UCI_AnalyseMode value true');
    await this.ready();
  }
  async analyze(fen, forcedMove) {
    this.send('ucinewgame'); this.send('setoption name Clear Hash'); this.send(`position fen ${fen}`); await this.ready();
    let info = null;
    const collect = line => {
      const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
      if (!line.startsWith('info ') || !score) return;
      info = { score: { type: score[1], value: Number(score[2]), bound: /\b(lowerbound|upperbound)\b/.exec(line)?.[1] || null }, depth: Number(/\bdepth (\d+)/.exec(line)?.[1] || 0), nodes: Number(/\bnodes (\d+)/.exec(line)?.[1] || 0), timeMs: Number(/\btime (\d+)/.exec(line)?.[1] || 0), pv: /\bpv (.+)/.exec(line)?.[1]?.trim().split(/\s+/) || [] };
    };
    this.lines.on('line', collect);
    try {
      const done = this.wait(line => line.startsWith('bestmove '));
      this.send(`go nodes ${oracleNodes}${forcedMove ? ` searchmoves ${forcedMove}` : ''}`);
      const line = await done;
      if (!info) throw new Error(`Stockfish returned no evaluation for ${fen}`);
      return { ...info, bestMove: line.split(/\s+/)[1], forcedMove: forcedMove || null };
    } finally { this.lines.off('line', collect); }
  }
  close() { this.send('quit'); this.child.stdin.end(); }
}

const fixedPositions = args['positions-file'] ? JSON.parse(await readFile(new URL(args['positions-file'], root), 'utf8')).positions : positions();
const selectedPositions = fixedPositions.slice(0, Math.max(1, Number(args.limit) || fixedPositions.length));
const oracle = new Stockfish(binary);
const rows = [];
let gitCommit = null;
try { gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
const report = {
  createdAt: new Date().toISOString(), gitCommit, engineVersion: ENGINE_VERSION, engineSourceSHA256: hash(engineSource), controllerSourceSHA256: hash(await readFile(new URL('src/controller.js', root))), evaluationScriptSHA256: hash(await readFile(new URL('scripts/evaluate-ai.mjs', root))),
  model: MODEL_METADATA, controllerSHA256: hash(gateBytes), positionSetSHA256: hash(JSON.stringify(selectedPositions)),
  settings: { budgetMs, maxNodes, threshold: 0.5, modes, oracleNodes, oracleThreads: 1, oracleHashMB: 16, oracleHashClearedPerQuery: true },
  oracle: { source: 'https://github.com/official-stockfish/Stockfish/releases/tag/sf_19', releaseArchiveSHA256: '9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f', executableSHA256: hash(await readFile(binary)) },
  environment: { node: process.version, platform: os.platform(), architecture: os.arch(), cpu: os.cpus()[0]?.model },
  positions: selectedPositions, rows,
  caveats: [
    'Offline oracle only: Stockfish is not part of the app or its inference algorithm.',
    'Fixed-node Stockfish estimates are not perfect chess truth and are not an Elo rating.',
    'Each chosen move is independently evaluated with the same root node budget; restricted searches can disagree with the unrestricted root estimate. Raw scores and instability flags are retained.',
    'Centipawn-loss averages exclude mate scores and bound-only estimates. Negative raw differences are flagged and clamped only for the nonnegative regret summary.',
    'FEN-only assessments do not test repetition-history decisions or full-game strategic strength.',
    'The small authored/generated stress set is not representative of all human chess. Development and held-out groups are fixed before candidate changes; do not tune on held-out outcomes.',
  ],
};
try {
  await oracle.init(); report.oracle.name = oracle.name;
  model.infer(new Chess());
  for (let i = 0; i < selectedPositions.length; i++) {
    const position = selectedPositions[i], board = new Chess(position.fen);
    const matingMoves = board.moves({ verbose: true }).filter(move => { board.move(move); const mate = board.isCheckmate(); board.undo(); return mate; }).map(uciOf);
    const reference = await oracle.analyze(position.fen);
    const forced = new Map([[reference.bestMove, reference]]);
    for (const mode of modes) {
      const result = await chooseMove(new Chess(position.fen), model, { mode, budgetMs, maxNodes, threshold: .5, gate });
      if (!result.move) throw new Error(`Unexpected terminal AI result for ${position.id}`);
      if (!forced.has(result.move)) forced.set(result.move, await oracle.analyze(position.fen, result.move));
      const chosenReference = forced.get(result.move);
      const comparableCP = reference.score.type === 'cp' && chosenReference.score.type === 'cp' && !reference.score.bound && !chosenReference.score.bound;
      const rawCpDelta = comparableCP ? reference.score.value - chosenReference.score.value : null;
      rows.push({ positionId: position.id, name: position.name, split: position.split, group: position.group, fen: position.fen, mode, move: result.move, san: result.san, elapsedMs: result.elapsedMs, nodes: result.nodes, inferenceCalls: result.inferenceCalls, searched: result.searched, gate: result.gate, oracle: reference, chosenReference, agreesWithOracleBest: result.move === reference.bestMove, rawCpDelta, cpLoss: rawCpDelta === null ? null : Math.max(0, rawCpDelta), referenceInstability: rawCpDelta !== null && rawCpDelta < -25, mateInOneAvailable: matingMoves.length > 0, missedMateInOne: matingMoves.length > 0 && !matingMoves.includes(result.move), winningMateNotConfirmed: reference.score.type === 'mate' && reference.score.value > 0 && !(chosenReference.score.type === 'mate' && chosenReference.score.value > 0), newlyAllowsForcedMate: chosenReference.score.type === 'mate' && chosenReference.score.value < 0 && !(reference.score.type === 'mate' && reference.score.value < 0) });
    }
    console.log(`${i + 1}/${selectedPositions.length} ${position.id}: ${rows.slice(-modes.length).map(row => `${row.mode}=${row.san}${row.missedMateInOne ? '(missed mate)' : row.cpLoss === null ? '' : `(-${row.cpLoss}cp)`}`).join(' ')}`);
  }
  report.summary = ['all', 'development', 'heldout'].flatMap(split => modes.map(mode => {
    const items = rows.filter(row => row.mode === mode && (split === 'all' || row.split === split)), cp = items.filter(row => row.cpLoss !== null);
    return { split, mode, positions: items.length, exactBest: items.filter(row => row.agreesWithOracleBest).length, cpComparable: cp.length, averageCpLoss: cp.length ? cp.reduce((sum,row) => sum+row.cpLoss,0)/cp.length : null, severeCpLoss200: cp.filter(row => row.cpLoss >= 200).length, mateInOneAvailable: items.filter(row => row.mateInOneAvailable).length, missedMateInOne: items.filter(row => row.missedMateInOne).length, winningMateNotConfirmed: items.filter(row => row.winningMateNotConfirmed).length, newlyAllowsForcedMate: items.filter(row => row.newlyAllowsForcedMate).length, referenceInstability: items.filter(row => row.referenceInstability).length, averageMs: items.length ? items.reduce((sum,row) => sum+row.elapsedMs,0)/items.length : null };
  }));
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary)); console.log(`Saved ${output.pathname}`);
} finally { oracle.close(); }
