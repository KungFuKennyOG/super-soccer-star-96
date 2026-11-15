import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strideRate, sinceTouch, dribbleLead, touched } from '../../rules/dribble.js';
import { DRIBBLE } from '../../rules/tuning.js';

const TAU = Math.PI * 2;

test('the run cycle turns over faster the faster you run', () => {
  assert.equal(strideRate(0), DRIBBLE.rate[0]);
  assert.ok(strideRate(7.6) > strideRate(5.8));
});

test('the ball is at the boot on the touch, furthest ahead halfway to the next one', () => {
  const at = u => dribbleLead(DRIBBLE.touchAt + u * TAU, 7);
  assert.ok(Math.abs(at(0) - DRIBBLE.near) < 1e-9);
  assert.ok(Math.abs(at(0.5) - (DRIBBLE.near + DRIBBLE.push)) < 1e-9);
  assert.ok(at(0.25) > at(0.05) && at(0.75) > at(0.95));
  assert.ok(Math.abs(at(0.999) - DRIBBLE.near) < 0.01, 'back at the boot for the next touch');
  for (let u = 0; u < 1; u += 0.05) assert.ok(at(u) >= DRIBBLE.near && at(u) <= DRIBBLE.near + DRIBBLE.push + 1e-9);
});

test('the push shrinks at low speed and the ball rests at your feet when you stand', () => {
  const mid = DRIBBLE.touchAt + Math.PI;
  assert.equal(dribbleLead(mid, 0), DRIBBLE.near);
  assert.ok(dribbleLead(mid, 2) < dribbleLead(mid, 7));
  assert.equal(dribbleLead(mid, 7), dribbleLead(mid, 20));
});

test('one touch per cycle, whatever the phase has grown to', () => {
  assert.ok(touched(DRIBBLE.touchAt - 0.1, DRIBBLE.touchAt + 0.1));
  assert.ok(!touched(DRIBBLE.touchAt + 0.1, DRIBBLE.touchAt + 0.3));
  assert.ok(touched(DRIBBLE.touchAt + 40 * TAU - 0.05, DRIBBLE.touchAt + 40 * TAU + 0.05));
  let n = 0;
  for (let p = 0; p < 10 * TAU; p += 0.13) if (touched(p, p + 0.13)) n++;
  assert.equal(n, 10);
  assert.ok(Math.abs(sinceTouch(DRIBBLE.touchAt + 3 * TAU + Math.PI) - 0.5) < 1e-9);
  assert.ok(sinceTouch(0) >= 0 && sinceTouch(0) < 1);
});
