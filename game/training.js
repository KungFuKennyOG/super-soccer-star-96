// Training mode: the drills from rules/tutorial.js, with a card at the top of your view saying
// what to do, a progress bar, and how to skip. main.js feeds it each frame's events.
import * as THREE from 'three';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText, textWidth } from './tex.js';
import { STEPS, createTutorial, currentStep, setupDrill, clearDrill, stepTutorial, skipStep } from '../rules/tutorial.js';

const W = 224, H = 50;

export function createTraining(camera) {
  const c = canvasTex(W, H, () => {}), ctx = c.getContext('2d'), tex = pixelTex(c);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.64 * H / W),
    ps1({ map: tex, lit: false, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  card.renderOrder = 25; card.position.set(0, 0.15, -0.72); card.rotation.x = -0.15; card.visible = false;
  camera.add(card);

  let tut = null, shown = '', vr = false;

  function draw() {
    const s = currentStep(tut), done = tut.doneT > 0;
    const key = `${tut.i}|${Math.floor(tut.n)}|${done}|${vr}|${tut.finished}`;
    if (key === shown) return;
    shown = key;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(5,8,40,0.88)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f2c21a'; ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, H - 1, W, 1);
    // title row: drill number and name, skip hint on the right
    ctx.fillStyle = '#c8102e'; ctx.fillRect(0, 1, W, 10);
    drawText(ctx, `${Math.min(tut.i + 1, STEPS.length)}/${STEPS.length}  ${s.title}`, 4, 3, '#ffffff');
    const skip = vr ? 'X: SKIP' : 'N: SKIP';
    drawText(ctx, skip, W - 4 - textWidth(skip), 3, '#f2c21a');
    if (done) {
      const msg = tut.finished || tut.i >= STEPS.length - 1 ? 'TRAINING COMPLETE!' : 'NICE ONE!';
      drawText(ctx, msg, Math.round((W - textWidth(msg, 2)) / 2), 20, '#40ff60', 2, '#000');
    } else {
      (vr ? s.vr : s.pc).forEach((l, i) => drawText(ctx, l, 4, 14 + i * 9, '#ffffff'));
      // progress bar
      const k = tut.n / s.need;
      ctx.fillStyle = '#1a2350'; ctx.fillRect(4, H - 8, W - 60, 4);
      ctx.fillStyle = '#f2c21a'; ctx.fillRect(4, H - 8, Math.round((W - 60) * k), 4);
      const lbl = `${Math.floor(tut.n)}/${s.need}${s.unit ? ' ' + s.unit : ''}`;
      drawText(ctx, lbl, W - 4 - textWidth(lbl), H - 10, '#9aa8e0');
    }
    tex.needsUpdate = true;
  }

  return {
    get active() { return !!tut; },
    get step() { return tut ? currentStep(tut) : null; },
    get progress() { return tut ? tut.n : 0; },
    start(world, isVr) { tut = createTutorial(); vr = isVr; shown = ''; setupDrill(world, currentStep(tut)); card.visible = true; draw(); },
    stop(world) { tut = null; card.visible = false; if (world) clearDrill(world); },
    // the same drill again (Y / R, or after a dead ball)
    reset(world) { if (tut && !tut.finished) setupDrill(world, currentStep(tut)); },
    skip() { if (tut) skipStep(tut); },
    // f: { ev, intent, world, dt, vr, restart }. Returns 'done' | 'next' | 'finished' | null and sets
    // the pitch up for the next drill itself.
    update(f) {
      if (!tut) return null;
      vr = f.vr;
      card.position.y = vr ? 0.15 : 0.27;     // the browser view looks down a little, so sit higher there
      const r = stepTutorial(tut, f);
      if (r === 'next' || r === 'reset') setupDrill(f.world, currentStep(tut));
      draw();
      return r;
    },
  };
}
