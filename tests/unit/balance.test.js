// Balance guard: scripted attackers (bot.js) play attacks at every cup level on every difficulty. Nothing
// here pins exact numbers (Kenny tunes feel in the headset); it catches a change that makes goals
// impossible or free, or a difficulty that isn't harder than the one below it.
//   pass     plays one-twos and winds up a shot when he's through
//   dribble  just sprints round whoever comes and shoots: the least a defence should be able to stop
//   skill    the dribbler, beating anyone who gets tight with a skill move
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playAttacks } from './bot.js';
import { BRAIN, DIFFICULTY } from '../../rules/tuning.js';

const STYLES = ['pass', 'dribble', 'skill'];
// goals per attack, [difficulty][style][level], against a 4-star side
const rates = DIFFICULTY.map((_, hard) => Object.fromEntries(STYLES.map(style => [style, BRAIN.map((__, level) => {
  let g = 0, n = 0;
  for (const seed of [1, 2]) { const r = playAttacks({ level, stars: 4, hard, style, seed, attacks: 40 }); g += r.goals; n += r.attacks; }
  return g / n;
})])));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const table = hard => STYLES.map(s => `${s} ${rates[hard][s].map(r => r.toFixed(2)).join(' ')}`).join(' | ');

test('every level of every difficulty is beatable', () => {
  // one way of playing or another gets goals, right up to the LEGEND final: never a wall
  for (const [hard, d] of DIFFICULTY.entries()) for (const level of BRAIN.keys()) {
    const best = Math.max(...STYLES.map(s => rates[hard][s][level]));
    assert.ok(best > 0.15, `${d.name} level ${level}: best ${best.toFixed(2)} goals per attack (${table(hard)})`);
  }
});

test('later cup rounds are harder, a little harder: you are meant to feel like a superstar', () => {
  for (const [hard, d] of DIFFICULTY.entries()) {
    const at = level => mean(STYLES.map(s => rates[hard][s][level])), last = BRAIN.length - 1;
    assert.ok(at(0) > at(last) && at(last) > at(0) * 0.5, `${d.name}: level 0 ${at(0).toFixed(2)} vs final ${at(last).toFixed(2)} (${table(hard)})`);
  }
});

test('HARD and LEGEND are each harder than the level below, and stop you just running through', () => {
  const overall = hard => mean(STYLES.map(s => mean(rates[hard][s])));
  assert.ok(overall(1) < overall(0) - 0.15 && overall(2) < overall(1) - 0.04, `overall ${[0, 1, 2].map(h => overall(h).toFixed(2)).join(' > ')}`);
  // NORMAL can simply be run round; on HARD that works less than half as often, on LEGEND it's rare
  const run = hard => mean(rates[hard].dribble);
  assert.ok(run(0) > 0.6, `NORMAL dribbler ${run(0).toFixed(2)}`);
  assert.ok(run(1) < run(0) * 0.6 && run(1) > 0.1, `HARD dribbler ${run(1).toFixed(2)}`);
  assert.ok(run(2) < run(1) * 0.75, `LEGEND dribbler ${run(2).toFixed(2)}`);
  // skill moves are worth it once running alone stops working
  for (const hard of [1, 2]) assert.ok(mean(rates[hard].skill) > run(hard), `${DIFFICULTY[hard].name}: skills ${mean(rates[hard].skill).toFixed(2)} vs running ${run(hard).toFixed(2)}`);
});
