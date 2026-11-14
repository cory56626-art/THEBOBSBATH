import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Chess } from 'chess.js';

test('older Gatos stay playable with their own measured profile and engine', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.__INTUITION__?.ready);
  await expect(page.locator('#opponent option')).toHaveCount(2);
  await expect(page.locator('#opponent')).toHaveValue('gato-2');
  await page.locator('#opponent').selectOption('gato-1');
  await expect(page.locator('#bot-name')).toHaveText('Gato 1');
  await expect(page.locator('#play-heading')).toHaveText('Play Gato 1.');
  await expect(page.locator('#bot-generation')).toHaveText('OUR FIRST BOT');
  await expect(page.locator('#bot-rating')).toHaveText('≈1650');
  await expect(page.locator('#bot-rating-interval')).toHaveText('1289–2047');
  await expect(page.locator('#node-limit')).toHaveValue('32768');
  await expect(page.locator('#bot-rating-context')).toContainText('Current settings match the measured test: Search · 150 ms · 32,768 positions.');
  await expect(page.locator('#bot-report-link')).toHaveAttribute('href', /AI-STRENGTH-V4\.md$/);
  await page.locator('#side').selectOption('b');
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.latestDecision?.engineVersion), { timeout: 20_000 }).toBe('intuition-hybrid-3');
  const decision = await page.evaluate(() => window.__INTUITION__.latestDecision);
  expect(decision.botId).toBe('gato-1');
  await expect(page.locator('#top-player-detail')).toContainText('GATO 1');
  await page.locator('#opponent').selectOption('gato-2');
  await expect(page.locator('#bot-rating')).toHaveText('≈2278');
  await expect(page.locator('#node-limit')).toHaveValue('1000000');
});

test('a bot battle plays a complete color-swapped series on the board and exports its PGN', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.waitForFunction(() => window.__INTUITION__?.ready);
  await page.locator('[data-tab="battle"]').click();
  await page.locator('#battle-white').selectOption('gato-2');
  await page.locator('#battle-black').selectOption('gato-1');
  await page.locator('#battle-games').selectOption('2');
  await page.locator('#battle-budget').selectOption('100');
  await page.locator('#start-battle').click();
  await expect(page.locator('#stop-battle')).toBeEnabled();
  await expect(page.locator('#top-player-detail')).toContainText('GATO 1 · BATTLE');
  await expect(page.locator('#board button:not([disabled])')).toHaveCount(0);

  // Both engines take turns: each decision reports the bot that made it.
  const seen = new Set();
  await expect.poll(async () => {
    const decision = await page.evaluate(() => window.__INTUITION__.latestDecision);
    if (decision?.botId) seen.add(`${decision.botId}:${decision.engineVersion}`);
    return seen.size;
  }, { timeout: 30_000 }).toBe(2);
  expect([...seen].sort()).toEqual(['gato-1:intuition-hybrid-3', 'gato-2:intuition-hybrid-5']);

  await expect.poll(() => page.evaluate(() => window.__INTUITION__.battle?.running), { timeout: 200_000, intervals: [1000] }).toBe(false);
  const battle = await page.evaluate(() => window.__INTUITION__.battle);
  expect(battle.games).toHaveLength(2);
  expect(battle.games.map(row => [row.white, row.black])).toEqual([['gato-2', 'gato-1'], ['gato-1', 'gato-2']]);
  await expect(page.locator('#battle-results tbody tr')).toHaveCount(2);
  await expect(page.locator('#battle-score')).toBeVisible();
  await expect(page.locator('#battle-status')).toContainText('Battle complete · 2 games');

  const downloaded = page.waitForEvent('download');
  await page.locator('#export-battle').click();
  const pgn = await readFile(await (await downloaded).path(), 'utf8');
  const games = pgn.trim().split(/\n\n(?=\[Event)/);
  expect(games).toHaveLength(2);
  games.forEach((text, index) => {
    const replay = new Chess(); replay.loadPgn(text);
    expect(replay.getHeaders().White).toBe(index ? 'Gato 1' : 'Gato 2');
    expect(replay.getHeaders().Result).toBe(battle.games[index].result);
  });
  expect(errors).toEqual([]);
});

test('stopping a battle cancels the in-flight move and hands the board back', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.__INTUITION__?.ready);
  await page.locator('[data-tab="battle"]').click();
  await page.locator('#battle-white').selectOption('gato-1');
  await page.locator('#battle-black').selectOption('gato-1');
  await page.locator('#battle-budget').selectOption('500');
  await page.locator('#start-battle').click();
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.fen.split(' ')[5]), { timeout: 20_000 }).not.toBe('1');
  await page.locator('#stop-battle').click();
  await expect.poll(() => page.evaluate(() => window.__INTUITION__.battle.running)).toBe(false);
  await expect(page.locator('#battle-status')).toContainText('Stopped after 0 complete games');
  await expect(page.locator('#battle-score')).toContainText('Gato 1 A');
  await expect(page.locator('#start-battle')).toBeEnabled();
  await page.locator('[data-tab="play"]').click();
  await page.locator('#new-game').click();
  await expect(page.locator('#game-status')).toContainText('New game started');
  await expect(page.locator('#board [data-square="e2"]')).toBeEnabled();
});
