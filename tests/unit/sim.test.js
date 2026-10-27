import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepSim, resetPlay } from '../../rules/sim.js';
import { perfectTime } from '../../rules/pass.js';
import { GOAL } from '../../rules/tuning.js';

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
});
