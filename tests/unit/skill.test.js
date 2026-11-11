import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tuneFor, SPREAD } from '../../rules/skill.js';
import { AI, MOVE, DIFFICULTY, BRAIN } from '../../rules/tuning.js';
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
  const cross = { x: 3.1, y: 1.2, t: 0.6, onTarget: true };
  assert.equal(keeperSave({ x: 0 }, cross, 26, tuneFor(3, 1).ai), 'beaten');
  assert.notEqual(keeperSave({ x: 0 }, cross, 26, tuneFor(3, 5).ai), 'beaten');
});

test('stars you can see: a 5-star keeper holds harder shots, 5-star teammates are quicker and pass better', () => {
  const big = tuneFor(5, 5), small = tuneFor(1, 1);
  assert.ok(big.ai.gkCatchBelow > small.ai.gkCatchBelow + 6, 'a great keeper holds what a poor one spills');
  assert.ok(big.ai.mateRun / small.ai.mateRun > 1.4);
  assert.ok(big.matePerfect - small.matePerfect >= 0.5);
  // the pressing that compounded too hard stays inside the spread
  assert.ok(Math.abs(big.ai.press / AI.press - 1 - SPREAD) < 1e-9);
});

test('difficulty: NORMAL is the defence as it was, HARD and LEGEND add to it step by step', () => {
  const [n, h, l] = [0, 1, 2].map(d => tuneFor(3, 4, 2, d));
  assert.deepEqual(DIFFICULTY.map(d => d.name), ['NORMAL', 'HARD', 'LEGEND']);
  assert.deepEqual(tuneFor(3, 4, 2), n, 'NORMAL is the default');
  // NORMAL switches every new behaviour off and leaves the numbers alone
  assert.equal(n.ai.pressRead, 0); assert.equal(n.ai.coverIn, 0); assert.equal(n.ai.closeShot, 0); assert.equal(n.ai.recover, 1);
  assert.equal(n.ai.block, AI.block); assert.deepEqual(n.brain, BRAIN[2]); assert.equal(n.skillBite, 0);
  assert.equal(n.ai.tackleTime, AI.tackleTime * (1 - 0.1 * 0.5)); assert.equal(n.ai.gkDive, AI.gkDive * (1 + 0.1 * 0.5));
  for (const [a, b] of [[n, h], [h, l]]) {
    assert.ok(b.ai.pressRead > a.ai.pressRead && b.ai.coverIn > a.ai.coverIn && b.ai.closeShot > a.ai.closeShot && b.ai.recover > a.ai.recover);
    assert.ok(b.ai.tackleTime < a.ai.tackleTime && b.ai.tackleRange > a.ai.tackleRange && b.ai.block > a.ai.block);
    assert.ok(b.ai.gkReact < a.ai.gkReact && b.ai.gkReach > a.ai.gkReach && b.ai.gkDive > a.ai.gkDive && b.brain.gkOut >= a.brain.gkOut);
  }
  assert.ok(l.brain.dragBite < h.brain.dragBite && l.skillBite > 0, 'LEGEND reads a repeated trick sooner');
  assert.ok(tuneFor(3, 3, 3, 2).brain.gkOut <= 1 && tuneFor(3, 3, 3, 2).brain.dragBite >= 1);
  assert.deepEqual(tuneFor(3, 3, 0, 9), tuneFor(3, 3, 0, 2), 'out of range clamps'); assert.equal(tuneFor(3, 3, 0, -1).hard, 0);
});
