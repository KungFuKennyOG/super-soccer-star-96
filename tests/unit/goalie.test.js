import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRush, stepRush, planShot, RUSH } from '../../rules/goalie.js';
import { createWorld } from '../../rules/sim.js';
import { makeBall, predictCross } from '../../rules/ball.js';
import { ballistic } from '../../rules/shot.js';
import { GOAL } from '../../rules/tuning.js';

const DT = 1 / 72;
const seq = (s = 1) => { let i = s; return () => { i++; const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }; };

function play(r, w, intent, secs, rnd = seq()) {
  const ev = [];
  for (let t = 0; t < secs && r.phase !== 'over'; t += DT) ev.push(...stepRush(r, w, intent(r, w), DT, rnd));
  return ev;
}

test('stand still and they score: three goals and the rush is over', () => {
  const w = createWorld(() => 0.5), r = createRush();
  const ev = play(r, w, () => ({}), 200);
  const over = ev.find(e => e.type === 'rushOver');
  assert.ok(over, 'it ended');
  assert.equal(ev.filter(e => e.type === 'rushResult' && e.how === 'goal').length, RUSH.lives);
});

test('gloves on the ball save everything, and the shots get harder and more varied', () => {
  const w = createWorld(() => 0.5), r = createRush();
  const ev = play(r, w, (rr, wd) => ({ gloves: rr.phase === 'flight' && wd.ball.z < GOAL.z + 3 ? [{ x: wd.ball.x, y: wd.ball.y, z: GOAL.z + 1 }] : [] }), 120);
  const res = ev.filter(e => e.type === 'rushResult');
  assert.ok(res.every(e => e.how !== 'goal'), JSON.stringify(res.filter(e => e.how === 'goal')));
  assert.ok(r.saves >= 15, `${r.saves} saves`);
  assert.ok(r.points > r.saves * 100);
  assert.ok(new Set(ev.filter(e => e.type === 'rushSetup').map(e => e.kind)).size >= 4);
});

test('later shots are quicker', () => {
  const avg = saves => { const rnd = seq(saves); let s = 0; for (let i = 0; i < 200; i++) s += planShot(saves, rnd).speed; return s / 200; };
  assert.ok(avg(15) > avg(0) + 4);
});

test('a curler still ends up near where it was aimed', () => {
  const rnd = seq(3);
  let n = 0;
  for (let i = 0; n < 20 && i < 500; i++) {
    const p = planShot(20, rnd);
    if (p.kind !== 'curl' || Math.abs(p.aim.x) > GOAL.halfW) continue;
    n++;
    const b = makeBall(p.from.x, p.from.z), v = ballistic(b, p.aim, p.speed);
    Object.assign(b, { vx: v.vx - p.curl * v.T * RUSH.curlLead, vy: v.vy, vz: v.vz, curl: p.curl });
    const c = predictCross(b, 4);
    assert.ok(c && Math.abs(c.x - p.aim.x) < 1.2, `aim ${p.aim.x.toFixed(2)} crossed ${c && c.x.toFixed(2)}`);
  }
  assert.ok(n >= 10, `${n} curlers`);
});

test('you stay in your box', () => {
  const w = createWorld(() => 0.5), r = createRush();
  play(r, w, () => ({ move: { x: 1, z: 1 } }), 5);
  assert.ok(w.you.x <= RUSH.box.x + 1e-9 && w.you.z <= GOAL.z + RUSH.box.z + 1e-9);
});
