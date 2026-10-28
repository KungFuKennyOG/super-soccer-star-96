// The whole on-pitch simulation: you, two teammates, three defenders and a keeper on a half pitch.
// Pure (no three, no DOM): the page turns input into an intent, calls stepSim, and draws the world.
//
// intent: {
//   move: {x, z}       world-space run direction, length 0..1
//   sprint: bool
//   facing: {x, z}     head direction on the ground (unit)
//   physical: {x, z}   metres the player physically stepped this frame (VR room-scale)
//   skill: { move: 'stepover' | 'roulette' | 'nutmeg' | 'rainbow', side } on the frame it fires (rules/skills.js)
//   knock, drag, call: bool (true on the frame pressed; call also comes from raising a hand, callHand 'left'/'right')
//   shot: { eye, dir, holdT } on the frame the shot is released
//   pass: { holdT, targetId } on the frame the pass is released
//   strike: { eye, dir } on the frame the shoot trigger goes down (volleys and bicycle kicks)
//   head: { x, y, z, vx, vy, vz } your head's centre and its velocity (headers); gaze: unit 3D look
// }
import { MOVE, AI, GOAL, PITCH, BALL, AIR } from './tuning.js';
import { tuneFor } from './skill.js';
import { clamp, dist, norm, steer } from './vec.js';
import { makeBall, stepBall, ballSpeed } from './ball.js';
import { gradePass, choosePass } from './pass.js';
import { shotVelocity, ballistic } from './shot.js';
import { ballOnHead, canVolley, canBicycle, headerVelocity, volleyVelocity, bicycleVelocity, inBox, crossVelocity, flickVelocity } from './aerial.js';
import { mateTarget, mateDecision, closest } from './ai.js';
import { keeperTarget, keeperCheck, keeperClaim, shotPlan } from './keeper.js';
import { initBrain, watchYou, dragFools, defenceTargets, mateSupport } from './brain.js';
import { performSkill, SKILL } from './skills.js';

export const DEAD = new Set(['goal', 'saved', 'out', 'tackled', 'intercepted']);

const START = [
  { id: 'you', team: 'home', role: 'you', x: 0, z: -3, num: 7 },
  { id: 'm1', team: 'home', role: 'mate', x: -11, z: -9, lane: -1, num: 10 },
  { id: 'm2', team: 'home', role: 'mate', x: 11, z: -9, lane: 1, num: 9 },
  { id: 'd1', team: 'away', role: 'def', x: -7, z: -19, num: 3 },
  { id: 'd2', team: 'away', role: 'def', x: 0, z: -17, num: 5 },
  { id: 'd3', team: 'away', role: 'def', x: 7, z: -19, num: 4 },
  { id: 'gk', team: 'away', role: 'gk', x: 0, z: GOAL.z + 1.2, num: 1 },
];

// tune: from rules/skill.js tuneFor(yourStars, theirStars); defaults to two average teams.
export function createWorld(rnd = Math.random, tune = tuneFor()) {
  const players = START.map(s => ({ ...s, vx: 0, vz: 0, fx: 0, fz: -1, stun: 0, tackleT: 0, dive: 0 }));
  const w = { players, byId: Object.fromEntries(players.map(p => [p.id, p])), ball: makeBall(), time: 0 };
  w.you = w.byId.you; w.tune = tune;
  resetPlay(w, rnd);
  return w;
}

// Puts everyone back in shape with the ball at your feet.
export function resetPlay(w, rnd = Math.random) {
  for (const s of START) {
    const p = w.byId[s.id], j = p.role === 'gk' || p.role === 'you' ? 0 : 1.5;
    p.x = s.x + (rnd() * 2 - 1) * j; p.z = s.z + (rnd() * 2 - 1) * j;
    p.vx = p.vz = 0; p.fx = 0; p.fz = -1; p.stun = 0; p.tackleT = 0; p.dive = 0;
  }
  Object.assign(w.ball, makeBall(w.you.x, w.you.z - MOVE.ballLead));
  Object.assign(w, {
    owner: 'you', ownT: 0, dead: false, knockCD: 0, boostT: 0, dragGrace: 0, called: false,
    kick: null, shot: null, parryT: -9, skills: 0, dash: null, collectT: -9, pendingPass: null, lastAssist: null, perfectChain: 0, celebrate: null,
  });
  initBrain(w);
}

export const homePlayers = w => w.players.filter(p => p.team === 'home');
export const defenders = w => w.players.filter(p => p.role === 'def');

export function stepSim(w, it, dt, rnd = Math.random) {
  const ev = [], you = w.you, b = w.ball;
  w.time += dt;
  w.knockCD = Math.max(0, w.knockCD - dt);
  w.boostT = Math.max(0, w.boostT - dt);
  w.dragGrace = Math.max(0, w.dragGrace - dt);

  moveYou(w, it, dt);
  if (it.head) w.headY = it.head.y;
  watchYou(w, it, dt);

  if (!w.dead && w.owner === 'you') {
    if (it.shot) shoot(w, you, it.shot.eye, it.shot.dir, it.shot.holdT, rnd, ev);
    else if (it.pass && w.byId[it.pass.targetId]) pass(w, you, w.byId[it.pass.targetId], gradePass(it.pass.holdT), rnd, ev);
    else if (it.knock) knock(w, ev);
    else if (it.drag) drag(w, ev);
    else if (it.skill) performSkill(w, it.skill, ev, launch);
  }
  if (!w.dead && it.call && w.owner && w.byId[w.owner].role === 'mate' && !w.called) { w.called = true; ev.push({ type: 'called', by: w.owner, hand: it.callHand || null }); }

  updateAI(w, dt, rnd, ev);

  // the keeper gets there (if he does) before the ball moves on this step, so he's never late by a frame
  if (!w.dead) keeperCheck(w, rnd, ev);
  if (w.owner) carry(w, dt);
  else for (const e of stepBall(b, dt, [])) onBallEvent(w, e, ev);

  if (!w.dead) {
    if (!w.owner) { if (!aerial(w, it, rnd, ev)) looseBall(w, rnd, ev); }
    else tackles(w, dt, ev);
  }
  separate(w);
  w.ownT += dt;
  for (const e of ev) if (DEAD.has(e.type)) { w.dead = true; w.perfectChain = 0; }
  return ev;
}

/* ---------- you ---------- */

function moveYou(w, it, dt) {
  const p = w.you, onBall = w.owner === 'you', M = w.tune.move;
  let top = onBall ? (it.sprint ? M.dribbleSprint : M.dribble) : (it.sprint ? M.sprint : M.run);
  if (w.boostT > 0) top += MOVE.knockBoost;
  const m = it.move || { x: 0, z: 0 }, ml = Math.min(1, Math.hypot(m.x, m.z));
  const dir = norm(m.x, m.z);
  if (w.dead) steer(p, 0, 0, MOVE.accel, dt);
  else if (w.dash && w.dash.t > 0) { p.vx = w.dash.x; p.vz = w.dash.z; w.dash.t -= dt; }   // a skill's burst
  else steer(p, dir.x * ml * top, dir.z * ml * top, MOVE.accel, dt);
  p.x += p.vx * dt + (it.physical ? it.physical.x : 0);
  p.z += p.vz * dt + (it.physical ? it.physical.z : 0);
  if (it.facing) { p.fx = it.facing.x; p.fz = it.facing.z; }
  bound(p);
}

function shoot(w, p, eye, dir, holdT, rnd, ev) {
  const v = shotVelocity(w.ball, eye, dir, holdT, rnd, Math.hypot(p.vx, p.vz) / MOVE.sprint * 0.02 + w.tune.shotErr, w.tune.shotPower);
  launch(w, p, v);
  startShot(w, p, ev, v.power);
}

function pass(w, from, to, grade, rnd, ev) {
  const v = choosePass({ x: w.ball.x, z: w.ball.z }, to, defenders(w), grade, rnd);
  launch(w, from, v);
  // a ball to the teammate making the run: he's a step ahead of his marker, so it's his unless a
  // defender is clearly in the way
  const run = from.role === 'you' && w.brain.runner === to.id;
  w.pendingPass = { from: from.id, to: to.id, grade, t: w.time, lead: v.lead, lob: !!v.lob, run };
  if (grade !== 'perfect') w.perfectChain = 0;
  w.called = false;
  ev.push({ type: 'pass', by: from.id, to: to.id, grade, lob: !!v.lob });
}

function knock(w, ev) {
  const p = w.you, s = Math.hypot(p.vx, p.vz);
  if (s < 0.8) {                                    // standing: flick it up to volley
    launch(w, p, flickVelocity(p));
    w.knockCD = 0.5;
    ev.push({ type: 'flick' });
    return;
  }
  const d = s > 0.5 ? norm(p.vx, p.vz) : { x: p.fx, z: p.fz };
  launch(w, p, { vx: d.x * (s + MOVE.knockKick), vy: 0, vz: d.z * (s + MOVE.knockKick) });
  w.knockCD = 0.35; w.boostT = MOVE.knockTime;
  ev.push({ type: 'knock' });
}

function drag(w, ev) {
  const p = w.you;
  p.vx = p.vz = 0;
  // the same trick too often and the presser reads it: no stumble, no breathing space
  const fooled = dragFools(w);
  w.dragGrace = fooled ? w.tune.ai.dragGrace : 0.1;
  const d = closest(defenders(w), p);
  if (fooled && d && dist(d, p) < 4) d.stun = w.tune.ai.dragStun;
  ev.push({ type: 'drag', read: !fooled });
}

function launch(w, p, v) {
  const b = w.ball;
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.curl = 0; b.y = Math.max(b.y, BALL.r);
  w.owner = null; w.ownT = 0; w.pendingPass = null;
  w.kick = { by: p.id, t: w.time };
}

// kind: null for a normal shot, or 'header' | 'volley' | 'bicycle'.
function startShot(w, p, ev, power, kind = null) {
  const plan = shotPlan(w);           // rules/keeper.js: where it goes and whether he gets there
  w.shot = { by: p.id, from: { x: p.x, z: p.z }, t0: w.time, ...plan, done: false, kind };
  ev.push({ type: 'kick', by: p.id, power, kind });
}

// Headers, volleys and bicycle kicks (rules/aerial.js) on a loose ball in the air. True if you hit it.
function aerial(w, it, rnd, ev) {
  const b = w.ball, you = w.you;
  if (b.y < AIR.volleyLow || (w.kick && w.kick.by === 'you' && w.time - w.kick.t < 0.3)) return false;
  const head = it.head || { x: you.x, y: (w.headY || 1.65) - 0.08, z: you.z, vx: you.vx, vy: 0, vz: you.vz };
  const gaze = it.gaze || { x: you.fx, y: 0, z: you.fz };
  let kind = null, v = null;
  if (it.strike && canBicycle(b, you, it.strike.dir)) { kind = 'bicycle'; v = bicycleVelocity(b, rnd); }
  else if (it.strike && canVolley(b, you)) { kind = 'volley'; v = volleyVelocity(b, it.strike.eye, it.strike.dir, rnd, w.tune.shotErr, w.tune.shotPower); }
  else if (b.y > 1.05 && ballOnHead(b, head)) { kind = 'header'; v = headerVelocity(b, head, gaze, rnd); }
  if (!kind) return false;
  launch(w, you, v);
  startShot(w, you, ev, v.power, kind);
  return true;
}

// After a goal: your teammates run over and line up in front of you for the dance.
export function startCelebration(w) {
  const y = w.you;
  w.celebrate = { x: y.x + y.fx * 2.6, z: y.z + y.fz * 2.6, rx: -y.fz, rz: y.fx };
}
function celebrationSpot(w, p) {
  const c = w.celebrate, side = p.lane || 1;
  return { x: c.x + c.rx * 1.3 * side, z: c.z + c.rz * 1.3 * side, speed: 6.5 };
}

/* ---------- the computer players ---------- */

function updateAI(w, dt, rnd, ev) {
  const b = w.ball, you = w.you, defs = defenders(w);
  const owner = w.owner ? w.byId[w.owner] : null;
  const ownerIsHome = !!owner && owner.team === 'home';
  const ai = w.tune.ai;
  const dtargets = defenceTargets(w);

  for (const p of w.players) {
    if (p.role === 'you') continue;
    // training drills pin some players in place; pinned defenders can't tackle or intercept
    if (w.drill && w.drill.frozen.has(p.id)) {
      p.vx = p.vz = 0;
      if (p.role === 'def') p.stun = 99;
      if (w.owner === p.id && p.role === 'mate') mateOnBall(w, p, rnd, ev);     // he still passes or crosses when called
      const f = norm(you.x - p.x, you.z - p.z); p.fx = f.x; p.fz = f.z;
      continue;
    }
    p.stun = Math.max(0, p.stun - dt);
    let t = null;
    if (w.dead && w.celebrate && p.role === 'mate') t = celebrationSpot(w, p);
    else if (w.dead) t = { x: p.x, z: p.z, speed: 0 };
    else if (p.role === 'def') t = dtargets.get(p.id);
    else if (p.role === 'gk') t = keeperTarget(w, p);
    else if (w.owner === p.id) t = mateOnBall(w, p, rnd, ev);
    else if (w.pendingPass && w.pendingPass.to === p.id) t = runOntoPass(p, b, w.pendingPass.lead, ai);
    else if (w.owner === 'you') t = mateSupport(w, p);
    else t = mateTarget(p, b, you, defs, ownerIsHome, !owner, ai);
    if (!t) continue;
    let speed = t.speed * (p.stun ? 0.25 : 1);
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.25) speed = 0;
    else speed = Math.min(speed, d * 4);
    // the keeper eases into position (no twitching) but snaps across when he dives
    const accel = p.role === 'gk' ? (p.dive ? 40 : 12) : 18;
    steer(p, d > 1e-6 ? dx / d * speed : 0, d > 1e-6 ? dz / d * speed : 0, accel, dt);
    p.x += p.vx * dt; p.z += p.vz * dt;
    const s = Math.hypot(p.vx, p.vz);
    if (w.celebrate && p.role === 'mate' && s < 0.6) { const f = norm(you.x - p.x, you.z - p.z); p.fx = f.x; p.fz = f.z; }
    else if (p.role === 'gk') { const f = norm(b.x - p.x, b.z - p.z); p.fx = f.x; p.fz = f.z; p.holding = w.owner === 'gk'; } // always square to the ball
    else if (s > 0.4) { p.fx = p.vx / s; p.fz = p.vz / s; }
    else if (p.role === 'gk' || p.role === 'def') { const f = norm(b.x - p.x, b.z - p.z); p.fx = f.x; p.fz = f.z; }
    bound(p);
  }
}

// A teammate a pass is meant for runs to where it was aimed, then attacks the ball.
function runOntoPass(p, b, lead, ai) {
  if (dist(p, b) < 4 || !lead) return { x: b.x, z: b.z, speed: ai.chase };
  return { x: lead.x, z: lead.z, speed: ai.mateRun + 0.6 };
}


function mateOnBall(w, p, rnd, ev) {
  const choice = mateDecision(p, defenders(w), w.ownT, w.called, !!(w.drill && w.drill.mateHold));
  if (choice === 'hold') return { x: p.x, z: p.z, speed: 0 };
  if (choice === 'pass') {
    // you're in the box: whip a cross in for a header or a volley instead of passing to feet
    if (inBox(w.you) && (Math.abs(p.x) > 5 || w.called) && dist(p, w.you) > 6) {
      const v = crossVelocity(w.ball, w.you, w.headY || 1.65, rnd, w.drill && w.drill.crossHead ? true : null);
      launch(w, p, v);
      w.pendingPass = { from: p.id, to: 'you', grade: 'good', t: w.time, lead: v.lead, lob: true, cross: true };
      w.called = false;
      ev.push({ type: 'pass', by: p.id, to: 'you', grade: 'good', lob: true, cross: true });
      return null;
    }
    pass(w, p, w.you, rnd() < w.tune.matePerfect ? 'perfect' : 'good', rnd, ev);
    return null;
  }
  if (choice === 'shoot') {
    const side = Math.sign(rnd() - 0.5) || 1;
    const aim = { x: side * (GOAL.halfW - 0.4 - rnd() * 0.9), y: 0.3 + rnd() * 1.7, z: GOAL.z };
    launch(w, p, ballistic(w.ball, aim, 23 + rnd() * 5));
    startShot(w, p, ev, 0.8);
    return null;
  }
  return { x: clamp(p.x * 0.6, -10, 10), z: GOAL.z + 10, speed: w.tune.ai.mateDribble };
}

/* ---------- the ball ---------- */

function carry(w, dt) {
  const p = w.byId[w.owner], b = w.ball;
  if (p.role === 'gk') { b.x = p.x; b.z = p.z + 0.35; b.y = Math.max(BALL.r, b.y - 2 * dt); b.vx = b.vy = b.vz = 0; return; } // smothered, settles to the grass
  const s = Math.hypot(p.vx, p.vz);
  const d = s > 0.6 ? { x: p.vx / s, z: p.vz / s } : { x: p.fx, z: p.fz };
  const k = Math.min(1, 20 * dt);
  b.x += p.vx * dt; b.z += p.vz * dt; // move with the carrier, then settle onto the lead spot
  b.x += (p.x + d.x * MOVE.ballLead - b.x) * k;
  b.z += (p.z + d.z * MOVE.ballLead - b.z) * k;
  b.y = BALL.r; b.vx = p.vx; b.vy = 0; b.vz = p.vz;
  b.spin += s / BALL.r * dt;
}

function onBallEvent(w, e, ev) {
  if (w.dead) return;
  const s = w.shot;
  if (e.type === 'goal') {
    const by = s ? s.by : w.kick ? w.kick.by : 'you';
    const a = w.lastAssist && w.lastAssist.to === by && w.time - w.lastAssist.t < 4 ? w.lastAssist : null;
    ev.push({ ...e, by, kind: s ? s.kind || (s.chipped ? 'chip' : null) : null, dist: s ? Math.hypot(s.from.x - e.x, s.from.z - GOAL.z) : 0, assist: a, chain: w.perfectChain, skills: by === 'you' ? w.skills : 0 });
  } else ev.push({ ...e, by: s ? s.by : null });
  if (s) s.done = true;
  if (e.type === 'post') w.shot = null;
}


function looseBall(w, rnd, ev) {
  const b = w.ball, sp = ballSpeed(b), fresh = w.kick && w.time - w.kick.t < 0.12;
  if (w.shot) {
    // a shot can only be blocked, by a defender standing right in its way
    for (const d of defenders(w)) {
      if (b.y < 1.7 && dist(d, b) < 0.55 && !fresh) {
        b.vz = Math.abs(b.vz) * 0.3; b.vx = (rnd() - 0.5) * 8; b.vy = 1.5;
        w.shot = null;
        ev.push({ type: 'blocked', by: d.id });
        return;
      }
    }
    return;
  }
  if (keeperClaim(w, ev)) return;
  if (b.y > 1.6) return;
  // a pass's receiver gets first touch unless a defender is clearly closer; a ball just lofted
  // (a lob or cross on its way up) can't be cut out by the man next to the passer
  const pp = w.pendingPass, rec = pp && w.byId[pp.to];
  const recD = rec ? dist(rec, b) : Infinity, recR = rec && rec.role === 'you' ? AI.receive : pp && pp.run ? 1.8 : 1.2;
  const runM = w.tune.brain.runMargin, margin = pp && pp.run ? (pp.grade === 'perfect' ? runM : runM * 0.7) : 0.4;
  const rising = b.vy > 0 && b.y > 0.45;
  for (const d of defenders(w)) {
    const range = sp > AI.fastPass ? w.tune.ai.interceptFast : w.tune.ai.interceptSlow;
    const dd = dist(d, b);
    if (!fresh && !rising && !d.stun && dd < range && !(recD < recR && recD <= dd + margin)) { ev.push({ type: 'intercepted', by: d.id }); w.owner = d.id; return; }
  }
  if (sp > 27) return;
  let best = null, bd = Infinity;
  for (const p of homePlayers(w)) {
    if (w.kick && w.kick.by === p.id && w.time - w.kick.t < 0.3) continue;
    if (p.role === 'you' && (w.knockCD > 0 || b.y > AIR.trapBelow)) continue;   // a dropping ball is yours to head or volley first
    const d = dist(p, b), r = p.role === 'you' ? AI.receive * (w.time - w.collectT < SKILL.collectTime ? SKILL.collect : 1) : 1.2;
    if (d < r && d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const grade = pp && pp.to === best.id ? pp.grade : null;
  if (grade === 'perfect') w.perfectChain++;
  if (grade) w.lastAssist = { from: pp.from, to: best.id, grade, t: w.time };
  w.owner = best.id; w.ownT = 0; w.pendingPass = null; w.called = false;
  ev.push({ type: 'received', id: best.id, from: pp ? pp.from : null, grade });
}

function tackles(w, dt, ev) {
  const owner = w.byId[w.owner];
  if (owner.team !== 'home') return;
  for (const d of defenders(w)) {
    if (d.stun || w.dragGrace > 0 || dist(d, w.ball) > w.tune.ai.tackleRange) { d.tackleT = 0; continue; }
    d.tackleT += dt;
    if (d.tackleT >= w.tune.ai.tackleTime) {
      w.owner = d.id;
      ev.push({ type: 'tackled', by: d.id, victim: owner.id });
      return;
    }
  }
}

/* ---------- bodies ---------- */

function separate(w) {
  const ps = w.players;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], c = ps[j], dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
    if (d >= AI.separation || d < 1e-6) continue;
    const push = (AI.separation - d) / 2, nx = dx / d, nz = dz / d;
    const wa = a.role === 'you' ? 0.3 : 1, wc = c.role === 'you' ? 0.3 : 1;
    a.x -= nx * push * wa; a.z -= nz * push * wa; c.x += nx * push * wc; c.z += nz * push * wc;
  }
}

function bound(p) {
  p.x = clamp(p.x, -PITCH.halfW - 1, PITCH.halfW + 1);
  p.z = clamp(p.z, GOAL.z - 0.5, PITCH.halfwayZ + 2);
}
