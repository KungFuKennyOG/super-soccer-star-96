import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepSim } from '../../rules/sim.js';
import { createMatch, scoreEvent } from '../../rules/match.js';
import { SKILL, presserOf } from '../../rules/skills.js';
import { dist } from '../../rules/vec.js';

const fixed = () => 0.5;
const DT = 1 / 72;
const idle = (o = {}) => ({ move: { x: 0, z: 0 }, facing: { x: 0, z: -1 }, ...o });
function run(w, secs, intent = idle()) {
  const all = [];
  for (let t = 0; t < secs; t += DT) all.push(...stepSim(w, typeof intent === 'function' ? intent(t) : intent, DT, fixed));
  return all;
}
// you on the ball with one defender (d2) pressing from straight ahead, the others far away
function oneOnOne(gap = 2) {
  const w = createWorld(fixed);
  for (const id of ['d1', 'd3']) { const p = w.byId[id]; p.x = 20; p.z = -1; p.stun = 99; }
  w.drill = { frozen: new Set(['d1', 'd3']), mateHold: false, crossHead: false };
  w.you.x = 0; w.you.z = -14; w.ball.x = 0; w.ball.z = -14.62;
  const d = w.byId.d2; d.x = 0; d.z = -14 - gap; d.fx = 0; d.fz = 1; d.vx = d.vz = 0;
  return w;
}
const skill = (w, move, side = 1) => stepSim(w, idle({ skill: { move, side } }), DT, fixed).find(e => e.type === 'skill');

test('step-over: he bites the way you fake, you go the other way and he can\'t tackle for a moment', () => {
  const w = oneOnOne();
  const e = skill(w, 'stepover', 1);                         // fake right
  assert.ok(e.ok && !e.read);
  assert.ok(w.byId.d2.stun > 0.4 && w.dragGrace > 0.4);
  stepSim(w, idle({ move: { x: 0, z: -1 } }), DT, fixed);   // the burst overrides your stick for a moment
  assert.ok(w.you.vx < -2, 'you cut left');
  assert.equal(w.owner, 'you');
});

test('the same move over and over gets read; mixing them up keeps fooling him', () => {
  const w = oneOnOne();
  const seq = ['stepover', 'stepover', 'stepover'].map(m => { w.byId.d2.stun = 0; w.time += 0.5; return skill(w, m); });
  assert.deepEqual(seq.map(e => e.read), [false, false, true]);
  const w2 = oneOnOne();
  const mixed = ['stepover', 'roulette', 'stepover', 'roulette'].map(m => { w2.byId.d2.stun = 0; w2.time += 0.5; return skill(w2, m); });
  assert.ok(mixed.every(e => e.ok && !e.read));
  assert.equal(SKILL.bite, 2);
});

test('nutmeg: through the legs of a man square in front, he turns, you collect it beyond him', () => {
  const w = oneOnOne(1.8);
  const e = skill(w, 'nutmeg');
  assert.ok(e.ok);
  assert.ok(w.byId.d2.stun >= 1);
  const ev = run(w, 1.8, t => idle({ move: t < 0.4 ? { x: 0.6, z: -0.8 } : { x: -w.you.x * 0.3, z: -1 } }));   // round him, then onto it
  assert.ok(ev.some(x => x.type === 'received' && x.id === 'you'), ev.map(x => x.type).join(','));
  assert.ok(w.you.z < w.byId.d2.z, 'you are past him');
});

test('nutmeg with nobody square on is just a poke forward', () => {
  const w = oneOnOne(3.6);
  w.byId.d2.x = 3;                                            // off to the side
  const e = skill(w, 'nutmeg');
  assert.equal(e.ok, false);
  assert.equal(w.byId.d2.stun, 0);
});

test('rainbow flick: over his head, and you run onto it', () => {
  const w = oneOnOne(2.2);
  const e = skill(w, 'rainbow');
  assert.ok(e.ok);
  let overHead = false;
  const ev = [];
  for (let t = 0; t < 2.2; t += DT) {
    ev.push(...stepSim(w, idle({ move: { x: 0, z: -1 } }), DT, fixed));
    if (Math.abs(w.ball.z - w.byId.d2.z) < 0.3) overHead = overHead || w.ball.y > 1.9;
  }
  assert.ok(overHead, 'it clears his head');
  assert.ok(ev.some(x => x.type === 'received' && x.id === 'you'), ev.map(x => x.type).join(','));
});

test('roulette: you spin away from the presser and keep the ball', () => {
  const w = oneOnOne(1.2);
  const before = dist(w.you, w.byId.d2);
  const e = skill(w, 'roulette');
  assert.ok(e.ok);
  run(w, 0.4);
  assert.equal(w.owner, 'you');
  assert.ok(dist(w.you, w.byId.d2) > before);
});

test('no skill without a defender near: nobody to beat, no points', () => {
  const w = oneOnOne(9);
  assert.equal(presserOf(w), null);
  assert.equal(skill(w, 'stepover').ok, false);
});

test('skills score style points, and a goal after two or more is JOGA BONITA', () => {
  const m = createMatch();
  assert.equal(scoreEvent(m, { type: 'skill', move: 'nutmeg', ok: true }).text, 'NUTMEG!');
  assert.equal(scoreEvent(m, { type: 'skill', move: 'stepover', ok: true }), null);
  assert.equal(m.points, SKILL.points.nutmeg + SKILL.points.stepover);
  const b = scoreEvent(m, { type: 'goal', by: 'you', x: 0, y: 1, dist: 12, skills: 3 });
  assert.equal(b.text, 'JOGA BONITA!');
  assert.ok(b.sub.includes('JOGA BONITA x3'));
  assert.equal(scoreEvent(m, { type: 'skill', move: 'stepover', ok: false, read: true }).text, 'NOT AGAIN');
});

test('the goal event carries how many skills you pulled off in the attack', () => {
  const w = oneOnOne(2);
  skill(w, 'stepover'); w.time += 0.5; w.byId.d2.stun = 0; skill(w, 'roulette');
  assert.equal(w.skills, 2);
});
