import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickLine, LINE_IDS } from '../../rules/commentary.js';

const lines = JSON.parse(fs.readFileSync(new URL('../../game/assets/voice/lines.json', import.meta.url))).lines.map(l => l[0]);
const seeded = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;

test('every line the commentator can pick is recorded', () => {
  for (const id of LINE_IDS) {
    assert.ok(lines.includes(id), `${id} is missing from lines.json`);
    assert.ok(fs.existsSync(new URL(`../../game/assets/voice/${id}.mp3`, import.meta.url)), `${id}.mp3 is missing`);
  }
});

test('goals get the line for how they were scored, hat tricks above all', () => {
  assert.match(pickLine({ type: 'goal', kind: 'bicycle', x: 0, y: 1, dist: 10 }, {}, seeded()).id, /^bicycle/);
  assert.match(pickLine({ type: 'goal', kind: 'header', x: 0, y: 1, dist: 10 }, {}, seeded()).id, /^header/);
  assert.match(pickLine({ type: 'goal', kind: 'header', x: 0, y: 1, dist: 10 }, { hatTrick: true }, seeded()).id, /^hattrick/);
  assert.match(pickLine({ type: 'goal', x: 3, y: 2, dist: 10 }, {}, seeded()).id, /^topbins/);
  assert.ok(pickLine({ type: 'goal', x: 0, y: 1, dist: 10 }, {}, seeded()).priority > pickLine({ type: 'saved' }, {}, seeded()).priority);
});

test('it avoids repeating itself when it can', () => {
  const r = seeded(3), recent = [];
  for (let i = 0; i < 4; i++) { const l = pickLine({ type: 'saved' }, {}, r, recent); assert.ok(!recent.slice(-2).includes(l.id) || i > 2); recent.push(l.id); }
});

test('quiet moments stay quiet', () => {
  assert.equal(pickLine({ type: 'received', id: 'you' }), null);
  assert.equal(pickLine({ type: 'pass', by: 'm1', grade: 'good' }), null);
});

test('the smarter opposition gets its own lines: chips, keeper claims and read drag-backs', () => {
  assert.match(pickLine({ type: 'goal', kind: 'chip', x: 1, y: 1, dist: 11 }, {}, seeded()).id, /^chip/);
  assert.match(pickLine({ type: 'saved', claim: true }, {}, seeded()).id, /^claim/);
  assert.match(pickLine({ type: 'drag', read: true }, {}, () => 0.1).id, /^dragread/);
});
