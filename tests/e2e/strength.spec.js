import { test, expect } from '@playwright/test';
import { Chess } from 'chess.js';

const POISONED_PAWN = '4r1k1/8/8/4p3/8/8/4Q3/6K1 w - - 0 1';

test('real hybrid search expands tactical positions offline and rejects a poisoned capture', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const initial = new Chess(POISONED_PAWN);
  expect(initial.moves().some(move => move.endsWith('#'))).toBe(false);

  await page.goto('./');
  await page.waitForFunction(() => window.__INTUITION__?.ready === true);
  await page.locator('#budget').selectOption('500');
  await page.locator('#node-limit').selectOption('32768');
  await page.locator('[data-tab="position"]').click();
  await page.locator('#fen-input').fill(POISONED_PAWN);
  await page.locator('#load-fen').click();
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.fen)).toBe(POISONED_PAWN);

  // The deployed worker must perform the whole decision locally once its model
  // has loaded; an external chess engine cannot supply these search results.
  await context.setOffline(true);
  await page.locator('#compare-modes').click();
  await expect(page.locator('#comparison-results tbody tr')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.busy)).toBe(false);
  const report = await page.evaluate(() => window.__INTUITION__.latestReport);
  expect(report.engineVersion).toBe('intuition-hybrid-3');

  for (const mode of ['search', 'selective']) {
    const decision = report.rows.find(row => row.mode === mode);
    expect(decision.engineVersion).toBe('intuition-hybrid-3');
    expect(decision.searchKind).toBe('neural-ordered-alpha-beta');
    expect(decision.nodeUnit).toBe('tactical-position');
    expect(decision.inferenceCalls).toBe(1);
    expect(decision.nodes).toBeGreaterThan(100);
    expect(decision.nodes).toBeLessThanOrEqual(32768);
    expect(decision.tacticalNodes).toBe(decision.nodes);
    expect(decision.qNodes).toBeGreaterThan(0);
    expect(decision.depth).toBeGreaterThanOrEqual(2);
    expect(decision.completedIterations).toBeGreaterThanOrEqual(2);
    expect(decision.valueSource).toBe('tactical-search');
    expect(Number.isFinite(decision.scoreCp)).toBe(true);
    expect(decision.move).not.toBe('e2e5');
    const replay = new Chess(POISONED_PAWN);
    const move = replay.move({ from: decision.move.slice(0, 2), to: decision.move.slice(2, 4), promotion: decision.move[4] });
    expect(move.san).toBe(decision.san);
  }

  expect(await page.evaluate(() => window.__INTUITION__.fen)).toBe(POISONED_PAWN);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
