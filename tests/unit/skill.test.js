import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tuneFor, SPREAD } from '../../rules/skill.js';
import { AI, MOVE } from '../../rules/tuning.js';
import { keeperSave } from '../../rules/ai.js';

test('three stars each is the base tuning', () => {
  const t = tuneFor(3, 3);
  assert.equal(t.ai.press, AI.press); assert.equal(t.ai.gkReact, AI.gkReact); assert.equal(t.move.run, MOVE.run);
  assert.equal(Math.abs(t.shotErr), 0); assert.equal(t.shotPower, 1);
});

test('a 5-star opponent presses harder, tackles quicker and has a better keeper', () => {
  const hard = tuneFor(3, 5), easy = tuneFor(3, 1);
  assert.ok(hard.ai.press > easy.ai.press);
  assert.ok(hard.ai.tackleTime < easy.ai.tackleTime);
  assert.ok(hard.ai.gkReact < easy.ai.gkReact && hard.ai.gkDive > easy.ai.gkDive);
  assert.ok(Math.abs(hard.ai.press / AI.press - 1 - SPREAD) < 1e-9, 'no more than the spread');
});

test('your stars make your teammates quicker and your shots crisper', () => {
  const big = tuneFor(5, 3), small = tuneFor(1, 3);
  assert.ok(big.ai.mateRun > small.ai.mateRun);
  assert.ok(big.matePerfect > small.matePerfect);
  assert.ok(big.shotErr < small.shotErr && big.shotPower > small.shotPower);
  assert.ok(big.move.sprint > small.move.sprint);
});

test('the same shot beats a weak keeper and gets saved by a great one', () => {
  const cross = { x: 2.8, y: 1.2, t: 0.6, onTarget: true };
  assert.equal(keeperSave({ x: 0 }, cross, 26, tuneFor(3, 1).ai), 'beaten');
  assert.notEqual(keeperSave({ x: 0 }, cross, 26, tuneFor(3, 5).ai), 'beaten');
});
