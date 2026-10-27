// The frame loop: one call per displayed frame, in the headset or in the browser.
import * as THREE from 'three';

// frame(realDt, time) runs every frame. realDt is wall-clock seconds since the last frame, capped at maxDt
// so a hitch never becomes one giant step; time is the running total of realDt.
// An error in one frame is logged (the first few) and the next frame runs anyway.
// onFps(fps) fires once a second with the average frame rate.
// Returns { time, fps } kept up to date.
/**
 * @param {any} renderer
 * @param {(realDt: number, time: number) => void} frame
 * @param {{ maxDt?: number, onFps?: (fps: number) => void }} [opts]
 */
export function startLoop(renderer, frame, { maxDt = .05, onFps } = {}) {
  const clock = new THREE.Clock();
  const loop = { time: 0, fps: 0 };
  let n = 0, t0 = performance.now(), errs = 0;
  renderer.setAnimationLoop(() => {
    try {
      const realDt = Math.min(clock.getDelta(), maxDt);
      loop.time += realDt;
      n++;
      const t = performance.now();
      if (t - t0 >= 1000) { loop.fps = Math.round(n * 1000 / (t - t0)); n = 0; t0 = t; if (onFps) onFps(loop.fps); }
      frame(realDt, loop.time);
    } catch (err) {
      if (errs++ < 5) console.error(err);
    }
  });
  return loop;
}
