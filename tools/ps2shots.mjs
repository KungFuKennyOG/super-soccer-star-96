// Renders the PS2 look test (tools/ps2look.html) to files with headless Chrome (software GL).
//   node tools/ps2shots.mjs out/dir [shot ...]      stills as PNG; "clip" writes numbered frames to out/dir/clip
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.module.js';
const LOCAL_THREE = fileURLToPath(new URL('../node_modules/three/build/three.module.js', import.meta.url));
const [out = 'out', ...want] = process.argv.slice(2);
const SIZES = { vr: [1024, 1024], wide: [1280, 960], face: [1280, 720], face2: [1280, 720] };
const shots = want.length ? want : ['duel', 'lineup', 'wide', 'vr', 'face', 'face2', 'kit', 'back'];
await mkdir(out, { recursive: true });
const server = await startServer(8123);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const shot of shots) {
    const [w, h] = SIZES[shot] || [1280, 960];
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
    page.on('pageerror', e => console.log('[page error]', e.message));
    await page.route(THREE_URL, r => r.fulfill({ path: LOCAL_THREE, contentType: 'text/javascript' }));
    const name = shot.split('@')[0], t = shot.split('@')[1] || 0;
    await page.goto(`${server.url}/tools/ps2look.html?shot=${name}&still=1&w=${w}&h=${h}&t=${t}`);
    await page.waitForFunction(() => window.__look && window.__look.ready, null, { timeout: 120000 });
    if (name === 'clip') {
      await mkdir(`${out}/clip`, { recursive: true });
      for (let f = 0; f < 120; f++) { await page.evaluate(() => window.__look.step(1 / 30)); await page.screenshot({ path: `${out}/clip/${String(f).padStart(3, '0')}.png` }); }
    } else {
      await page.screenshot({ path: `${out}/${shot}.png` });
      if (process.env.SHEETS) for (const i of [0, 1]) await writeFile(`${out}/sheet${i}.png`, Buffer.from((await page.evaluate(k => window.__look.sheet(k), i)).split(',')[1], 'base64'));
    }
    console.log(shot, JSON.stringify(await page.evaluate(() => window.__look.info())));
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
