import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepSim, defenders } from '../../rules/sim.js';
import { tuneFor, levelFor } from '../../rules/skill.js';
import { defenceTargets, mateSupport } from '../../rules/brain.js';
import { laneBlocked } from '../../rules/pass.js';
import { GOAL, BRAIN } from '../../rules/tuning.js';
import { dist } from '../../rules/vec.js';

const fixed = () => 0.5;
const DT = 1 / 72;
const idle = (o = {}) => ({ move: { x: 0, z: 0 }, facing: { x: 0, z: -1 }, ...o });
function run(w, secs, intent = idle()) {
  const all = [];
  for (let t = 0; t < secs; t += DT) all.push(...stepSim(w, typeof intent === 'function' ? intent(t) : intent, DT, fixed));
  return all;
}
const world = level => createWorld(fixed, tuneFor(3, 3, level));

test('match level: cup rounds get smarter, Score Attack only against 5 stars', () => {
  assert.equal(levelFor('world', 'group'), 0);
  assert.equal(levelFor('club', 'r16'), 0);
  assert.equal(levelFor('club', 'qf'), 1);
  assert.equal(levelFor('world', 'sf'), 2);
  assert.equal(levelFor('world', 'final'), 3);
  assert.equal(levelFor('attack', null, 4), 0);
  assert.equal(levelFor('attack', null, 5), 1);
  assert.equal(levelFor('training'), 0);
  assert.equal(tuneFor(3, 3, 9).brain, BRAIN[BRAIN.length - 1]);
});

test('the presser comes at you from the goal side; a harmless attacker is left and his man covers', () => {
  const w = world(0);
  w.you.x = 0; w.you.z = -10; w.ball.x = 0; w.ball.z = -10.6;
  w.byId.m1.x = -12; w.byId.m1.z = -6;                  // out of harm's way
  w.byId.m2.x = 9; w.byId.m2.z = -20;                   // dangerous
  const t = defenceTargets(w), roles = [...t.values()].map(x => x.role).sort();
  assert.deepEqual(roles, ['cover', 'mark', 'press']);
  const press = [...t.values()].find(x => x.role === 'press');
  assert.ok(press.z < w.you.z, 'the presser is goal-side of you');
  const cover = [...t.values()].find(x => x.role === 'cover');
  assert.ok(cover.z < w.ball.z && Math.abs(cover.x) < 3, 'the spare man sits between the ball and goal');
});

test('later rounds mark tighter and sit the spare man closer', () => {
  const at = level => {
    const w = world(level);
    w.you.x = 0; w.you.z = -10; w.ball.x = 0; w.ball.z = -10.6;
    w.byId.m1.x = -12; w.byId.m1.z = -6; w.byId.m2.x = 9; w.byId.m2.z = -20;
    const t = [...defenceTargets(w).values()];
    const mark = t.find(x => x.role === 'mark'), cover = t.find(x => x.role === 'cover');
    return { markToBall: dist(mark, w.ball), coverToBall: dist(cover, w.ball) };
  };
  assert.ok(at(3).markToBall < at(0).markToBall);
  assert.ok(at(3).coverToBall < at(0).coverToBall);
  assert.ok(tuneFor(3, 3, 3).ai.gkReact < tuneFor(3, 3, 0).ai.gkReact, 'and the keeper is sharper');
});

test('drag-backs: the presser falls for the first ones, then reads the same trick', () => {
  const w = world(3);                                  // dragBite 2 at this level
  const d2 = w.byId.d2; d2.x = 0; d2.z = w.you.z - 2;
  const drags = [];
  const drag = () => {
    d2.stun = 0; d2.x = 0; d2.z = w.you.z - 2.5; d2.vx = d2.vz = 0;
    const e = stepSim(w, idle({ drag: true }), DT, fixed).find(x => x.type === 'drag');
    return { read: e.read, stunned: d2.stun > 0 };
  };
  for (let i = 0; i < 3; i++) { drags.push(drag()); w.time += 0.5; }
  assert.deepEqual(drags.map(d => d.read), [false, false, true]);
  assert.deepEqual(drags.map(d => d.stunned), [true, true, false]);
  // a few seconds later he falls for it again
  w.time += 3.2;
  assert.equal(drag().read, false);
});

test('teammates find space: a runner beyond you toward the box, a support man near you with a clear pass', () => {
  const w = world(0);
  run(w, 0.05);
  const targets = ['m1', 'm2'].map(id => ({ id, ...mateSupport(w, w.byId[id]) }));
  const r = targets.find(t => t.role === 'run'), sup = targets.find(t => t.role === 'support');
  assert.ok(r && sup);
  assert.ok(r.z < w.you.z - 2 && r.z >= GOAL.z + 6, `the runner goes beyond you: ${r.z}`);
  assert.ok(dist(sup, w.you) > 5 && dist(sup, w.you) < 12, 'the support man is close by');
  assert.ok(!laneBlocked(w.ball, sup, defenders(w), 1.1, 1.8), 'with a clear lane from the ball');
  assert.ok(dist(r, sup) > 6, 'and they don\'t crowd each other');
});

test('the runner keeps his run going into the box', () => {
  const w = world(0);
  for (const id of ['d1', 'd2', 'd3']) { const p = w.byId[id]; p.x = 20; p.z = -1; p.stun = 99; }
  run(w, 0.05);
  const runner = w.brain.runner;
  run(w, 4, idle({ move: { x: 0, z: -0.3 } }));
  assert.equal(w.brain.runner, runner, 'no needless swaps');
  assert.ok(w.byId[runner].z < GOAL.z + 14, `he got into the box: ${w.byId[runner].z.toFixed(1)}`);
});

