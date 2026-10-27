import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBall, stepBall, predictCross } from '../../rules/ball.js';
import { GOAL, BALL } from '../../rules/tuning.js';

const run = (b, secs) => { const ev = []; for (let t = 0; t < secs; t += 1 / 120) stepBall(b, 1 / 120, ev); return ev; };

test('a rolling ball slows to a stop', () => {
  const b = makeBall(0, -5); b.vz = -6;
  run(b, 6);
  assert.equal(Math.abs(b.vx), 0); assert.equal(Math.abs(b.vz), 0); assert.equal(b.y, BALL.r);
});

test('a ball through the mouth is a goal and stays in the net', () => {
  const b = makeBall(0, -30); b.vz = -20; b.vy = 2;
  const ev = run(b, 2);
  assert.equal(ev.filter(e => e.type === 'goal').length, 1);
  assert.ok(b.z < GOAL.z && b.z >= GOAL.z - GOAL.depth);
});

test('hitting the post bounces back into play', () => {
  const b = makeBall(GOAL.halfW, -30); b.vz = -20; b.vy = 3;
  const ev = run(b, 0.4);
  assert.equal(ev[0].type, 'post');
  assert.ok(b.vz > 0);
});

test('wide of the post is out on the byline', () => {
  const b = makeBall(6, -30); b.vz = -20;
  const ev = run(b, 1);
  assert.equal(ev[0].type, 'out'); assert.equal(ev[0].where, 'byline');
});

test('predictCross finds where and when a shot crosses the line', () => {
  const b = makeBall(1, -20); b.vz = -20; b.vy = 4;
  const c = predictCross(b);
  assert.ok(c.onTarget);
  assert.ok(Math.abs(c.x - 1) < 0.01);
  assert.ok(Math.abs(c.t - 0.7) < 0.03);
});
