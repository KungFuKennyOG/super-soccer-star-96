import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepSim } from '../../rules/sim.js';
import { STEPS, createTutorial, setupDrill, stepTutorial, skipStep, currentStep, DONE_PAUSE } from '../../rules/tutorial.js';
import { perfectTime, laneBlocked } from '../../rules/pass.js';
import { defenders } from '../../rules/sim.js';

const fixed = () => 0.5;
const DT = 1 / 72;
const idle = (o = {}) => ({ move: { x: 0, z: 0 }, facing: { x: 0, z: -1 }, ...o });
const step = id => STEPS.find(s => s.id === id);

// runs the sim and the tutorial together; intent(t) or a fixed intent
function play(w, tut, secs, intent = idle(), vr = false) {
  const out = [];
  for (let t = 0; t < secs; t += DT) {
    const it = typeof intent === 'function' ? intent(t) : intent;
    const ev = stepSim(w, it, DT, fixed);
    const r = stepTutorial(tut, { ev, intent: it, world: w, dt: DT, vr, restart: !!it.restart });
    if (r) out.push(r);
    if (r === 'next' || r === 'reset') setupDrill(w, currentStep(tut));
  }
  return out;
}

test('every prompt line fits the card (36 characters)', () => {
  for (const s of STEPS) for (const l of [...s.vr, ...s.pc]) assert.ok(l.length <= 36, `${s.id}: "${l}"`);
});

test('every drill parks the defenders and puts the ball with whoever starts on it', () => {
  for (const s of STEPS) {
    const w = createWorld(fixed);
    setupDrill(w, s);
    const owner = w.byId[w.owner];
    assert.equal(w.owner, s.drill.owner || 'you', s.id);
    assert.ok(Math.hypot(w.ball.x - owner.x, w.ball.z - owner.z) < 1, s.id);
    // nobody pressing you: parked defenders stay put for a few seconds
    const before = defenders(w).map(d => [d.x, d.z]);
    for (let t = 0; t < 3; t += DT) stepSim(w, idle(), DT, fixed);
    defenders(w).forEach((d, i) => { if (w.drill.frozen.has(d.id)) assert.deepEqual([d.x, d.z], before[i], s.id); });
  }
});

test('dribbling far enough completes the first step, then the next drill starts', () => {
  const w = createWorld(fixed), tut = createTutorial();
  setupDrill(w, currentStep(tut));
  const res = play(w, tut, 3 + DONE_PAUSE, idle({ move: { x: 0, z: -1 } }));
  assert.ok(res.includes('done') && res.includes('next'));
  assert.equal(currentStep(tut).id, 'sprint');
});

test('a perfect pass completes the pass step in one go', () => {
  const w = createWorld(fixed), tut = createTutorial();
  tut.i = STEPS.indexOf(step('pass'));
  setupDrill(w, step('pass'));
  const res = play(w, tut, 0.2, t => idle(t < DT ? { pass: { holdT: perfectTime(), targetId: 'm1' } } : {}));
  assert.deepEqual(res, ['done']);
});

test('calling for it: in the headset only a raised hand counts; the teammate passes back', () => {
  const w = createWorld(fixed), tut = createTutorial();
  tut.i = STEPS.indexOf(step('call'));
  setupDrill(w, step('call'));
  // held: he waits on the ball
  play(w, tut, 1, idle(), true);
  assert.equal(w.owner, 'm1');
  const first = play(w, tut, 3, t => idle({ call: t < DT }), true);   // the pass button, not a hand
  assert.equal(tut.n, 0);
  assert.ok(first.includes('reset'));
  const res = play(w, tut, 3, t => idle(t < DT ? { call: true, callHand: 'right' } : {}), true);
  assert.equal(tut.n, 1);
  assert.ok(res.includes('reset'), 'he passed it to you and the drill reset');
  assert.equal(w.owner, 'm1');
});

test('the lob drill really puts a defender in the lane, and the pass goes over him', () => {
  const w = createWorld(fixed), tut = createTutorial();
  tut.i = STEPS.indexOf(step('lob'));
  setupDrill(w, step('lob'));
  assert.ok(laneBlocked(w.ball, w.byId.m1, defenders(w)));
  const res = play(w, tut, 0.1, t => idle(t < DT ? { pass: { holdT: perfectTime(), targetId: 'm1' } } : {}));
  assert.deepEqual(res, ['done']);
});

test('header drill: call, the cross comes to your head, and you head it', () => {
  const w = createWorld(fixed), tut = createTutorial();
  tut.i = STEPS.indexOf(step('header'));
  setupDrill(w, step('header'));
  const you = w.you;
  const head = () => ({ x: you.x, y: 1.64, z: you.z, vx: 0, vy: 0, vz: 0 });
  const res = play(w, tut, 3, t => idle({ call: t < DT, head: head(), gaze: { x: 0, y: 0, z: -1 } }));
  assert.ok(res.includes('done'), `no header: ${JSON.stringify(res)}`);
});

test('volley and bicycle drills count only their own kind of strike', () => {
  for (const id of ['volley', 'bicycle']) {
    const w = createWorld(fixed), tut = createTutorial();
    tut.i = STEPS.indexOf(step(id));
    setupDrill(w, step(id));
    const look = id === 'bicycle' ? { x: 0, y: 0.8, z: -0.6 } : { x: 0, y: -0.2, z: -0.98 };
    const eye = () => ({ x: w.you.x, y: 1.7, z: w.you.z });
    let struck = false;
    const res = play(w, tut, 2, t => {
      const o = { gaze: look };
      if (t < DT) o.knock = true;                                         // flick it up
      if (!struck && t > 0.5 && w.ball.vy < 0 && w.ball.y < (id === 'bicycle' ? 1.6 : 1.0)) { struck = true; o.strike = { eye: eye(), dir: look }; }
      return idle(o);
    });
    assert.ok(res.includes('done'), id);
  }
});

test('turning a full circle completes the turn step', () => {
  const w = createWorld(fixed), tut = createTutorial();
  tut.i = STEPS.indexOf(step('turn'));
  setupDrill(w, step('turn'));
  const res = play(w, tut, 2.2, t => idle({ facing: { x: Math.sin(t * 3.2), z: -Math.cos(t * 3.2) } }));
  assert.ok(res.includes('done'));
});

test('skipping moves on, and the last step finishes training', () => {
  const w = createWorld(fixed), tut = createTutorial();
  tut.i = STEPS.length - 1;
  setupDrill(w, currentStep(tut));
  skipStep(tut);
  const res = play(w, tut, 0.1);
  assert.deepEqual(res, ['finished']);
  assert.ok(tut.finished);
});
