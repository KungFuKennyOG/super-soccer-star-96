import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepSim, defenders } from '../../rules/sim.js';
import { tuneFor, levelFor } from '../../rules/skill.js';
import { defenceTargets, mateSupport, STEP_UP } from '../../rules/brain.js';
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

test('doubling: from the quarter-finals a second defender closes you down near the box', () => {
  for (const [level, expect] of [[0, false], [1, true]]) {
    const w = world(level);
    w.you.x = 0; w.you.z = GOAL.z + 17; w.ball.x = 0; w.ball.z = w.you.z - 0.6;
    const roles = [...defenceTargets(w).values()].map(t => t.role);
    assert.equal(roles.includes('double'), expect, `level ${level}`);
    assert.ok(roles.includes('press'));
  }
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

test('stepping up: from the semis the markers squeeze up when you turn back, but not off a runner', () => {
  for (const [level, expect] of [[0, false], [2, true]]) {
    const w = world(level);
    w.you.z = -14; w.ball.z = -14.6;
    // m1 just beyond the line's spot, m2 making a deep run into the box
    w.byId.m1.x = -8; w.byId.m1.z = -18.5; w.byId.m2.x = 8; w.byId.m2.z = -30;
    w.drill = { frozen: new Set(['m1', 'm2']), mateHold: false, crossHead: false };
    run(w, 0.4, idle({ move: { x: 0, z: 1 } }));           // run back toward halfway
    const line = w.ball.z - STEP_UP.gap;
    const marks = [...defenceTargets(w).values()].filter(t => t.role === 'mark' || t.role === 'zone');
    const onM1 = marks.reduce((a, t) => (dist(t, w.byId.m1) < dist(a, w.byId.m1) ? t : a));
    const onM2 = marks.reduce((a, t) => (dist(t, w.byId.m2) < dist(a, w.byId.m2) ? t : a));
    assert.equal(onM1.z >= line - 1e-6, expect, `level ${level}: m1's marker`);
    assert.ok(onM2.z < line - 2, `level ${level}: the runner's marker stays with him`);
  }
});

test('teammates split into a runner into the box and a support man wide of you', () => {
  const w = world(0);
  const targets = ['m1', 'm2'].map(id => mateSupport(w, w.byId[id]));
  const run = targets.find(t => t.role === 'run'), sup = targets.find(t => t.role === 'support');
  assert.ok(run && sup);
  assert.ok(run.z < w.you.z - 5 && run.z >= GOAL.z + 7, 'the runner goes beyond you, toward the box');
  assert.ok(Math.abs(sup.x - w.you.x) > 5 && Math.abs(sup.z - w.you.z) < 3, 'the support man is wide and level');
  // defenders on the pitch still mark them
  assert.equal(defenders(w).length, 3);
});

import { LEVEL_NAMES } from '../../rules/tuning.js';
test('scouting reports fit the banner', () => {
  assert.equal(LEVEL_NAMES.length, BRAIN.length);
  for (const t of LEVEL_NAMES) for (const l of t.split('\n')) assert.ok(l.length <= 31, l);
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

