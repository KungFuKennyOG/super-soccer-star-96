import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepSim } from '../../rules/sim.js';
import { tuneFor } from '../../rules/skill.js';
import { isChip } from '../../rules/shot.js';
import { GOAL, SHOT } from '../../rules/tuning.js';

const fixed = () => 0.5;
const DT = 1 / 72;
const idle = (o = {}) => ({ move: { x: 0, z: 0 }, facing: { x: 0, z: -1 }, ...o });
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
function run(w, secs, intent = idle()) {
  const all = [];
  for (let t = 0; t < secs; t += DT) all.push(...stepSim(w, typeof intent === 'function' ? intent(t) : intent, DT, fixed));
  return all;
}
// you alone on the ball d metres out, defenders out of the way (or one standing in front of goal)
function through(level, d, blocker = false) {
  const w = createWorld(fixed, tuneFor(3, 3, level));
  for (const id of ['d1', 'd2', 'd3']) { const p = w.byId[id]; p.x = 20; p.z = -1; p.stun = 99; }
  if (blocker) { const p = w.byId.d2; p.x = 0; p.z = GOAL.z + d * 0.5; }
  w.drill = { frozen: new Set(['d1', 'd2', 'd3']), mateHold: false, crossHead: false };
  w.you.x = 0; w.you.z = GOAL.z + d; w.ball.x = 0; w.ball.z = w.you.z - 0.62;
  run(w, 1.5);                                              // he sizes it up
  return w;
}
function shoot(w, aim, holdT) {
  const eye = { x: w.you.x, y: 1.7, z: w.you.z };
  const ev = [...stepSim(w, idle({ shot: { eye, dir: unit(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z), holdT } }), DT, fixed), ...run(w, 3)];
  return ev.find(e => ['goal', 'saved', 'parried', 'out', 'post'].includes(e.type));
}

test('one on one, the keeper comes off his line, further in the late rounds', () => {
  const out = level => through(level, 12).byId.gk.z - GOAL.z;
  assert.ok(out(0) > 1.5, `level 0: ${out(0)}`);
  assert.ok(out(3) > out(0) + 1, `level 3 ${out(3)} vs level 0 ${out(0)}`);
  // with a defender between you and goal he stays home
  assert.ok(through(3, 12, true).byId.gk.z - GOAL.z < 1.7);
});

test('a quick tap is a chip: it drops over a keeper who has come out', () => {
  assert.ok(isChip(SHOT.chipBelow - 0.01) && !isChip(SHOT.chipBelow + 0.01));
  const e = shoot(through(3, 11), { x: 1.4, y: 1.5, z: GOAL.z }, 0.1);
  assert.equal(e.type, 'goal');
  assert.equal(e.kind, 'chip');
});

test('the same chip at a keeper on his line is an easy catch', () => {
  const e = shoot(through(3, 11, true), { x: 1.4, y: 1.5, z: GOAL.z }, 0.1);
  assert.equal(e.type, 'saved');
});

test('a firm shot at an advanced keeper still beats him in the far corner', () => {
  const e = shoot(through(3, 11), { x: GOAL.halfW - 0.4, y: 0.5, z: GOAL.z }, 0.85);
  assert.equal(e.type, 'goal');
});

test('from the quarter-finals the keeper races out to claim a through-ball nobody can reach', () => {
  for (const [level, claims] of [[0, false], [1, true]]) {
    const w = createWorld(fixed, tuneFor(3, 3, level));
    for (const id of ['d1', 'd2', 'd3']) { const p = w.byId[id]; p.x = 20; p.z = -1; }
    w.drill = { frozen: new Set(['d1', 'd2', 'd3', 'm1', 'm2']), mateHold: false, crossHead: false };
    // a heavy touch: the ball runs on toward the box, you're well behind it
    w.you.z = GOAL.z + 24; w.owner = null; Object.assign(w.ball, { x: 1, y: 0.11, z: GOAL.z + 18, vx: 0, vy: 0, vz: -9 });
    const ev = run(w, 3, idle({ move: { x: 0, z: -0.2 } }));
    const claim = ev.find(e => e.type === 'saved' && e.claim);
    assert.equal(!!claim, claims, `level ${level}: ${ev.map(e => e.type)}`);
  }
});

test('he does not come for a lofted pass or cross: those stay yours to attack', () => {
  const w = createWorld(fixed, tuneFor(3, 3, 3));
  for (const id of ['d1', 'd2', 'd3']) { const p = w.byId[id]; p.x = 20; p.z = -1; }
  w.drill = { frozen: new Set(['d1', 'd2', 'd3', 'm1', 'm2']), mateHold: false, crossHead: false };
  w.you.x = 0; w.you.z = GOAL.z + 9;
  w.owner = null; Object.assign(w.ball, { x: 12, y: 1.2, z: GOAL.z + 12, vx: -8, vy: 4, vz: -2 });
  w.pendingPass = { from: 'm2', to: 'you', grade: 'good', t: 0, lead: { x: 0, z: GOAL.z + 9 }, lob: true, cross: true };
  const ev = run(w, 0.8);
  assert.ok(!ev.some(e => e.type === 'saved'));
  assert.ok(!w.byId.gk.rushing);
});
