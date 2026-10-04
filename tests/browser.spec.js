import { test, expect } from '@playwright/test';

const errors = new WeakMap();
const state = page => page.evaluate(() => window.__MERIDIAN__.snapshot());
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function boot(page) {
  // Browser software rendering is deliberately tested at the game's supported
  // performance setting; root's visual review covers the high graphics setting.
  await page.addInitScript(() => localStorage.setItem('meridian-settings', JSON.stringify({ quality: 'low', sound: false })));
  await page.goto('./?debug=1');
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#boot-error')).toBeHidden();
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await page.waitForFunction(() => window.__MERIDIAN__?.snapshot().render.triangles > 0);
}

async function begin(page) {
  await boot(page);
  await page.locator('#start-button').click();
  await expect(page.locator('#intro')).toBeHidden();
  await expect(page.locator('#objective-title')).toBeVisible();
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().active);
}

async function waitForMovement(page, original, minimum = 1, who = 'player') {
  await page.waitForFunction(({ original, minimum, who }) => {
    const now = window.__MERIDIAN__.snapshot()[who];
    return Math.hypot(now.x - original.x, now.z - original.z) > minimum;
  }, { original, minimum, who }, { timeout: 30_000 });
}

async function restart(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#reset-button').click();
  await expect(page.locator('#menu')).toBeHidden();
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().inCar);
}

test.beforeEach(async ({ page }) => {
  const collected = [];
  errors.set(page, collected);
  page.on('pageerror', error => collected.push(error.message));
  page.on('console', message => { if (message.type() === 'error') collected.push(message.text()); });
  page.on('requestfailed', request => collected.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'browser errors / failed asset requests').toEqual([]);
});

test('desktop: drive, brake, walk, camera, ammunition, pause, and restart', async ({ page }) => {
  await begin(page);
  const initial = await state(page);
  expect(initial.inCar).toBe(true);
  expect(initial.player.health).toBe(100);
  expect(initial.people.filter(actor => actor.kind === 'civilian')).toHaveLength(45);
  expect(initial.people.filter(actor => actor.kind === 'police')).toHaveLength(6);
  expect(initial.people.filter(actor => actor.kind === 'hostile')).toHaveLength(4);
  expect(initial.traffic).toHaveLength(16);

  await page.keyboard.down('w');
  await waitForMovement(page, initial.car, 5, 'car');
  await page.keyboard.up('w');
  expect((await state(page)).car.speed).toBeGreaterThan(1);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => Math.abs(window.__MERIDIAN__.snapshot().car.speed) < .2);
  await page.keyboard.up('Space');
  await page.keyboard.press('e');
  await page.waitForFunction(() => !window.__MERIDIAN__.snapshot().inCar);
  await expect(page.locator('#ammo-readout')).toBeVisible();
  const onFoot = await state(page);
  await page.keyboard.down('w');
  await waitForMovement(page, onFoot.player, 1);
  await page.keyboard.up('w');
  expect(distance((await state(page)).player, onFoot.player)).toBeGreaterThan(1);

  await page.keyboard.press('c');
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().firstPerson === true);
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().firstPerson === false);

  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().ammo === 29);
  await page.keyboard.press('r');
  await expect(page.locator('#ammo-value')).toHaveText('RELOADING');
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().ammo === 30);
  expect((await state(page)).reserve).toBe(89);
  await expect(page.locator('#ammo-value')).toHaveText('30 / 89');

  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().inCar);
  await page.keyboard.down('w');
  const moving = (await state(page)).car;
  await waitForMovement(page, moving, .5, 'car');
  await page.keyboard.press('Escape');
  await page.keyboard.up('w');
  await expect(page.locator('#menu')).toBeVisible();
  const frozen = await state(page);
  expect(frozen.paused).toBe(true);
  await page.waitForTimeout(800);
  const stillFrozen = await state(page);
  expect(stillFrozen.time).toBe(frozen.time);
  expect(stillFrozen.player).toEqual(frozen.player);
  expect(stillFrozen.people).toEqual(frozen.people);
  expect(stillFrozen.traffic).toEqual(frozen.traffic);
  await page.locator('#resume-button').click();
  await page.waitForFunction(() => !window.__MERIDIAN__.snapshot().paused);
  const resumed = (await state(page)).car;
  await page.keyboard.down('w');
  await waitForMovement(page, resumed, .5, 'car');
  await page.keyboard.up('w');

  await page.evaluate(() => { window.__MERIDIAN__.setHealth(23); window.__MERIDIAN__.crime(9); });
  await restart(page);
  const reset = await state(page);
  expect(reset.player.health).toBe(100);
  expect(reset.car.health).toBe(100);
  expect(reset.ammo).toBe(30);
  expect(reset.reserve).toBe(90);
  expect(reset.mission).toBe(0);
  expect(reset.wanted).toBe(0);
  expect(reset.firstPerson).toBe(false);
  await page.keyboard.down('w');
  await waitForMovement(page, reset.car, 1, 'car');
  await page.keyboard.up('w');
});

test('city scenarios: collision line of sight, civilian panic, police response, mission, and respawn', async ({ page }) => {
  await begin(page);
  // Find a real building between an existing actor and a free ground position.
  const blockedShot = await page.evaluate(() => {
    const api = window.__MERIDIAN__, actors = api.snapshot().people;
    const boxes = api.colliders;
    const inside = (p, b) => Math.abs(p.x - b.x) < b.hx + .5 && Math.abs(p.z - b.z) < b.hz + .5;
    for (const actor of actors.filter(a => a.hp > 0)) for (const box of boxes) {
      const source = { x: box.x * 2 - actor.x, z: box.z * 2 - actor.z };
      const length = Math.hypot(actor.x - source.x, actor.z - source.z);
      if (Math.abs(source.x) > 205 || Math.abs(source.z) > 205 || length < 2 || length > 145 || boxes.some(b => inside(source, b))) continue;
      const hit = api.shoot({ ...source, dx: actor.x - source.x, dz: actor.z - source.z, range: length + 1 });
      const after = api.snapshot().people.find(a => a.id === actor.id);
      return { actor: actor.id, hpBefore: actor.hp, hpAfter: after.hp, hit: hit?.id ?? null };
    }
    return null;
  });
  expect(blockedShot).not.toBeNull();
  expect(blockedShot.hpAfter).toBe(blockedShot.hpBefore);
  expect(blockedShot.hit).not.toBe(blockedShot.actor);

  await restart(page);
  const panicId = await page.evaluate(() => {
    const api = window.__MERIDIAN__;
    const civilian = api.snapshot().people.find(a => a.kind === 'civilian');
    api.shoot({ x: civilian.x + 2, z: civilian.z, dx: 1, dz: 0, range: 1 });
    return civilian.id;
  });
  await page.waitForFunction(id => window.__MERIDIAN__.snapshot().people.find(a => a.id === id).state === 'flee', panicId);

  await restart(page);
  await page.evaluate(() => {
    const api = window.__MERIDIAN__, cop = api.snapshot().people.find(a => a.kind === 'police');
    api.teleport(cop.x, cop.z, false);
    api.crime(7);
  });
  await page.waitForFunction(() => {
    const s = window.__MERIDIAN__.snapshot();
    return s.wanted === 3 && s.people.some(a => a.kind === 'police' && a.state === 'pursue');
  });
  await expect(page.locator('#wanted-stars')).toHaveText('★★★☆☆');
  await page.evaluate(() => window.__MERIDIAN__.crime(8));
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().wanted === 5);
  await expect(page.locator('#wanted-stars')).toHaveText('★★★★★');

  await restart(page);
  await page.evaluate(() => window.__MERIDIAN__.teleport(36, 36, false));
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().mission === 1);
  await expect(page.locator('#objective-title')).toHaveText('Secure the square');
  await page.evaluate(() => {
    const api = window.__MERIDIAN__;
    for (const actor of api.snapshot().people.filter(a => a.kind === 'hostile' && a.hp > 0)) {
      api.shoot({ x: actor.x, z: actor.z, dx: 1, dz: 0, range: .1 });
      api.shoot({ x: actor.x, z: actor.z, dx: 1, dz: 0, range: .1 });
    }
  });
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().hostilesRemaining === 0 && window.__MERIDIAN__.snapshot().mission === 2);
  await page.evaluate(() => window.__MERIDIAN__.teleport(0, 112, true));
  await page.waitForFunction(() => window.__MERIDIAN__.snapshot().mission === 3);
  await expect(page.locator('#objective-title')).toHaveText('Explore Meridian');

  await page.evaluate(() => window.__MERIDIAN__.setHealth(0));
  await expect(page.locator('#game-over')).toBeVisible();
  expect((await state(page)).paused).toBe(true);
  await page.locator('#respawn-button').click();
  await expect(page.locator('#game-over')).toBeHidden();
  const respawned = await state(page);
  expect(respawned.player.health).toBe(100);
  expect(respawned.inCar).toBe(true);
  expect(respawned.mission).toBe(0);
  expect(respawned.hostilesRemaining).toBe(4);
  expect(respawned.wanted).toBe(0);
  await page.keyboard.down('w');
  await waitForMovement(page, respawned.car, 1, 'car');
  await page.keyboard.up('w');
});

test.describe('touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  test('portrait and landscape fit; touch driving, brake, exit, camera, and shooting work', async ({ page }) => {
    await boot(page);
    const startBox = await page.locator('#start-button').boundingBox();
    expect(startBox.y).toBeGreaterThanOrEqual(0);
    expect(startBox.y + startBox.height).toBeLessThanOrEqual(844);
    await page.locator('#start-button').tap();
    await expect(page.locator('#touch-controls')).toBeVisible();
    expect((await state(page)).quality).toBe('low');
    const cdp = await page.context().newCDPSession(page);
    async function hold(selector, until) {
      const box = await page.locator(selector).boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      try { await until(); } finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    }
    const original = (await state(page)).car;
    await hold('[data-key="KeyW"]', () => waitForMovement(page, original, 3, 'car'));
    await hold('[data-key="Space"]', () => page.waitForFunction(() => Math.abs(window.__MERIDIAN__.snapshot().car.speed) < .2));
    await page.locator('#touch-interact').tap();
    await page.waitForFunction(() => !window.__MERIDIAN__.snapshot().inCar);
    await expect(page.locator('#touch-fire')).toBeVisible();
    await page.locator('#touch-camera').tap();
    await page.waitForFunction(() => window.__MERIDIAN__.snapshot().firstPerson === true);
    await hold('#touch-fire', () => page.waitForFunction(() => window.__MERIDIAN__.snapshot().ammo < 30));
    expect((await state(page)).ammo).toBeLessThan(30);

    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('#touch-controls button')].filter(b => !b.hidden);
        return { width: document.documentElement.scrollWidth, viewport: innerWidth, buttons: buttons.map(b => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }) };
      });
      expect(layout.width).toBeLessThanOrEqual(layout.viewport);
      for (const b of layout.buttons) {
        expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(viewport.width); expect(b.bottom).toBeLessThanOrEqual(viewport.height);
      }
    }
    await page.locator('#menu-button').tap();
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#resume-button').tap();
    await page.waitForFunction(() => !window.__MERIDIAN__.snapshot().paused);
  });
});
