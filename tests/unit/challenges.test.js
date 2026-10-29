import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, LOCKER, createStats, noteEvents, createProgress, checkChallenges, unlocked, unlockedBy, doneCount } from '../../rules/challenges.js';

const goal = (o = {}) => ({ type: 'goal', by: 'you', x: 0, y: 1, kind: null, skills: 0, chain: 0, ...o });

test('every challenge has a short name and description that fit the screen, and unique ids', () => {
  assert.equal(new Set(CHALLENGES.map(c => c.id)).size, CHALLENGES.length);
  for (const c of CHALLENGES) { assert.ok(c.name.length <= 18, c.name); assert.ok(c.desc.length <= 31, c.desc); }
});

test('every locker option past the first is unlocked by exactly one challenge', () => {
  for (const [slot, l] of Object.entries(LOCKER)) for (let i = 1; i < l.options.length; i++) assert.ok(unlockedBy(slot, i), `${slot} ${l.options[i]}`);
});

test('goals of each kind complete their challenges once, with the unlock named', () => {
  const p = createProgress(), s = createStats();
  noteEvents(s, [goal({ kind: 'header' })]);
  const fresh = checkChallenges(p, s);
  assert.deepEqual(fresh.map(c => c.id).sort(), ['goal', 'header']);
  assert.equal(fresh.find(c => c.id === 'header').unlock, 'BIG HEADS');
  assert.equal(checkChallenges(p, s).length, 0, 'not twice');
  assert.deepEqual(unlocked(p, 'heads'), [0, 1]);
  assert.deepEqual(unlocked(p, 'ball'), [0]);
});

test('match feats: nutmegs, top bins, joga bonita, pass chains, hat trick', () => {
  const p = createProgress(), s = createStats();
  const meg = { type: 'skill', move: 'nutmeg', ok: true };
  noteEvents(s, [meg, meg, { ...meg, ok: false }]);
  assert.ok(!checkChallenges(p, s).some(c => c.id === 'megs'));
  noteEvents(s, [meg]);
  noteEvents(s, [goal({ x: 3.2, y: 2.1, skills: 3 }), goal({ x: -3.2, y: 2, chain: 4 }), goal({ x: 3, y: 2.2 })]);
  const ids = checkChallenges(p, s).map(c => c.id);
  for (const id of ['megs', 'sniper', 'joga', 'tiki', 'hat']) assert.ok(ids.includes(id), id);
  assert.deepEqual(unlocked(p, 'ball'), [0, 1, 2]);
});

test('end-of-match flags: cups, giant killing, score attack, training', () => {
  const p = createProgress(), s = createStats('world', 2);
  s.cupWon = 'world';
  const ids = checkChallenges(p, s).map(c => c.id);
  assert.ok(ids.includes('world') && ids.includes('giant'));
  const t = createStats('attack', 4); t.points = 15000; t.training = true;
  assert.deepEqual(checkChallenges(p, t).map(c => c.id).sort(), ['graduate', 'score']);
  assert.equal(doneCount(p), 4);
});

test('shootouts and keeper rush', () => {
  const p = createProgress(), s = createStats('pens');
  const kick = scored => ({ type: 'penResult', by: 'you', scored });
  noteEvents(s, [kick(true), kick(true), kick(true), kick(true), kick(false), kick(true)]);
  assert.ok(!checkChallenges(p, s).some(c => c.id === 'icecold'), 'only the first five count');
  const s2 = createStats('pens');
  noteEvents(s2, [1, 2, 3, 4, 5].map(() => kick(true)));
  noteEvents(s2, [{ type: 'penResult', by: 'them', how: 'saved' }, { type: 'penResult', by: 'them', how: 'saved' }]);
  assert.deepEqual(checkChallenges(p, s2).map(c => c.id).sort(), ['icecold', 'safe']);
  const r = createStats('keeper');
  noteEvents(r, Array.from({ length: 10 }, () => ({ type: 'rushResult', how: 'saved' })));
  assert.deepEqual(checkChallenges(p, r).map(c => c.id), ['wall']);
  assert.deepEqual(unlocked(p, 'gloves'), [0, 1, 2]);
});
