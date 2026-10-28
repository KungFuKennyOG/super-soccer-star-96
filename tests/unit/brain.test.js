import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepSim, defenders } from '../../rules/sim.js';
import { tuneFor, levelFor } from '../../rules/skill.js';
import { defenceTargets, mateSupport, STEP_UP } from '../../rules/brain.js';
import { perfectTime } from '../../rules/pass.js';
import { GOAL, BRAIN } from '../../rules/tuning.js';
import { dist, norm } from '../../rules/vec.js';

const fixed = () => 0.5;
const DT = 1 / 72;
const idle = (o = {}) => ({ move: { x: 0, z: 0 }, facing: { x: 0, z: -1 }, ...o });
function run(w, secs, intent = idle()) {
  const all = [];
  for (let t = 0; t < secs; t += DT) all.push(...stepSim(w, typeof intent === 'function' ? intent(t) : intent, DT, fixed));
  return all;
}
const world = level => createWorld(fixed, tuneFor(3, 3, level));
const lookAt = (w, id) => norm(w.byId[id].x - w.you.x, w.byId[id].z - w.you.z);

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

test('staring at one teammate gets you read: his marker steps in front, and READ shows only after the read time', () => {
  const w = world(3), B = w.tune.brain;
  run(w, B.read * 0.6, () => idle({ facing: lookAt(w, 'm1') }));
  assert.equal(w.brain.read, null, 'not yet');
  run(w, B.read * 0.6, () => idle({ facing: lookAt(w, 'm1') }));
  assert.equal(w.brain.read, 'm1');
  const roles = defenceTargets(w);
  const reader = [...roles].find(([, t]) => t.role === 'read');
  assert.ok(reader, 'someone reads it');
  const spot = reader[1], m1 = w.byId.m1;
  assert.ok(dist(spot, m1) < B.readGap + Math.hypot(m1.vx, m1.vz) * 0.35 + 0.01, 'he steps in front of your teammate');
  // looking at the other one starts the clock again
  run(w, DT * 2, () => idle({ facing: lookAt(w, 'm2') }));
  assert.equal(w.brain.read, null);
});

test('a pass to a teammate they have read gets cut out; the same pass unread arrives', () => {
  const outcome = read => {
    const w = world(3);
    w.byId.d3.x = 20; w.byId.d3.z = -1; w.byId.d3.stun = 99;
    w.you.z = -12; w.ball.x = 0; w.ball.z = -12.6;
    w.byId.d1.x = 11; w.byId.d1.z = -12;                    // the presser, a few strides away
    w.byId.m1.x = -8; w.byId.m1.z = -19;
    const d2 = w.byId.d2; d2.x = -8; d2.z = -21.2;           // marking m1 from the goal side
    const look = () => idle({ facing: lookAt(w, 'm1') });
    if (read) { w.brain.seen = 'm1'; w.brain.seenT = 9; run(w, 1.1, look); }   // you've stared: he steps in front
    else run(w, 1.1, () => idle({ facing: { x: 0, z: -1 } }));
    const ev = [...stepSim(w, idle({ facing: lookAt(w, 'm1'), pass: { holdT: perfectTime(), targetId: 'm1' } }), DT, fixed), ...run(w, 2.5)];
    return ev.find(e => e.type === 'intercepted' || (e.type === 'received' && e.id === 'm1')) || { type: ev.map(e => e.type).join(',') };
  };
  assert.equal(outcome(true).type, 'intercepted');
  assert.equal(outcome(false).type, 'received');
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

test('stepping up: from the semis the markers squeeze up when you turn back', () => {
  for (const [level, expect] of [[0, false], [2, true]]) {
    const w = world(level);
    w.you.z = -14; w.ball.z = -14.6;
    // both teammates stand deep in the box, so their markers would normally sit deep too
    w.byId.m1.x = -8; w.byId.m1.z = -28; w.byId.m2.x = 8; w.byId.m2.z = -28;
    w.drill = { frozen: new Set(['m1', 'm2']), mateHold: false, crossHead: false };
    run(w, 0.4, idle({ move: { x: 0, z: 1 } }));           // run back toward halfway
    const line = w.ball.z - STEP_UP.gap;
    const marks = [...defenceTargets(w).entries()].filter(([, t]) => t.role === 'mark' || t.role === 'zone');
    assert.ok(marks.length > 0);
    const squeezed = marks.every(([, t]) => t.z >= line - 1e-6);
    assert.equal(squeezed, expect, `level ${level}`);
  }
});

test('teammates split into a runner into the box and a support man wide of you', () => {
  const w = world(0);
  const targets = ['m1', 'm2'].map(id => mateSupport(w, w.byId[id], DT));
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
