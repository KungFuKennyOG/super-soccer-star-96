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
import { BALL, GOAL, HOLD } from '../../rules/tuning.js';

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

/* ---------- tricks: knock-on, flick-up, drag-back, skill moves ---------- */

// You run (or stand) with the ball and do one thing at 1.2 s; the page's part of it (game/main.js feedback)
// is played here. Returns one row per frame with the events and the right boot's gap to the ball.
function trick({ firstPerson, moving = true, act }) {
  const w = createWorld(fixed);
  for (const id of ['d1', 'd2', 'd3']) { w.byId[id].x = 20; w.byId[id].z = -1; w.byId[id].stun = 99; }
  const { bones, by } = buildSkeleton(), root = new THREE.Group();
  root.add(bones[0]);
  const m = { root, bone: by, shadow: new THREE.Object3D(), phase: 0, strike: null, firstPerson }, rows = [];
  const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
  for (let t = 0; t < 2.2; t += DT) {
    const it = { move: { x: 0, z: moving ? -1 : 0 }, facing: { x: 0, z: -1 }, sprint: false, ...(Math.abs(t - 1.2) < DT / 2 ? act : {}) };
    const ev = stepSim(w, it, DT, fixed), you = w.you, b = w.ball;
    for (const e of ev) {
      if (e.type === 'windup') startStrike(m, { kind: e.kind, wind: e.t, dir: e.dir, power: e.power });
      if (e.type === 'launched') struck(m, e.kind, unit(you.fx, you.fz), 0.5);
      if (e.type === 'knock' || e.type === 'flick' || (e.type === 'skill' && e.move === 'nutmeg')) struck(m, e.type === 'flick' ? 'scoop' : 'poke', Math.hypot(b.vx, b.vz) > 0.5 ? unit(b.vx, b.vz) : unit(you.fx, you.fz), 0.4);
      if (e.type === 'drag') m.special = { kind: 'drag', t: 0 };
      if (e.type === 'skill') m.special = { kind: e.move, t: 0, side: 1 };
    }
    placeModel(m, you);
    if (Math.hypot(you.vx, you.vz) > 0.5) m.root.rotation.y = Math.atan2(you.vx, you.vz);
    animate(m, you, DT, t, false, null, b, w.owner === 'you' && !w.dead);
    for (const bone of Object.values(by)) assert.ok(Number.isFinite(bone.quaternion.x + bone.quaternion.w + bone.position.y), `${bone.name} is finite`);
    rows.push({ t, types: ev.map(e => e.type), right: gap(m, 'R', b), left: gap(m, 'L', b), far: Math.hypot(b.x - you.x, b.z - you.z), ahead: Math.hypot(b.x - you.x, b.z - you.z) * Math.sign((you.z - b.z) || 1), y: b.y, owner: w.owner });
  }
  return rows;
}
const cm = x => (x * 100).toFixed(1);

for (const firstPerson of [true, false]) {
  const who = firstPerson ? 'your own boots' : 'a whole body';

  test(`${who}: a knock-on, a nutmeg's poke and the flick-up leave from the toe`, () => {
    for (const [name, type, o] of [['knock-on', 'knock', { act: { knock: true } }], ['nutmeg', 'skill', { act: { skill: { move: 'nutmeg', side: 1 } } }], ['flick-up', 'flick', { moving: false, act: { knock: true } }]]) {
      const rows = trick({ firstPerson, ...o }), k = rows.findIndex(r => r.types.includes(type));
      assert.ok(k > 0, `${name} happened`);
      assert.ok(Math.abs(rows[k].right) < 0.03, `${name}: boot ${cm(rows[k].right)} cm from the ball as it goes`);
      if (name !== "nutmeg") assert.ok(rows[k + 8].right > 0.1, `${name}: then the ball is away`);   // (a poke at nobody barely outruns you)
    }
  });

  test(`${who}: a drag-back and a roulette pull the ball in under the sole`, () => {
    for (const [name, o] of [['drag-back', { act: { drag: true } }], ['roulette', { act: { skill: { move: 'roulette', side: 1 } } }]]) {
      const rows = trick({ firstPerson, ...o }), k = rows.findIndex(r => r.types.includes(name === 'roulette' ? 'skill' : 'drag'));
      const T = HOLD[name === 'roulette' ? 'roulette' : 'drag'], mid = rows.slice(k + Math.round(T * 0.25 / DT), k + Math.round(T * 0.5 / DT));
      assert.ok(mid.every(r => r.owner === 'you'), `${name}: still yours`);
      assert.ok(Math.max(...mid.map(r => Math.abs(r.right))) < 0.03, `${name}: studs on the ball (worst ${cm(Math.max(...mid.map(r => Math.abs(r.right))))} cm)`);
      const closest = Math.min(...rows.slice(k, k + Math.round(T / DT)).map(r => r.far));
      assert.ok(closest < HOLD.in + 0.06, `${name}: pulled in to ${closest.toFixed(2)} m`);
      const after = rows[k + Math.round((T + 0.25) / DT)];
      assert.ok(after.far > HOLD.in + 0.1, `${name}: and let go again (${after.far.toFixed(2)} m away)`);
    }
  });

  test(`${who}: the rainbow is rolled up behind the heel and flicked from there`, () => {
    const rows = trick({ firstPerson, act: { skill: { move: 'rainbow', side: 1 } } });
    const s = rows.findIndex(r => r.types.includes('windup')), k = rows.findIndex(r => r.types.includes('launched'));
    assert.ok(s > 0 && k > s + 5, 'it takes a moment');
    assert.ok(rows[k].ahead < 0 && rows[k].y > BALL.r + 0.2, `flicked from behind you (${rows[k].ahead.toFixed(2)} m, ${rows[k].y.toFixed(2)} m up)`);
    assert.ok(Math.abs(rows[k].right) < 0.04, `heel ${cm(rows[k].right)} cm from the ball as it goes`);
    assert.ok(rows.slice(k + 10, k + 60).some(r => r.y > 1.9), 'and it goes over your head');
  });

  test(`${who}: a step-over takes the boot round the ball without touching it`, () => {
    const rows = trick({ firstPerson, act: { skill: { move: 'stepover', side: 1 } } }), k = rows.findIndex(r => r.types.includes('skill'));
    const during = rows.slice(k, k + Math.round(0.4 / DT));
    assert.ok(during.every(r => r.owner === 'you'));
    assert.ok(Math.min(...during.map(r => r.right)) > -0.02, `never in the ball (${cm(Math.min(...during.map(r => r.right)))} cm)`);
    assert.ok(Math.min(...during.map(r => r.right)) < 0.12, `but close round it (${cm(Math.min(...during.map(r => r.right)))} cm)`);
  });
}
