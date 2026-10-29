import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER, pickWeather, applyWeather } from '../../rules/weather.js';
import { makeBall, stepBall } from '../../rules/ball.js';
import { createWorld, resetPlay } from '../../rules/sim.js';

// how far a ball rolled along the ground at 8 m/s travels before it stops
function rollDist(kind) {
  const b = makeBall(0, -5); b.surface = WEATHER[kind].surface; b.vz = -8;
  for (let t = 0; t < 10; t += 1 / 120) stepBall(b, 1 / 120, []);
  return -5 - b.z;
}

test('a wet ball runs on further, a snowy one dies early', () => {
  const clear = rollDist('clear'), rain = rollDist('rain'), snow = rollDist('snow');
  assert.ok(rain > clear * 1.2, `rain ${rain} v clear ${clear}`);
  assert.ok(snow < clear * 0.8, `snow ${snow} v clear ${clear}`);
});

test('snow kills the bounce', () => {
  const peak = kind => {
    const b = makeBall(0, -5); b.surface = WEATHER[kind].surface; b.y = 3; b.vz = -2;
    let landed = false, top = 0;
    for (let t = 0; t < 3; t += 1 / 120) { stepBall(b, 1 / 120, []); if (b.y < 0.2) landed = true; if (landed) top = Math.max(top, b.y); }
    return top;
  };
  assert.ok(peak('snow') < peak('clear') * 0.7);
});

test('the setting picks the weather; RANDOM is mostly clear', () => {
  assert.equal(pickWeather(1), 'clear'); assert.equal(pickWeather(2), 'rain'); assert.equal(pickWeather(3), 'snow');
  let i = 0; const seq = () => (i++ % 100) / 100;
  const n = { clear: 0, rain: 0, snow: 0 };
  for (let k = 0; k < 100; k++) n[pickWeather(0, seq)]++;
  assert.ok(n.clear > 55 && n.rain > 15 && n.snow > 5, JSON.stringify(n));
});

test('the weather stays on the ball through a restart', () => {
  const w = createWorld(() => 0.5);
  applyWeather(w, 'snow');
  resetPlay(w, () => 0.5);
  assert.equal(w.ball.surface, WEATHER.snow.surface);
  assert.equal(w.weather, 'snow');
});
