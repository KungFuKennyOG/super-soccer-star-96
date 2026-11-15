// The boot meets the ball: the real sim drives the real poses (game/actors.js, game/strike.js) on a bare
// skeleton, and the gap between the right boot and the ball is measured on the frames that matter.
// (No mesh, no textures: this runs in Node with the three.js dev dependency.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSkeleton } from '../../game/body.js';
import { animate, placeModel } from '../../game/actors.js';
import { startStrike, struck } from '../../game/strike.js';
import { createWorld, stepSim } from '../../rules/sim.js';
import { perfectTime } from '../../rules/pass.js';
import { BALL, GOAL } from '../../rules/tuning.js';

const fixed = () => 0.5, DT = 1 / 72;

// the boot's surface (the box in game/body.js boot(), lower and narrower toward the toe), in the foot bone's space
const BOOT = [];
for (let i = 0; i <= 12; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 4; k++) {
  if (i % 12 && j % 4 && k % 4) continue;
  const f = i / 12, bx = (j / 4 - 0.5) * 0.104, by = (k / 4 - 0.5) * 0.1;
  BOOT.push([f > 0.6 ? bx * (1 - 0.35 * (f - 0.6) / 0.4) : bx, 0.05 - 0.085 + (f > 0.6 && by > 0 ? by - 0.045 * (f - 0.6) / 0.4 : by), 0.05 + (f - 0.5) * 0.3]);
}
const tmp = new THREE.Vector3();
// metres between a boot and the ball's surface (negative: the boot is inside the ball)
function gap(m, n, ball) {
  m.root.updateMatrixWorld(true);
  const p = m.bone['foot' + n].worldToLocal(tmp.set(ball.x, ball.y, ball.z));
  return Math.min(...BOOT.map(q => Math.hypot(q[0] - p.x, q[1] - p.y, q[2] - p.z))) - BALL.r;
}

// You run with the ball (drawn as your own first-person legs, or as a whole body), optionally letting go
// of a shot or pass at 1.2 s. Returns one row per frame.
function play({ firstPerson, sprint = true, shot = null, pass = null, secs = 2.4 }) {
  const w = createWorld(fixed);
  for (const id of ['d1', 'd2', 'd3']) { w.byId[id].x = 20; w.byId[id].z = -1; w.byId[id].stun = 99; }
  const { bones, by } = buildSkeleton(), root = new THREE.Group();
  root.add(bones[0]);
  const m = { root, bone: by, shadow: new THREE.Object3D(), phase: 0, strike: null, firstPerson }, rows = [];
  for (let t = 0; t < secs; t += DT) {
    const it = { move: { x: 0, z: -1 }, facing: { x: 0, z: -1 }, sprint };
    if (Math.abs(t - 1.2) < DT / 2) {
      const eye = { x: w.you.x, y: 1.7, z: w.you.z };
      if (shot) { const d = new THREE.Vector3(shot.x - eye.x, shot.y - eye.y, GOAL.z - eye.z).normalize(); it.shot = { eye, dir: { x: d.x, y: d.y, z: d.z }, holdT: shot.hold }; }
      if (pass) it.pass = { holdT: perfectTime(), targetId: pass };
    }
    const ev = stepSim(w, it, DT, fixed), you = w.you, b = w.ball;
    const hit = ev.some(e => (e.type === 'kick' || e.type === 'pass') && e.by === 'you');
    for (const e of ev) if (e.type === 'windup') startStrike(m, { kind: e.kind, wind: e.t, dir: e.dir, power: e.power });
    if (hit) { const l = Math.hypot(b.vx, b.vz); struck(m, ev.some(e => e.type === 'pass') ? 'pass' : 'shot', { x: b.vx / l, z: b.vz / l }, 0.8); }
    placeModel(m, you);
    m.root.rotation.y = Math.atan2(you.vx, you.vz);
    animate(m, you, DT, t, false, null, b, w.owner === 'you' && !w.dead);
    for (const bone of Object.values(by)) assert.ok(Number.isFinite(bone.quaternion.x + bone.quaternion.w + bone.position.y), `${bone.name} is finite`);
    rows.push({ t, hit, touch: ev.some(e => e.type === 'dribble'), wind: ev.some(e => e.type === 'windup'), right: gap(m, 'R', b), left: gap(m, 'L', b) });
  }
  return rows;
}

for (const firstPerson of [true, false]) {
  const who = firstPerson ? 'your own boots' : 'a whole body';

  test(`${who}: on the frame a shot or pass is struck, the boot is on the ball`, () => {
    for (const [name, o] of [['a low shot', { shot: { x: 3, y: 0.5, hold: 0.8 } }], ['a shot across goal', { shot: { x: -3.2, y: 2, hold: 0.9 } }], ['a chip', { shot: { x: 0, y: 1.5, hold: 0.1 } }], ['a pass left', { pass: 'm1' }], ['a pass right', { pass: 'm2' }]]) {
      const rows = play({ firstPerson, ...o }), k = rows.findIndex(r => r.hit), w0 = rows.findIndex(r => r.wind);
      assert.ok(w0 > 0 && k > w0, `${name}: wound up, then struck`);
      assert.ok(Math.abs(rows[k].right) < 0.02, `${name}: boot ${(rows[k].right * 100).toFixed(1)} cm from the ball when it's struck`);
      assert.ok(rows[k - 2].right > 0.05, `${name}: the boot was on its way (${(rows[k - 2].right * 100).toFixed(0)} cm two frames before)`);
      assert.ok(rows[k + 3].right > 0.15, `${name}: and the ball has left it three frames later`);
    }
  });

  test(`${who}: every dribbling touch is the right boot on the ball, and the boots miss it in between`, () => {
    for (const sprint of [true, false]) {
      const rows = play({ firstPerson, sprint, secs: 3 }).filter(r => r.t > 0.7), touches = rows.filter(r => r.touch);
      assert.ok(touches.length >= 3, `${touches.length} touches`);
      for (const r of touches) assert.ok(Math.abs(r.right) < 0.03, `boot ${(r.right * 100).toFixed(1)} cm from the ball on a touch`);
      assert.ok(Math.min(...rows.map(r => r.right)) > -0.04, `right boot never deep in the ball (${(Math.min(...rows.map(r => r.right)) * 100).toFixed(1)} cm)`);
      assert.ok(Math.min(...rows.map(r => r.left)) > 0.02, `left boot runs clear of it (${(Math.min(...rows.map(r => r.left)) * 100).toFixed(1)} cm)`);
    }
  });
}
