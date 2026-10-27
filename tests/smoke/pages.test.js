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
