import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ballOnHead, canVolley, canBicycle, headerVelocity, bicycleVelocity, crossVelocity, flickVelocity, inBox } from '../../rules/aerial.js';
import { createWorld, stepSim } from '../../rules/sim.js';
import { stepBall } from '../../rules/ball.js';
import { createMatch, scoreEvent } from '../../rules/match.js';
import { GOAL, AIR } from '../../rules/tuning.js';

const seeded = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const toGoal = (from) => { const d = { x: -from.x, y: 1.2 - from.y, z: GOAL.z - from.z }, l = Math.hypot(d.x, d.y, d.z); return { x: d.x / l, y: d.y / l, z: d.z / l }; };

test('the ball touches your head only when it is right there', () => {
  const head = { x: 0, y: 1.7, z: -20 };
  assert.ok(ballOnHead({ x: 0.1, y: 1.75, z: -20.1 }, head));
  assert.ok(!ballOnHead({ x: 0, y: 1.2, z: -20 }, head));
});

test('volley and bicycle windows: height, reach, and looking up for the overhead', () => {
  const you = { x: 0, z: -20 };
  assert.ok(canVolley({ x: 0.3, y: 0.7, z: -20.4 }, you));
  assert.ok(!canVolley({ x: 0.3, y: 0.1, z: -20.4 }, you));
  assert.ok(!canVolley({ x: 2, y: 0.7, z: -20 }, you));
  assert.ok(canBicycle({ x: 0.2, y: 1.6, z: -20.2 }, you, { x: 0, y: 0.7, z: -0.7 }));
  assert.ok(!canBicycle({ x: 0.2, y: 1.6, z: -20.2 }, you, { x: 0, y: 0.1, z: -1 }));
});

test('a header aimed at the goal heads for the goal, harder when you lunge into it', () => {
  const ball = { x: 0, y: 1.8, z: -24 }, eye = { x: 0, y: 1.8, z: -24 }, dir = toGoal(eye);
  const soft = headerVelocity(ball, { ...eye, vx: 0, vy: 0, vz: 0 }, dir, seeded(1));
  const hard = headerVelocity(ball, { ...eye, vx: 0, vy: 0, vz: -3 }, dir, seeded(1));
  assert.ok(soft.vz < 0 && hard.vz < soft.vz);
  assert.ok(hard.power > soft.power);
});

test('a bicycle kick always goes inside the frame', () => {
  for (let i = 0; i < 30; i++) {
    const b = { x: (i % 5) - 2, y: 1.6, z: -22, vx: 0, vy: 0, vz: 0, curl: 0, inNet: false, spin: 0 };
    const v = bicycleVelocity(b, seeded(i + 3));
    Object.assign(b, { vx: v.vx, vy: v.vy, vz: v.vz });
    let ev = [];
    for (let k = 0; k < 400 && !ev.length; k++) ev = stepBall(b, 1 / 120);
    assert.equal(ev[0] && ev[0].type, 'goal', `kick ${i}: ${JSON.stringify(ev[0])}`);
  }
});

test('a cross drops onto the runner at head or waist height', () => {
  for (let i = 0; i < 20; i++) {
    const from = { x: 14, y: 0.12, z: -22 }, you = { x: 0, z: -25, vx: 0, vz: -2 };
    const c = crossVelocity(from, you, 1.7, seeded(i + 1));
    const b = { ...from, vx: c.vx, vy: c.vy, vz: c.vz, curl: 0, inNet: false, spin: 0 };
    let best = Infinity, yAt = 0;
    for (let k = 0; k < 300; k++) { stepBall(b, 1 / 120); const d = Math.hypot(b.x - c.lead.x, b.z - c.lead.z); if (d < best) { best = d; yAt = b.y; } }
    assert.ok(best < 0.6, `misses by ${best}`);
    assert.ok(yAt > 0.6 && yAt < 2.1, `arrives at ${yAt}`);
  }
});

test('standing still, knock-on flicks the ball up; the box is near the goal', () => {
  const v = flickVelocity({ fx: 0, fz: -1 });
  assert.ok(v.vy > 4 && v.vz < 0);
  assert.ok(inBox({ x: 0, z: GOAL.z + 10 }) && !inBox({ x: 0, z: GOAL.z + 25 }));
});

test('in the sim: flick it up, then volley it first time', () => {
  const w = createWorld(seeded(5));
  w.you.x = 0; w.you.z = GOAL.z + 16; w.ball.x = 0; w.ball.z = w.you.z - 0.6; w.owner = 'you';
  for (const d of w.players) if (d.role === 'def') d.z = 0;          // out of the way
  stepSim(w, { knock: true }, 1 / 72);
  assert.equal(w.owner, null);
  let kick = null;
  for (let i = 0; i < 120 && !kick; i++) {
    const eye = { x: w.you.x, y: 1.7, z: w.you.z };
    const it = canVolley(w.ball, w.you) && w.time > 0.5 ? { strike: { eye, dir: toGoal(eye) } } : {};
    kick = stepSim(w, it, 1 / 72).find(e => e.type === 'kick');
  }
  assert.ok(kick, 'volleyed');
  assert.equal(kick.kind, 'volley');
});

test('a dropping ball is not trapped above waist height, so it can be headed', () => {
  const w = createWorld(seeded(9));
  for (const d of w.players) if (d.role === 'def') d.z = 0;
  w.owner = null; w.you.x = 0; w.you.z = GOAL.z + 12;
  Object.assign(w.ball, { x: 0, y: 1.72, z: w.you.z - 0.05, vx: 0, vy: 0, vz: -1 });
  const ev = stepSim(w, { head: { x: 0, y: 1.72, z: w.you.z, vx: 0, vy: 0, vz: -2 }, gaze: toGoal({ x: 0, y: 1.72, z: w.you.z }) }, 1 / 72);
  const k = ev.find(e => e.type === 'kick');
  assert.ok(k && k.kind === 'header');
  assert.notEqual(w.owner, 'you');
});

test('goals from the air score a bonus', () => {
  const m = createMatch();
  const b = scoreEvent(m, { type: 'goal', by: 'you', x: 0, y: 1, dist: 10, kind: 'bicycle' });
  assert.equal(b.text, 'BICYCLE KICK!');
  assert.equal(m.points, 1000 + 1500);
  assert.ok(AIR.trapBelow < AIR.volleyHigh);
});

test('headers near goal go on target even when you are not looking at the goal', () => {
  const ball = { x: 3, y: 1.7, z: GOAL.z + 9 };
  const head = { x: 3, y: 1.64, z: GOAL.z + 9.1, vx: 0, vy: 0, vz: -1 };
  for (const dir of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0.6, z: 0.8 }, { x: -0.7, y: -0.2, z: 0.7 }]) {
    const v = headerVelocity(ball, head, dir, seeded(3), 1.2);
    // follow it to the goal line
    const T = (ball.z - GOAL.z) / -v.vz;
    assert.ok(T > 0, 'it goes toward goal');
    const x = ball.x + v.vx * T, y = ball.y + v.vy * T - 0.5 * 9.81 * T * T;
    assert.ok(Math.abs(x) < GOAL.halfW && y > 0 && y < GOAL.h, `on target: ${x.toFixed(2)}, ${y.toFixed(2)}`);
    assert.ok(x < 0, 'away from a keeper standing to the right');
  }
  // far out, it's a flick-on the way you face
  const far = headerVelocity({ x: 0, y: 1.7, z: GOAL.z + 30 }, { x: 0, y: 1.64, z: GOAL.z + 30.1, vx: 0, vy: 0, vz: 0 }, { x: 1, y: 0, z: 0 }, seeded(3));
  assert.ok(far.vx > Math.abs(far.vz));
});
