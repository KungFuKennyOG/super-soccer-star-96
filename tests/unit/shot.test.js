import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimPoint, assist, shotVelocity, chargeOf, overcharge } from '../../rules/shot.js';
import { makeBall, predictCross } from '../../rules/ball.js';
import { GOAL } from '../../rules/tuning.js';

const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };

test('aim point is where the gaze meets the goal plane', () => {
  const p = aimPoint({ x: 0, y: 1.6, z: -16 }, unit(3, 0.4, -18));
  assert.ok(Math.abs(p.x - 3) < 1e-9 && Math.abs(p.y - 2) < 1e-9 && p.z === GOAL.z);
  assert.equal(aimPoint({ x: 0, y: 1.6, z: -16 }, unit(1, 0, 0.2)), null);
});

test('assist pulls a near miss inside the frame', () => {
  const p = assist({ x: 4.2, y: 2.9, z: GOAL.z });
  assert.ok(p.x < GOAL.halfW && p.y < GOAL.h);
  const far = assist({ x: 12, y: 1, z: GOAL.z });
  assert.equal(far.x, 12);
});

test('charge fills in chargeTime and only overcharges past overTime', () => {
  assert.equal(chargeOf(0), 0); assert.equal(chargeOf(5), 1);
  assert.equal(overcharge(1), 0); assert.ok(overcharge(1.6) > 0);
});

test('a clean full-power shot goes where you looked', () => {
  const ball = makeBall(0, -16);
  const eye = { x: 0, y: 1.6, z: -15.4 };
  const v = shotVelocity(ball, eye, unit(3.0, 0.4, -18.6), 0.95, () => 0.5);
  Object.assign(ball, { vx: v.vx, vy: v.vy, vz: v.vz });
  const c = predictCross(ball);
  assert.ok(c.onTarget);
  assert.ok(Math.abs(c.x - v.aim.x) < 0.05 && Math.abs(c.y - v.aim.y) < 0.05, JSON.stringify({ c, aim: v.aim }));
});

test('overcharging skies it', () => {
  const ball = makeBall(0, -16), eye = { x: 0, y: 1.6, z: -15.4 }, dir = unit(0, 0, -1);
  const v = shotVelocity(ball, eye, dir, 1.8, () => 0.5);
  assert.ok(v.aim.y > GOAL.h);
});
