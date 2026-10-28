// Settings (saved in localStorage) and the display side of them: the low browser resolution and the
// PS1 vertex wobble, which depends on whether you're in the headset.
import { PS1 } from './ps1.js';

export const LINES = 480;          // browser render height: a little chunky, clearly readable
const SETTINGS_KEY = 'sss96.settings';

// match length (index into LENGTHS), PS1 wobble (0 off, 1 low, 2 full), commentary (0 off, 1 text,
// 2 voice), goal replays and hit effects (0 off, 1 on)
const DEFAULTS = { length: 1, wobble: 1, commentary: 2, replays: 1, juice: 1 };
export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; }
}
export function saveSettings(settings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

// Vertex wobble: the snap grid in screen lines (smaller = wobblier). In the headset the texture warp
// stays off except at FULL, since it swims as your head moves.
export function applyWobble(renderer, settings) {
  const vr = renderer.xr.isPresenting, w = settings.wobble;
  const lines = vr ? [8192, 1500, 900][w] : [8192, LINES * 2.5, LINES * 1.5][w];
  const aspect = vr ? 1 : innerWidth / innerHeight;
  PS1.snap.value.set(Math.round(lines * aspect), lines);
  PS1.affine.value = w === 0 || (vr && w < 2) ? 0 : 1;
}

// The browser renders at LINES lines, scaled up with hard pixels.
export function lowRes(renderer, settings) {
  if (renderer.xr.isPresenting) return;
  renderer.setPixelRatio(LINES / innerHeight);
  renderer.setSize(innerWidth, innerHeight, false);
  applyWobble(renderer, settings);
}
