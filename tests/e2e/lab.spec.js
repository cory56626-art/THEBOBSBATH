import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Chess } from 'chess.js';

const test = base.extend({
  pageErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
    expect(errors, 'No unhandled browser exceptions').toEqual([]);
  }, { auto: true }],
});

async function openLab(page) {
  await page.goto('./');
  await page.waitForFunction(() => window.__INTUITION__?.ready === true);
  await expect(page.locator('#model-status')).toHaveText('Neural model ready');
}

async function tab(page, name) {
  await page.locator(`[data-tab="${name}"]`).click();
  await expect(page.locator(`#panel-${name}`)).toBeVisible();
}

async function loadFEN(page, fen) {
  await tab(page, 'position');
  await page.locator('#fen-input').fill(fen);
  await page.locator('#load-fen').click();
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.fen)).toBe(new Chess(fen).fen());
}

async function downloadText(page, selector) {
  const event = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await event;
  return { name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
}

test('real pretrained model plays locally, exports legal PGN, flips, and undoes', async ({ page, context }) => {
  await openLab(page);
  await expect(page.locator('#board [data-square]')).toHaveCount(64);
  await expect(page.locator('#board .chess-piece')).toHaveCount(32);
  const metadata = await page.evaluate(() => window.__INTUITION__.model);
  expect(metadata.parameters).toBe(116266);
  expect(metadata.weightsSHA256).toBe('5b584935b8a23a662096d2ecc34f2af8c580058252ef0567194b080187945468');
  await page.screenshot({ path: 'test-results/desktop-lab.png', fullPage: true });
  await page.locator('#mode').selectOption('direct');
  // All weights are loaded already: the reply must work without a remote inference call.
  await context.setOffline(true);
  await page.locator('#board [data-square="e2"]').click();
  await expect(page.locator('#board [data-square="e4"]')).toHaveClass(/legal-target/);
  await page.locator('#board [data-square="e4"]').click();
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.latestDecision?.mode)).toBe('direct');
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.busy)).toBe(false);
  expect(await page.evaluate(() => window.__INTUITION__.latestDecision.nodes)).toBe(0);
  await expect(page.locator('#move-list')).toContainText('e4');
  const exported = await downloadText(page, '#export-pgn');
  expect(exported.name).toBe('intuition-game.pgn');
  const replay = new Chess(); replay.loadPgn(exported.text);
  expect(replay.history()).toHaveLength(2);
  expect(replay.fen()).toBe(await page.evaluate(() => window.__INTUITION__.fen));
  await page.locator('#flip').click();
  await expect(page.locator('#board')).toHaveAttribute('aria-label', /Black at the bottom/);
  await page.locator('#undo').click();
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.fen)).toBe(new Chess().fen());
  await context.setOffline(false);
});

test('FEN errors preserve the board; all three modes compare and export the same position', async ({ page }) => {
  await openLab(page);
  await page.locator('#budget').selectOption('100');
  await page.locator('#node-limit').selectOption('32');
  await tab(page, 'position');
  const original = await page.evaluate(() => window.__INTUITION__.fen);
  await page.locator('#fen-input').fill('not a FEN');
  await page.locator('#load-fen').click();
  await expect(page.locator('#toast')).toHaveAttribute('data-error', 'true');
  expect(await page.evaluate(() => window.__INTUITION__.fen)).toBe(original);
  const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
  await loadFEN(page, fen);
  await page.locator('#compare-modes').click();
  await expect(page.locator('#comparison-results tbody tr')).toHaveCount(3);
  const report = await page.evaluate(() => window.__INTUITION__.latestReport);
  expect(report.kind).toBe('comparison');
  expect(report.position.fen).toBe(new Chess(fen).fen());
  expect(new Set(report.rows.map((row) => row.mode))).toEqual(new Set(['direct', 'search', 'selective']));
  expect(report.rows.find((row) => row.mode === 'direct').nodes).toBe(0);
  for (const row of report.rows) {
    const game = new Chess(fen);
    expect(() => game.move({ from: row.move.slice(0, 2), to: row.move.slice(2, 4), promotion: row.move[4] })).not.toThrow();
    expect(row.elapsedMs).toBeGreaterThanOrEqual(0);
  }
  await tab(page, 'benchmark');
  const json = JSON.parse((await downloadText(page, '#export-json')).text);
  expect(json.rows).toHaveLength(3);
  expect(json.model.weightsSHA256).toBe(report.model.weightsSHA256);
  const csv = await downloadText(page, '#export-csv');
  expect(csv.name).toBe('intuition-results.csv');
  expect(csv.text).toContain('"mode"');
  expect(csv.text).toContain('"direct"');
  expect(csv.text).toContain('"selective"');
});

test('underpromotion is selectable and imported PGN preserves threefold repetition', async ({ page }) => {
  await openLab(page);
  await loadFEN(page, '7k/P7/8/8/8/8/8/7K w - - 0 1');
  await tab(page, 'play');
  await page.locator('#board [data-square="a7"]').click();
  await page.locator('#board [data-square="a8"]').click();
  await expect(page.locator('dialog.promotion-dialog')).toBeVisible();
  await page.locator('dialog.promotion-dialog button[data-piece="n"]').click();
  await expect(page.locator('#game-status')).toContainText('insufficient material');
  expect((await page.evaluate(() => window.__INTUITION__.fen)).split(' ')[0]).toBe('N6k/8/8/8/8/8/8/7K');
  await tab(page, 'position');
  await page.locator('details').filter({ has: page.locator('#pgn-input') }).locator('summary').click();
  await page.locator('#pgn-input').fill('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *');
  await page.locator('#load-pgn').click();
  await tab(page, 'play');
  await expect(page.locator('#game-status')).toContainText('threefold repetition');
});

test('position suite records nine real-model decisions and a running match can be cancelled', async ({ page }) => {
  await openLab(page);
  await page.locator('#budget').selectOption('100');
  await page.locator('#node-limit').selectOption('32');
  await tab(page, 'benchmark');
  await page.locator('#suite-select').selectOption('smoke');
  await page.locator('#run-suite').click();
  await expect(page.locator('#suite-progress')).toContainText('Complete');
  await expect(page.locator('#benchmark-results tbody tr')).toHaveCount(9);
  const result = await page.evaluate(() => window.__INTUITION__.latestReport);
  expect(result.kind).toBe('suite');
  expect(result.summary).toHaveLength(3);
  const terminalRows = result.rows.filter((row) => row.positionId === 'terminal-stalemate');
  expect(terminalRows).toHaveLength(3);
  expect(terminalRows.every((row) => row.move === null && row.expectedMatch)).toBe(true);
  await page.locator('#run-matches').click();
  await expect(page.locator('#cancel-run')).toBeEnabled();
  await page.locator('#cancel-run').click();
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.busy)).toBe(false);
  await expect(page.locator('#toast')).toContainText('cancelled');
  await expect(page.locator('#run-suite')).toBeEnabled();
});

test('controller can be retrained, evaluated on held-out groups, exported, and reset', async ({ page }) => {
  test.setTimeout(120_000);
  await openLab(page);
  await page.locator('#budget').selectOption('250');
  await page.locator('#node-limit').selectOption('32');
  await tab(page, 'controller');
  await expect(page.locator('#controller-results')).toContainText('Trained controller loaded');
  await page.locator('#train-controller').click();
  await expect(page.locator('#controller-progress')).toContainText('Training complete', { timeout: 90_000 });
  const gate = await page.evaluate(() => window.__INTUITION__.latestReport.controller);
  expect(gate.trained).toBe(true);
  expect(gate.metrics.testCount).toBeGreaterThan(0);
  expect(gate.training.testGroups.every((group) => !gate.training.trainGroups.includes(group))).toBe(true);
  await page.locator('#reset-controller').click();
  await expect(page.locator('#toast')).toContainText('Restored');
});

test('mobile layout fits the viewport and the board supports keyboard exploration', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const board = page.locator('#board');
  const bounds = await board.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(390);
  await page.locator('#board [data-square="e2"]').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#board [data-square="e3"]')).toBeFocused();
  for (const name of ['position', 'benchmark', 'controller']) {
    await tab(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/mobile-lab.png', fullPage: true });
});
