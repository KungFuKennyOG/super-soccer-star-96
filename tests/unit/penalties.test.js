import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShootout, recordKick, decide, keeperSaves, takerKick, touches, stepShootout, tally, SPOT_Z, PENS, gloveSpot } from '../../rules/penalties.js';
import { createWorld } from '../../rules/sim.js';
import { GOAL } from '../../rules/tuning.js';

const DT = 1 / 72;

test('best of five ends early once it can\'t be caught', () => {
  const so = createShootout();
  // you score 3, they miss 3
  for (let i = 0; i < 3; i++) { recordKick(so, 'you', true); if (!so.done) recordKick(so, 'them', false); }
  assert.ok(so.done); assert.equal(so.winner, 'you');
  assert.equal(so.kicks.you.length, 3); assert.equal(so.kicks.them.length, 3);
});

test('level after five goes to sudden death, decided after a pair', () => {
  const so = createShootout();
  for (let i = 0; i < 5; i++) { recordKick(so, 'you', true); recordKick(so, 'them', true); }
  assert.ok(!so.done); assert.ok(so.sudden);
  recordKick(so, 'you', false);
  assert.ok(!so.done, 'they still have to take theirs');
  recordKick(so, 'them', true);
  assert.equal(so.winner, 'them');
  assert.deepEqual(tally(so).score, [5, 6]);
  assert.equal(tally(so).you.length, 6);
});

test('decide waits while it can still go either way', () => {
  const so = createShootout();
  recordKick(so, 'you', true); recordKick(so, 'them', false);
  assert.equal(decide(so), null);
});

test('their keeper: guess right and he reaches it, unless it\'s top corner or hit hard into the side', () => {
  const low = { x: 2.4, y: 0.4, onTarget: true }, top = { x: 3.1, y: 2.1, onTarget: true }, hardLow = { x: 3.3, y: 0.4, onTarget: true };
  assert.ok(keeperSaves(low, 1, 20));
  assert.ok(!keeperSaves(low, -1, 20), 'wrong way');
  assert.ok(!keeperSaves(top, 1, 20), 'top corner');
  assert.ok(!keeperSaves(hardLow, 1, 28), 'hard and wide');
  assert.ok(keeperSaves({ x: 0.2, y: 1.0, onTarget: true }, 0, 20), 'down the middle when he stays');
  assert.ok(!keeperSaves({ x: 0.1, y: 1.4, onTarget: true }, 1, 9), 'a Panenka when he dives');
  assert.ok(!keeperSaves({ x: 5, y: 1, onTarget: false }, 1, 20));
});

test('their takers mostly hit the target, weaker sides miss more', () => {
  let i = 0; const rnd = () => ((i++ * 0.6180339) % 1);
  const onTarget = s => { let n = 0; for (let k = 0; k < 400; k++) { const a = takerKick(rnd, s).aim; if (Math.abs(a.x) < GOAL.halfW && a.y < GOAL.h) n++; } return n / 400; };
  assert.ok(onTarget(5) > 0.85, onTarget(5)); assert.ok(onTarget(1) < onTarget(5));
});

test('a glove on the ball\'s path stops it', () => {
  assert.ok(touches({ x: 0, y: 1, z: -30 }, { x: 0, y: 1, z: -33 }, { x: 0.2, y: 1.1, z: -32 }, 0.38));
  assert.ok(!touches({ x: 0, y: 1, z: -30 }, { x: 0, y: 1, z: -33 }, { x: 1, y: 1, z: -32 }, 0.38));
  const g = gloveSpot({ x: 0, y: 1.3, z: -33.7 }, { x: 0.6, y: 1.5, z: -33.4 });
  assert.ok(Math.abs(g.x - 0.6 * PENS.gain.x) < 1e-9 && g.y > 1.5);
});

// plays a shootout step by step; you(so, w) returns your intent each frame
function play(so, w, you, secs = 60) {
  const ev = [];
  let i = 0; const rnd = () => ((i++ * 0.7548776) % 1);
  for (let t = 0; t < secs && so.phase !== 'over'; t += DT) ev.push(...stepShootout(so, w, you(so, w), DT, rnd));
  return ev;
}

test('a whole shootout plays out: your kicks from the spot, theirs at you in goal', () => {
  const w = createWorld(() => 0.5), so = createShootout({ oppStars: 3 });
  let held = 0;
  const ev = play(so, w, (s, wd) => {
    if (s.turn === 'you' && s.phase === 'ready') {
      assert.ok(Math.abs(wd.ball.z - SPOT_Z) < 1e-6);
      if (++held > 40) { held = 0; const eye = { x: wd.you.x, y: 1.7, z: wd.you.z }, aim = { x: 2.9, y: 0.5, z: GOAL.z }, l = Math.hypot(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z); return { shot: { eye, dir: { x: (aim.x - eye.x) / l, y: (aim.y - eye.y) / l, z: (aim.z - eye.z) / l }, holdT: 0.8 } }; }
    }
    return {};
  });
  const over = ev.find(e => e.type === 'shootoutOver');
  assert.ok(over, 'it finished');
  const res = ev.filter(e => e.type === 'penResult');
  assert.ok(res.length >= 6, `${res.length} kicks`);
  assert.ok(res.filter(e => e.by === 'you').some(e => e.scored), 'you scored some');
  assert.ok(res.filter(e => e.by === 'them').some(e => e.scored), 'they scored some (no gloves up)');
  assert.equal(over.won, so.winner === 'you');
});

test('a glove where their kick goes saves it', () => {
  const w = createWorld(() => 0.5), so = createShootout({ first: 'them' });
  const ev = play(so, w, (s, wd) => ({ gloves: s.turn === 'them' && s.phase === 'flight' ? [{ x: wd.ball.x, y: wd.ball.y, z: GOAL.z + 0.4 }] : [] }), 8);
  const r = ev.find(e => e.type === 'penResult');
  assert.equal(r.by, 'them');
  assert.ok(r.how === 'saved' || r.how === 'miss' || r.how === 'post', r.how);
  assert.ok(!r.scored);
});
