import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringScale, gradePass, perfectTime, passVelocity, pickTarget, leadPoint } from '../../rules/pass.js';
import { PASS } from '../../rules/tuning.js';

test('the ring shrinks from its start size to nothing', () => {
  assert.equal(ringScale(0), PASS.ringStart);
  assert.equal(ringScale(PASS.ringTime), 0);
});

test('grades: perfect on the circle, worse further away, miss once closed', () => {
  assert.equal(gradePass(perfectTime()), 'perfect');
  assert.equal(gradePass(perfectTime() + 0.1), 'good');
  assert.equal(gradePass(0.05), 'poor');
  assert.equal(gradePass(PASS.ringTime + 0.01), 'miss');
});

test('the perfect window is wide enough to hit in VR (over 90 ms)', () => {
  let n = 0;
  for (let t = 0; t < PASS.ringTime; t += 0.001) if (gradePass(t) === 'perfect') n++;
  assert.ok(n > 90, `window ${n} ms`);
});

test('a perfect pass leads a running teammate and goes straight', () => {
  const v = passVelocity({ x: 0, z: 0 }, { x: 10, z: -10, vx: 0, vz: -5 }, 'perfect', () => 0.99);
  assert.ok(v.lead.z < -10);
  const dir = Math.atan2(v.vx, -v.vz), want = Math.atan2(v.lead.x, -v.lead.z);
  assert.ok(Math.abs(dir - want) < 1e-9);
  assert.equal(v.vy, 0);
});

test('a scuffed pass is slower and lofted', () => {
  const p = passVelocity({ x: 0, z: 0 }, { x: 0, z: -12 }, 'perfect', () => 0.5);
  const m = passVelocity({ x: 0, z: 0 }, { x: 0, z: -12 }, 'miss', () => 0.5);
  assert.ok(m.speed < p.speed); assert.ok(m.vy > 0);
});

test('lead point for a standing receiver is the receiver', () => {
  assert.deepEqual(leadPoint({ x: 0, z: 0 }, { x: 3, z: 4 }, 10), { x: 3, z: 4 });
});

test('pass target is the teammate closest to where you look', () => {
  const mates = [{ id: 'a', x: -10, z: -5 }, { id: 'b', x: 10, z: -5 }];
  assert.equal(pickTarget({ x: 0, z: 0 }, { x: 0.7, z: -0.7 }, mates).id, 'b');
  assert.equal(pickTarget({ x: 0, z: 0 }, { x: -1, z: 0 }, mates).id, 'a');
});

import { laneBlocked, lobVelocity, choosePass } from '../../rules/pass.js';
import { makeBall, stepBall } from '../../rules/ball.js';

test('a defender between passer and receiver blocks the lane; one off to the side does not', () => {
  const from = { x: 0, z: 0 }, to = { x: 0, z: -12 };
  assert.ok(laneBlocked(from, to, [{ x: 0.5, z: -6 }]));
  assert.ok(!laneBlocked(from, to, [{ x: 4, z: -6 }]));
  assert.ok(!laneBlocked(from, to, [{ x: 0, z: 2 }])); // behind the passer
});

test('a perfect lob lands on the receiver', () => {
  const v = lobVelocity({ x: 0, z: 0 }, { x: 0, z: -14 }, 'perfect', () => 0.5);
  const b = makeBall(0, 0); Object.assign(b, { vx: v.vx, vy: v.vy, vz: v.vz });
  let t = 0;
  while (t < v.T - 1e-6) { stepBall(b, 1 / 240, []); t += 1 / 240; }
  assert.ok(Math.abs(b.z + 14) < 0.3, `landed at ${b.z}`);
  assert.ok(b.y < 0.5);
});

test('a lob clears a defender standing in the lane', () => {
  const v = lobVelocity({ x: 0, z: 0 }, { x: 0, z: -14 }, 'perfect', () => 0.5);
  const b = makeBall(0, 0); Object.assign(b, { vx: v.vx, vy: v.vy, vz: v.vz });
  while (b.z > -7) stepBall(b, 1 / 240, []);
  assert.ok(b.y > 2, `only ${b.y.toFixed(2)} m up over the defender`);
});

test('choosePass goes along the ground when it can and over the top when it must', () => {
  const t = { x: 0, z: -12 };
  assert.ok(!choosePass({ x: 0, z: 0 }, t, [{ x: 5, z: -6 }], 'good', () => 0.5).lob);
  assert.ok(choosePass({ x: 0, z: 0 }, t, [{ x: 0.3, z: -6 }], 'good', () => 0.5).lob);
});
