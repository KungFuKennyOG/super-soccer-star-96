// Local static server for testing: no caching, so every reload on the Quest gets your latest files.
//   npm run serve            -> http://localhost:8000
//   npm run serve -- 9000    -> another port
// Quest over USB:  adb reverse tcp:8000 tcp:8000, then open http://localhost:8000 in the Quest browser.
// Quest over Wi-Fi: open the LAN address printed below (WebXR needs https or localhost, so USB is the reliable route).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json',
};

/** Starts the server. Resolves with { url, close } once it is listening. */
export function startServer(port = 8000) {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, () => ok({ url: `http://localhost:${server.address().port}`, close: () => new Promise(r => server.close(r)) }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8000;
  const { url } = await startServer(port);
  console.log(`Serving ${ROOT}\n  ${url}`);
  for (const nets of Object.values(networkInterfaces())) {
    for (const n of nets || []) if (n.family === 'IPv4' && !n.internal) console.log(`  http://${n.address}:${port}  (LAN)`);
  }
  console.log(`Quest over USB: adb reverse tcp:${port} tcp:${port}`);
}
