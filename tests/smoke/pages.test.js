// Smoke test: open the game in headless Chromium (browser mode, no headset), kick off, play a few
// scripted seconds (dribble, pass, shoot) and fail on any uncaught error.
//   npx playwright install chromium   (once)
//   npm run smoke
// Screenshots land in tests/smoke/out/. three.js comes from the CDN, or node_modules/three when offline.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, access } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.mjs';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.module.js';
const LOCAL_THREE = new URL('../../node_modules/three/build/three.module.js', import.meta.url).pathname;
const OUT = new URL('./out/', import.meta.url);

let server, browser, threeSource = null;

before(async () => {
  await mkdir(OUT, { recursive: true });
  server = await startServer(0);
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext();
  try { if ((await ctx.request.get(THREE_URL, { timeout: 8000 })).ok()) threeSource = 'cdn'; } catch {}
  await ctx.close();
  if (!threeSource) { try { await access(LOCAL_THREE); threeSource = 'local'; } catch {} }
});

after(async () => { await browser?.close(); await server?.close(); });

test('game boots, kicks off and plays without errors', async t => {
  if (!threeSource) { t.skip('three.js unreachable (no CDN and no node_modules/three)'); return; }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(90000);                 // software rendering on a busy machine can be very slow
  if (threeSource === 'local') await page.route(THREE_URL, r => r.fulfill({ path: LOCAL_THREE, contentType: 'text/javascript' }));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => { if (/\.(m?js|html)$/.test(new URL(r.url()).pathname)) errors.push(`failed to load ${r.url()}`); });
  await page.goto(server.url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sssOK === true, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: new URL('title.png', OUT).pathname });

  await page.click('#play');
  await page.waitForTimeout(600);
  await page.screenshot({ path: new URL('menu.png', OUT).pathname });
  await page.keyboard.press('Enter');            // score attack
  await page.waitForTimeout(800);
  await page.screenshot({ path: new URL('team-select.png', OUT).pathname });
  await page.keyboard.press('Enter');            // first team
  await page.waitForFunction(() => window.__sss.game && window.__sss.menus.screen === null, null, { timeout: 40000 }); // building a ground is slow in software rendering
  await page.waitForTimeout(500);
  await page.evaluate(() => { for (const id of ['d1', 'd2', 'd3']) window.__sss.world.byId[id].stun = 999; }); // keep it ours
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  await page.screenshot({ path: new URL('dribble.png', OUT).pathname });
  // shoot with the F key (the left mouse button does the same) — headless runs slowly, so hold a while
  await page.keyboard.down('KeyF'); await page.waitForTimeout(1500); await page.keyboard.up('KeyF');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: new URL('shot.png', OUT).pathname });
  const state = await page.evaluate(() => ({ shots: window.__sss.match.shots, clock: window.__sss.match.clock }));
  await page.close();
  assert.deepEqual(errors, [], 'uncaught errors');
  assert.ok(state.shots >= 1, 'the shot was taken');
  assert.ok(state.clock < 120, 'the clock ran');
});

test('training: picks from the mode menu, runs the first drill, skips, and resets drills', async t => {
  if (!threeSource) { t.skip('three.js unreachable (no CDN and no node_modules/three)'); return; }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(90000);                 // software rendering on a busy machine can be very slow
  if (threeSource === 'local') await page.route(THREE_URL, r => r.fulfill({ path: LOCAL_THREE, contentType: 'text/javascript' }));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sssOK === true, null, { timeout: 15000 });
  await page.click('#play');
  await page.waitForTimeout(500);
  for (let i = 0; i < 8; i++) {
    const sel = await page.evaluate(() => window.__sss.menus.sel);
    if (sel === 5) break;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(b => window.__sss.menus.sel !== b, sel, { timeout: 30000 });
  }
  await page.screenshot({ path: new URL('menu-training.png', OUT).pathname });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sss.training.active && window.__sss.menus.screen === null, null, { timeout: 40000 });
  await page.evaluate(() => { const d = window.__sss.desk; d.yaw = 0; d.pitch = 0; });   // headless mouse noise
  await page.waitForTimeout(500);
  await page.screenshot({ path: new URL('training-1.png', OUT).pathname });
  const startStep = await page.evaluate(() => window.__sss.training.step.id);
  // dribbling counts toward the first drill (headless frames are too slow to finish it)
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__sss.training.progress > 0.5, null, { timeout: 60000 });
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  await page.screenshot({ path: new URL('training-2.png', OUT).pathname });
  // skip ahead to the lob drill: a defender should be standing in the lane
  for (let i = 0; i < 20 && await page.evaluate(() => window.__sss.training.step.id) !== 'lob'; i++) {
    const before = await page.evaluate(() => window.__sss.training.step.id);
    await page.keyboard.press('KeyN');
    await page.waitForFunction(b => window.__sss.training.step.id !== b, before, { timeout: 30000 });
  }
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({ step: window.__sss.training.step.id, frozen: [...window.__sss.world.drill.frozen] }));
  await page.screenshot({ path: new URL('training-skip.png', OUT).pathname });
  await page.close();
  assert.deepEqual(errors, [], 'uncaught errors');
  assert.equal(startStep, 'run');
  assert.equal(state.step, 'lob');
  assert.ok(state.frozen.includes('d1') && state.frozen.includes('d2'), 'defenders parked, one in the lane');
});

// opens the game on the mode menu; returns { page, errors }
async function openMenu() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(90000);
  if (threeSource === 'local') await page.route(THREE_URL, r => r.fulfill({ path: LOCAL_THREE, contentType: 'text/javascript' }));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // the frame loop catches its own errors and logs them: count those too
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(server.url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sssOK === true, null, { timeout: 15000 });
  await page.click('#play');
  await page.waitForTimeout(500);
  return { page, errors };
}
const menuTo = async (page, i) => {
  for (let k = 0; k < 10; k++) {
    const sel = await page.evaluate(() => window.__sss.menus.sel);
    if (sel === i) return;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(b => window.__sss.menus.sel !== b, sel, { timeout: 150000 });
  }
};

test('settings, challenges, a penalty shootout and keeper rush', { timeout: 900000 }, async t => {
  if (!threeSource) { t.skip('three.js unreachable (no CDN and no node_modules/three)'); return; }
  const { page, errors } = await openMenu();
  await page.screenshot({ path: new URL('menu-modes.png', OUT).pathname });
  await menuTo(page, 7); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sss.menus.screen === 'settings');
  await menuTo(page, 6);
  await page.keyboard.press('ArrowRight');                   // weather: CLEAR
  await page.waitForFunction(() => window.__sss.settings.weather === 1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: new URL('settings.png', OUT).pathname });
  const wx = await page.evaluate(() => window.__sss.settings.weather);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__sss.menus.screen === 'mode');
  await menuTo(page, 6); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sss.menus.screen === 'challenges');
  await page.waitForTimeout(400);
  await page.screenshot({ path: new URL('challenges.png', OUT).pathname });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__sss.menus.screen === 'mode');

  // PENALTIES: pick a team, take the first kick looking at the bottom corner
  await menuTo(page, 3); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sss.menus.screen === 'team');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sss.mode === 'keep' && window.__sss.keeping.shootout && window.__sss.keeping.shootout.phase === 'ready', null, { timeout: 150000 });
  await page.evaluate(() => { const d = window.__sss.desk; d.yaw = -0.12; d.pitch = 0.1; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: new URL('pens-kick.png', OUT).pathname });
  // hold until the charge has started (frames are slow in software rendering), then let go
  await page.keyboard.down('KeyF');
  await page.waitForFunction(() => window.__sss.intents.shotHold && window.__sss.intents.shotHold.t > 0.3, null, { timeout: 150000 });
  await page.keyboard.up('KeyF');
  await page.waitForFunction(() => window.__sss.keeping.shootout.kicks.you.length === 1, null, { timeout: 150000 });
  await page.waitForFunction(() => window.__sss.keeping.shootout.turn === 'them' && window.__sss.keeping.shootout.phase === 'ready', null, { timeout: 150000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: new URL('pens-keep.png', OUT).pathname });
  await page.waitForFunction(() => window.__sss.keeping.shootout.kicks.them.length === 1, null, { timeout: 150000 });

  // KEEPER RUSH in the snow
  await page.evaluate(() => { const s = window.__sss; s.settings.weather = 3; s.game.kind = 'keeper'; s.startKeeping('rush'); });
  await page.waitForFunction(() => window.__sss.keeping.rush && window.__sss.keeping.rush.phase === 'runup', null, { timeout: 150000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: new URL('rush-snow.png', OUT).pathname });
  await page.waitForFunction(() => window.__sss.keeping.rush.saves + window.__sss.keeping.rush.conceded >= 1 || window.__sss.keeping.rush.phase === 'after', null, { timeout: 150000 });

  // a match in the rain
  await page.evaluate(() => { const s = window.__sss; s.settings.weather = 2; s.game.kind = 'attack'; s.game.cup = null; s.game.scenario = null; s.startMatch(); });
  await page.waitForFunction(() => window.__sss.mode === 'play' && window.__sss.world.weather === 'rain', null, { timeout: 150000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: new URL('rain.png', OUT).pathname });
  await page.close();
  assert.equal(wx, 1, 'weather setting changed');
  assert.deepEqual(errors, [], 'uncaught errors');
});
