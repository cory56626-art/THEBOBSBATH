import { test, expect } from '@playwright/test';

const CORNER_MATE = 'k7/8/1QK5/8/8/8/8/8 w - - 0 1';

async function loadCorner(page) {
  await page.locator('[data-tab="position"]').click();
  await page.locator('#fen-input').fill(CORNER_MATE);
  await page.locator('#load-fen').click();
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.fen)).toBe(CORNER_MATE);
  await page.locator('[data-tab="play"]').click();
}

test('AI v3 proves the corner mate in Search and Selective while Direct retains the raw policy baseline', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page.waitForFunction(() => window.__INTUITION__?.ready);
  await expect(page.locator('#mode')).toHaveValue('search');

  for (const mode of ['search', 'selective']) {
    await page.locator('#mode').selectOption(mode);
    await loadCorner(page);
    await page.locator('#play-engine').click();
    await expect(page.locator('#game-status')).toContainText('Checkmate. White wins.');
    const decision = await page.evaluate(() => window.__INTUITION__.latestDecision);
    expect(decision.mode).toBe(mode);
    expect(decision.move).toBe('b6b7');
    expect(decision.san).toBe('Qb7#');
    expect(decision.proven).toBe(true);
    expect(decision.mateInPlies).toBe(1);
    expect(decision.engineVersion).toBe('intuition-hybrid-3');
  }

  await page.locator('#mode').selectOption('direct');
  await loadCorner(page);
  await page.locator('#play-engine').click();
  await expect(page.locator('#game-status')).toContainText('stalemate');
  const direct = await page.evaluate(() => window.__INTUITION__.latestDecision);
  expect(direct.mode).toBe('direct');
  expect(direct.move).toBe('c6c7');
  expect(direct.san).toBe('Kc7');
  expect(direct.nodes).toBe(0);
  expect(direct.engineVersion).toBe('intuition-hybrid-3');

  await loadCorner(page);
  await page.locator('[data-tab="position"]').click();
  await page.locator('#compare-modes').click();
  await expect(page.locator('#comparison-results tbody tr')).toHaveCount(3);
  const report = await page.evaluate(() => window.__INTUITION__.latestReport);
  expect(report.engineVersion).toBe('intuition-hybrid-3');
  expect(report.rows.find((row) => row.mode === 'direct').move).toBe('c6c7');
  expect(report.rows.find((row) => row.mode === 'search').move).toBe('b6b7');
  expect(report.rows.find((row) => row.mode === 'selective').move).toBe('b6b7');
  expect(report.rows.every((row) => row.engineVersion === 'intuition-hybrid-3')).toBe(true);
  expect(errors).toEqual([]);
});
