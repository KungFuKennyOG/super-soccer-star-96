// Balance guard: a scripted attacker (bot.js) plays attacks at every level. Nothing here pins exact
// numbers (Kenny tunes feel in the headset); it catches a change that makes goals impossible or free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playAttacks } from './bot.js';
import { BRAIN } from '../../rules/tuning.js';

test('every level is beatable and none is a walkover', () => {
  const rates = BRAIN.map((_, level) => {
    let g = 0, n = 0;
    for (const seed of [1, 2, 3]) { const r = playAttacks({ level, stars: 4, seed, attacks: 40 }); g += r.goals; n += r.attacks; }
    return g / n;
  });
  for (const [level, r] of rates.entries()) assert.ok(r > 0.25 && r < 0.85, `level ${level}: ${r.toFixed(2)} goals per attack`);
  // and the later rounds are harder,
  // a little harder, never a wall: you're meant to feel like a superstar
  assert.ok(rates[0] > rates[rates.length - 1] + 0.04 && rates[rates.length - 1] > rates[0] * 0.6, `level 0 ${rates[0].toFixed(2)} vs final ${rates[rates.length - 1].toFixed(2)}`);
});
