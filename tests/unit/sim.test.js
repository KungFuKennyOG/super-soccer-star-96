import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepSim, resetPlay } from '../../rules/sim.js';
import { perfectTime } from '../../rules/pass.js';
import { GOAL, STRIKE, DRIBBLE, BALL } from '../../rules/tuning.js';

const fixed = () => 0.5;
const idle = (o = {}) => ({ move: { x: 0, z: 0 }, facing: { x: 0, z: -1 }, ...o });
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
const DT = 1 / 72;

function run(w, secs, intent = idle()) {
  const all = [];
  for (let t = 0; t < secs; t += DT) all.push(...stepSim(w, typeof intent === 'function' ? intent(t) : intent, DT, fixed));
  return all;
}

test('you start on the ball and keep it while dribbling in open space', () => {
  const w = createWorld(fixed);
  for (const id of ['d1', 'd2', 'd3']) { w.byId[id].x = 20; w.byId[id].z = -2; w.byId[id].stun = 99; }
  run(w, 1, idle({ move: { x: 0, z: -1 } }));
  assert.equal(w.owner, 'you');
  assert.ok(w.you.z < -6);
  assert.ok(Math.abs(w.ball.z - (w.you.z - 0.62)) < 0.2);
});

test('a perfect pass reaches the teammate and counts as perfect', () => {
  const w = createWorld(fixed);
  for (const id of ['d1', 'd2', 'd3']) { w.byId[id].x = 20; w.byId[id].z = -1; w.byId[id].stun = 99; }
  let ev = stepSim(w, idle({ pass: { holdT: perfectTime(), targetId: 'm1' } }), DT, fixed);
  ev = [...ev, ...run(w, 0.15)];                                // struck a moment after it's released
  assert.equal(ev.find(e => e.type === 'pass').grade, 'perfect');
  ev = run(w, 2);
  const r = ev.find(e => e.type === 'received');
  assert.ok(r, 'received'); assert.equal(r.id, 'm1'); assert.equal(r.grade, 'perfect');
});

test('a full-power shot at the top corner from 18 m beats the keeper', () => {
  const w = createWorld(fixed);
  w.you.x = 0; w.you.z = GOAL.z + 18.6; w.ball.x = 0; w.ball.z = GOAL.z + 18;
  for (const id of ['d1', 'd2', 'd3']) { w.byId[id].x = 20; w.byId[id].z = -1; }
  w.byId.gk.x = 0;
  const eye = { x: 0, y: 1.6, z: w.you.z };
  const tgt = { x: 3.2, y: 2.1, z: GOAL.z };
  const shot = { eye, dir: unit(tgt.x - eye.x, tgt.y - eye.y, tgt.z - eye.z), holdT: 1 };
  let ev = stepSim(w, idle({ shot }), DT, fixed);
  ev = ev.concat(run(w, 2));
  const goal = ev.find(e => e.type === 'goal');
  assert.ok(goal, JSON.stringify(ev.map(e => e.type)));
  assert.equal(goal.by, 'you');
});

test('a soft shot down the middle gets saved', () => {
  const w = createWorld(fixed);
  w.you.z = GOAL.z + 18.6; w.ball.x = 0; w.ball.z = GOAL.z + 18;
  for (const id of ['d1', 'd2', 'd3']) { w.byId[id].x = 20; w.byId[id].z = -1; }
  const eye = { x: 0, y: 1.6, z: w.you.z };
  const shot = { eye, dir: unit(0, -0.5, -18.6), holdT: 0.1 };
  const ev = [...stepSim(w, idle({ shot }), DT, fixed), ...run(w, 3)];
  assert.ok(ev.some(e => e.type === 'saved'), JSON.stringify(ev.map(e => e.type)));
  assert.ok(w.dead);
});

test('standing still next to a defender loses the ball; a drag-back buys time', () => {
  const w = createWorld(fixed);
  const d = w.byId.d2; d.x = w.ball.x; d.z = w.ball.z - 0.5;
  const ev = run(w, 1);
  assert.ok(ev.some(e => e.type === 'tackled'));
  resetPlay(w, fixed);
  w.byId.d2.x = w.ball.x; w.byId.d2.z = w.ball.z - 0.5;
  const ev2 = stepSim(w, idle({ drag: true }), DT, fixed);
  assert.ok(ev2.some(e => e.type === 'drag'));
  assert.ok(w.byId.d2.stun > 0 && w.dragGrace > 0);
});

test('calling for it gets the ball back from a teammate', () => {
  const w = createWorld(fixed);
  for (const id of ['d1', 'd2', 'd3']) { w.byId[id].x = 20; w.byId[id].z = -1; w.byId[id].stun = 99; }
  w.owner = 'm1'; w.ownT = 0;
  const ev = run(w, 3, t => idle({ call: t < DT }));
  assert.ok(ev.some(e => e.type === 'pass' && e.by === 'm1' && e.to === 'you'));
  assert.ok(ev.some(e => e.type === 'received' && e.id === 'you'));
  assert.equal(ev.filter(e => e.type === 'called').length, 1);
});

test('a raised hand calls once, with the hand that went up', () => {
  const w = createWorld(fixed);
  w.owner = 'm1'; w.ownT = 0;
  const ev = stepSim(w, idle({ call: true, callHand: 'left' }), DT, fixed);
  assert.deepEqual(ev.find(e => e.type === 'called'), { type: 'called', by: 'm1', hand: 'left' });
  assert.ok(!stepSim(w, idle({ call: true }), DT, fixed).some(e => e.type === 'called'));   // already called
});

import { startCelebration } from '../../rules/sim.js';
test('after a goal, teammates gather in front of you facing you', () => {
  const w = createWorld(fixed);
  w.dead = true;
  startCelebration(w);
  run(w, 5);
  for (const id of ['m1', 'm2']) {
    const m = w.byId[id];
    assert.ok(Math.hypot(m.x - w.you.x, m.z - w.you.z) < 3.5, `${id} came over`);
    assert.ok(m.fx * (w.you.x - m.x) + m.fz * (w.you.z - m.z) > 0, `${id} faces you`);
  }
});

test('a zero-length step (the hit-stop) changes nothing and stays finite', () => {
  const w = createWorld(fixed);
  let ev = stepSim(w, idle({ shot: { eye: { x: 0, y: 1.7, z: -3 }, dir: unit(0, -0.05, -1), holdT: 0.8 } }), DT, fixed);
  while (!ev.some(e => e.type === 'kick')) ev = stepSim(w, idle(), DT, fixed);   // freeze on the frame it's struck
  const before = JSON.stringify(w.ball);
  for (let i = 0; i < 5; i++) stepSim(w, idle(), 0, fixed);
  assert.equal(JSON.stringify(w.ball), before);
  for (const p of w.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
});

import { isRebound } from '../../rules/sim.js';
test('a loose ball off a parry, block or the woodwork is a rebound until someone kicks it or it goes stale', () => {
  const w = createWorld(fixed);
  w.time = 10;
  assert.ok(!isRebound(w), 'nothing came back off anything');
  w.parryT = 9.2; assert.ok(isRebound(w), 'just parried');
  w.parryT = -9; w.reboundT = 9.5; assert.ok(isRebound(w), 'just blocked or off the post');
  w.kick = { by: 'm1', t: 9.8 }; assert.ok(!isRebound(w), 'a teammate has played it since');
  w.kick = null; w.time = 20; assert.ok(!isRebound(w), 'long gone');
});

test('a shot blocked by a defender standing in its way marks a rebound', () => {
  const w = createWorld(fixed);
  const d = w.byId.d2; d.x = w.you.x; d.z = w.you.z - 6; d.stun = 99;
  for (const id of ['d1', 'd3']) { w.byId[id].x = 20; w.byId[id].stun = 99; }
  const eye = { x: w.you.x, y: 1.7, z: w.you.z };
  const ev = run(w, 1.2, t => (t < DT ? idle({ shot: { eye, dir: unit(0, -0.02, -1), holdT: 0.8 } }) : idle()));
  assert.ok(ev.some(e => e.type === 'blocked'), 'the shot hit him');
  assert.ok(w.reboundT > 0, 'and the block was remembered');
});

/* ---------- the boot and the ball ---------- */

const clear = w => { for (const id of ['d1', 'd2', 'd3']) { w.byId[id].x = 20; w.byId[id].z = -1; w.byId[id].stun = 99; } };
const ahead = w => Math.hypot(w.ball.x - w.you.x, w.ball.z - w.you.z);

test('a shot is struck a moment after you let go, and the ball is still on the boot on that frame', () => {
  const w = createWorld(fixed); clear(w);
  run(w, 0.8, idle({ move: { x: 0, z: -1 }, sprint: true }));
  const eye = { x: w.you.x, y: 1.7, z: w.you.z };
  const go = idle({ move: { x: 0, z: -1 }, sprint: true });
  let ev = stepSim(w, { ...go, shot: { eye, dir: unit(0.05, -0.03, -1), holdT: 0.8 } }, DT, fixed);
  const wu = ev.find(e => e.type === 'windup');
  assert.ok(wu && wu.kind === 'shot' && wu.t === STRIKE.shot, 'the wind-up is announced with its length');
  assert.ok(!ev.some(e => e.type === 'kick') && w.owner === 'you', 'not struck yet');
  let t = 0;
  while (!ev.some(e => e.type === 'kick') && t < 1) { ev = stepSim(w, go, DT, fixed); t += DT; }
  assert.ok(Math.abs(t - STRIKE.shot) <= DT + 1e-9, `struck after ${t.toFixed(3)} s`);
  assert.ok(Math.abs(ahead(w) - STRIKE.lead) < 0.12, `ball ${ahead(w).toFixed(2)} m ahead when it's hit`);
  assert.ok(Math.hypot(w.ball.vx, w.ball.vz) > 20, 'it has its speed');
  stepSim(w, go, DT, fixed);
  assert.ok(ahead(w) > STRIKE.lead + 0.15, 'and leaves on the next frame');
});

test('a wound-up strike cannot be tackled, and a pass is struck the same way', () => {
  const w = createWorld(fixed); clear(w);
  const d = w.byId.d2; d.stun = 0; d.x = w.ball.x; d.z = w.ball.z - 0.3; d.tackleT = 0.2;   // right on the ball
  let ev = stepSim(w, idle({ pass: { holdT: perfectTime(), targetId: 'm1' } }), DT, fixed);
  assert.equal(ev.find(e => e.type === 'windup').kind, 'pass');
  ev = run(w, STRIKE.pass + 2 * DT);
  assert.ok(!ev.some(e => e.type === 'tackled'), 'no tackle in the wind-up');
  assert.ok(ev.some(e => e.type === 'pass'), 'the pass went');
});

test('dribbling: the ball is tapped on once a stride and stays within reach', () => {
  const w = createWorld(fixed); clear(w);
  const go = idle({ move: { x: 0, z: -1 }, sprint: true });
  run(w, 0.6, go);
  let touches = 0, lo = 9, hi = 0, atTouch = [];
  for (let t = 0; t < 2; t += DT) {
    const ev = stepSim(w, go, DT, fixed);
    lo = Math.min(lo, ahead(w)); hi = Math.max(hi, ahead(w));
    if (ev.some(e => e.type === 'dribble')) { touches++; atTouch.push(ahead(w)); }
  }
  assert.ok(touches >= 3 && touches <= 5, `${touches} touches in 2 s at a sprint`);
  for (const a of atTouch) assert.ok(Math.abs(a - DRIBBLE.near) < 0.08, `at the touch the ball is ${a.toFixed(2)} m ahead`);
  assert.ok(lo > DRIBBLE.near - 0.03 && hi < DRIBBLE.near + DRIBBLE.push + 0.12, `between ${lo.toFixed(2)} and ${hi.toFixed(2)} m`);
  assert.ok(hi - lo > DRIBBLE.push * 0.7, 'it visibly runs ahead and comes back');
  assert.equal(w.ball.y, BALL.r);
  // standing still it rests at your feet: no touches
  run(w, 0.5);                                                   // pull up
  assert.ok(!run(w, 1).some(e => e.type === 'dribble'));
  assert.ok(Math.abs(ahead(w) - DRIBBLE.near) < 0.08);
});

test('your own chip on its way to goal is left alone: you cannot head it in flight', () => {
  const w = createWorld(fixed); clear(w);
  w.you.x = 0; w.you.z = GOAL.z + 11; w.ball.x = 0; w.ball.z = w.you.z - 0.5;
  const gk = w.byId.gk; gk.x = 0; gk.z = GOAL.z + 3.5;                    // well off his line
  const eye = { x: 0, y: 1.7, z: w.you.z };
  const all = [...stepSim(w, idle({ shot: { eye, dir: unit(0, 0.02, -1), holdT: 0.1 } }), DT, fixed)];
  // half a second into its flight, put your head right on it (wherever it is) and keep it there
  for (let t = 0; t < 3 && !w.dead; t += DT) {
    gk.z = GOAL.z + 3.5;
    const b = w.ball, under = t > 0.5 && b.z > GOAL.z + 1.5;
    if (under) { w.you.x = b.x; w.you.z = b.z; }
    all.push(...stepSim(w, idle(under ? { head: { x: b.x, y: b.y, z: b.z, vx: 0, vy: 0, vz: -3 }, gaze: { x: 0, y: 0, z: -1 } } : {}), DT, fixed));
  }
  const kinds = all.map(e => e.type + (e.kind ? ':' + e.kind : '')).join(',');
  assert.ok(all.some(e => e.type === 'kick' && !e.kind), kinds);
  assert.ok(!all.some(e => e.kind === 'header'), kinds);
});
