import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedScore, ratingForScore, aiScore, estimateRating } from '../scripts/lib/elo-rating.mjs';
import { DEFAULT_ELOS, eloOptions, validateEloOptions } from '../scripts/lib/elo-protocol.mjs';
import { getOpenings } from '../scripts/lib/chess-openings.mjs';

function schedule(score = 0.5) {
  return DEFAULT_ELOS.flatMap(elo => Array.from({ length: 4 }, (_, index) => [0, 1].map(reverse => ({
    elo, pair: index + 1, round: 1,
    whiteEngine: reverse ? 'stockfish' : 'intuition', blackEngine: reverse ? 'intuition' : 'stockfish',
    result: score === 0.5 ? '1/2-1/2' : score === (reverse ? 0 : 1) ? '1-0' : '0-1',
    winner: score === 0.5 ? null : score === (reverse ? 0 : 1) ? 'w' : 'b',
  })))).flat();
}

test('ladder uses four color-reversed openings and 32 total games with Elo limiter, skill 20, one thread', () => {
  assert.equal(getOpenings('pilot8').length * 2 * DEFAULT_ELOS.length, 32);
  assert.deepEqual(eloOptions(1520), { Threads: 1, Hash: 16, MultiPV: 1, Ponder: false, 'Skill Level': 20, UCI_LimitStrength: true, UCI_Elo: 1520 });
  const advertised = Object.keys(eloOptions(1320)).map(name => `option name ${name} type ${name === 'UCI_Elo' ? 'spin default 1320 min 1320 max 3190' : 'check default false'}`);
  validateEloOptions(advertised, DEFAULT_ELOS);
  assert.throws(() => validateEloOptions(advertised, [1319]), /range/);
  assert.throws(() => validateEloOptions([], DEFAULT_ELOS), /advertise/);
});

test('logistic inversion handles differing opponents, symmetries and boundary scores', () => {
  assert.equal(expectedScore(1520, 1520), 0.5);
  assert.ok(Math.abs(ratingForScore(0.5, DEFAULT_ELOS) - 1620) < 1e-8);
  assert.equal(ratingForScore(0, DEFAULT_ELOS), -Infinity);
  assert.equal(ratingForScore(1, DEFAULT_ELOS), Infinity);
  assert.throws(() => ratingForScore(1.1, DEFAULT_ELOS), /Score/);
});

test('all-draw ladder estimates midpoint with conservative pair-level uncertainty', () => {
  const result = estimateRating(schedule(), { plannedGames: 32 });
  assert.equal(result.status, 'provisional');
  assert.equal(result.pairCount, 16);
  assert.ok(Math.abs(result.pointEstimate - 1620) < 1e-8);
  assert.ok(result.interval.lower < 1300);
  assert.ok(result.interval.upper > 1940);
  assert.ok(Math.abs(result.interval.scoreRadius - Math.sqrt(Math.log(40) / 32)) < 1e-8);
});

test('truncations and an incomplete schedule always withhold the main point and interval', () => {
  const games = schedule();
  games[0].result = '*';
  assert.equal(aiScore(games[0]), null);
  const result = estimateRating(games, { plannedGames: 32 });
  assert.equal(result.status, 'withheld');
  assert.equal(result.pointEstimate, null);
  assert.equal(result.interval, null);
  assert.equal(result.scored, 31);
  assert.equal(estimateRating(schedule().slice(0, 30), { plannedGames: 32 }).status, 'withheld');
});

test('all losses/wins yield bound-only reports, and malformed color pairs are rejected', () => {
  const losses = estimateRating(schedule(0), { plannedGames: 32 });
  assert.equal(losses.status, 'bound-only');
  assert.equal(losses.pointEstimate, null);
  assert.equal(losses.interval.lowerUnbounded, true);
  assert.equal(losses.points, 0);
  const wins = estimateRating(schedule(1), { plannedGames: 32 });
  assert.equal(wins.interval.upperUnbounded, true);
  assert.equal(wins.points, 32);
  const games = schedule();
  games[1].whiteEngine = games[0].whiteEngine;
  assert.throws(() => estimateRating(games, { plannedGames: 32 }), /reversed colors/);
  assert.throws(() => aiScore({ result: '1-0', winner: 'b' }), /mismatch/);
});

test('runner records exact limiter/movetime protocol, four game pilot PGNs, and withholds truncated rating', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const { validateGames } = await import('../scripts/lib/validate-games.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'elo-protocol-'));
  const fake = join(directory, 'stockfish.mjs'), engine = join(directory, 'engine.mjs');
  const commands = join(directory, 'commands.txt'), reportPath = join(directory, 'report.json');
  try {
    await writeFile(engine, `export const ENGINE_VERSION='rating-fixture'; export async function chooseMove(chess) { const m=chess.moves({verbose:true})[0]; return {move:m.from+m.to+(m.promotion||''),nodes:0}; }`);
    await writeFile(fake, `#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { Chess } from ${JSON.stringify(import.meta.resolve('chess.js'))};
let history=[];
for await (const command of createInterface({input:process.stdin})) {
  appendFileSync(${JSON.stringify(commands)},command+'\\n');
  if(command==='uci') process.stdout.write('id name Stockfish 19 protocol fixture\\noption name Clear Hash type button\\n'+${JSON.stringify(Object.keys(eloOptions(1320)).map(name => `option name ${name} type ${name === 'UCI_Elo' ? 'spin default 1320 min 1320 max 3190' : 'check default false'}`).join('\n'))}+'\\nuciok\\n');
  if(command==='isready') process.stdout.write('readyok\\n');
  if(command.startsWith('position startpos')) history=command.includes(' moves ')?command.split(' moves ')[1].split(' '):[];
  if(command.startsWith('go ')){const chess=new Chess();for(const move of history)chess.move(move);const m=chess.moves({verbose:true})[0];process.stdout.write('bestmove '+m.from+m.to+(m.promotion||'')+'\\n');}
  if(command==='quit') break;
}
`, { mode: 0o755 });
    await promisify(execFile)(process.execPath, ['scripts/rate-ai.mjs', `--stockfish=${fake}`, `--engine-source=${engine}`, '--elos=1320', '--opening-set=arena4', '--max-plies=2', '--budget=100', '--max-nodes=1', `--output=${reportPath}`, `--pgn=${join(directory, 'games.pgn')}`], { cwd: new URL('../', import.meta.url), timeout: 30000 });
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.games.length, 4);
    assert.equal(report.rating.status, 'withheld');
    assert.equal(report.rating.pointEstimate, null);
    assert.equal(report.rating.unfinished, 4);
    assert.equal(report.settings.stockfishNodeCap, null);
    assert.equal(validateGames(report).unfinished, 4);
    assert.ok(report.engine.sourceTreeSHA256);
    const log = await readFile(commands, 'utf8');
    assert.match(log, /setoption name UCI_LimitStrength value true/);
    assert.match(log, /setoption name Skill Level value 20/);
    assert.match(log, /setoption name UCI_Elo value 1320/);
    assert.match(log, /go movetime 100/);
    assert.doesNotMatch(log, /go nodes/);
    assert.equal((log.match(/ucinewgame/g) || []).length, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
