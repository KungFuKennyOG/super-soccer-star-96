import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGestures } from '../../rules/gestures.js';

const DT = 1 / 72;
const REST = { x: 0.22, y: -0.55, z: 0.15 };     // right hand down by your side

// plays a motion path(t) for secs; returns the gestures that fired
function play(path, secs, armed = true, hand = 'right') {
  const g = createGestures(hand), out = [];
  for (let t = 0; t < 0.3; t += DT) g.update(REST, t, DT, armed);      // settle
  for (let t = 0; t <= secs; t += DT) { const r = g.update(path(t), 0.3 + t, DT, armed); if (r) out.push(r); }
  return out;
}
const flick = (dx, dy, dz, dur = 0.12) => t => {
  const k = Math.min(1, t / dur);
  return { x: REST.x + dx * k, y: REST.y + dy * k, z: REST.z + dz * k };
};

test('a sharp sideways flick is a step-over that way', () => {
  assert.deepEqual(play(flick(0.3, 0, 0), 0.3), [{ move: 'stepover', side: 1 }]);
  assert.deepEqual(play(flick(-0.3, 0.02, 0), 0.3), [{ move: 'stepover', side: -1 }]);
});

test('a sharp upward flick is a rainbow, a jab forward and down a nutmeg', () => {
  assert.deepEqual(play(flick(0, 0.32, 0.03), 0.3).map(g => g.move), ['rainbow']);
  assert.deepEqual(play(flick(0.02, -0.15, 0.25), 0.3).map(g => g.move), ['nutmeg']);
});

const LREST = { x: -REST.x, y: REST.y, z: REST.z };
test('the roulette lives on the left hand: a quick circle or any sharp flick', () => {
  const circle = t => ({ x: LREST.x + 0.12 * Math.cos(t * 14), y: LREST.y + 0.12 * Math.sin(t * 14), z: LREST.z });
  assert.deepEqual(play(circle, 0.5, true, 'left').map(g => g.move), ['roulette']);
  const swipe = t => ({ x: LREST.x - 0.3 * Math.min(1, t / 0.12), y: LREST.y, z: LREST.z });
  assert.deepEqual(play(swipe, 0.3, true, 'left'), [{ move: 'roulette', side: -1 }]);
  const up = t => ({ x: LREST.x, y: LREST.y + 0.32 * Math.min(1, t / 0.12), z: LREST.z });
  assert.deepEqual(play(up, 0.3, true, 'left').map(g => g.move), ['roulette'], 'never a rainbow on the left');
});

test('a circle with the right hand is never mistaken for a rainbow flick', () => {
  // the same quick circle that used to fire a rainbow on its upward part
  const circle = t => ({ x: REST.x + 0.12 * Math.cos(t * 14), y: REST.y + 0.12 * Math.sin(t * 14), z: REST.z });
  assert.ok(!play(circle, 0.5).some(g => g.move === 'rainbow' || g.move === 'roulette'));
});

test('ordinary movement does nothing: raising your hand to call, slow drifting, arms swinging as you play', () => {
  // raising a hand above your head to call for the ball, at a normal pace
  assert.deepEqual(play(t => ({ x: REST.x, y: REST.y + Math.min(1, t / 0.6) * 0.9, z: REST.z + 0.1 * Math.min(1, t / 0.6) }), 1), []);
  // hands drifting about
  assert.deepEqual(play(t => ({ x: REST.x + 0.05 * Math.sin(t * 2), y: REST.y + 0.04 * Math.sin(t * 3), z: REST.z }), 2), []);
  // an arm swinging back and forth as you lean into a run, rising as it comes forward
  assert.deepEqual(play(t => ({ x: REST.x, y: REST.y + 0.08 * Math.max(0, Math.sin(t * 9)), z: REST.z + 0.12 * Math.sin(t * 9) }), 2), []);
});

test('nothing fires unless armed (you on the ball with a defender near)', () => {
  assert.deepEqual(play(flick(0.3, 0, 0), 0.3, false), []);
});

test('one flailing motion fires one skill, not two', () => {
  const twice = t => (t < 0.15 ? flick(0.3, 0, 0)(t) : flick(-0.3, 0, 0)(t - 0.15));
  assert.equal(play(t => ({ ...twice(t), x: twice(t).x }), 0.35).length, 1);
});
