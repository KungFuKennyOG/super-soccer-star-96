// The whole on-pitch simulation: you, two teammates, three defenders and a keeper on a half pitch.
// Pure (no three, no DOM): the page turns input into an intent, calls stepSim, and draws the world.
//
// intent: {
//   move: {x, z}       world-space run direction, length 0..1
//   sprint: bool
//   facing: {x, z}     head direction on the ground (unit)
//   physical: {x, z}   metres the player physically stepped this frame (VR room-scale)
//   knock, drag, call: bool (true on the frame pressed)
//   shot: { eye, dir, holdT } on the frame the shot is released
//   pass: { holdT, targetId } on the frame the pass is released
// }
import { MOVE, AI, GOAL, PITCH, BALL } from './tuning.js';
import { clamp, dist, norm, steer } from './vec.js';
import { makeBall, stepBall, predictCross, ballSpeed } from './ball.js';
import { gradePass, choosePass } from './pass.js';
import { shotVelocity, ballistic } from './shot.js';
import { defenderTargets, mateTarget, mateDecision, keeperSpot, keeperSave, closest } from './ai.js';

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

export function createWorld(rnd = Math.random) {
  const players = START.map(s => ({ ...s, vx: 0, vz: 0, fx: 0, fz: -1, stun: 0, tackleT: 0, dive: 0 }));
  const w = { players, byId: Object.fromEntries(players.map(p => [p.id, p])), ball: makeBall(), time: 0 };
  w.you = w.byId.you;
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
    kick: null, shot: null, pendingPass: null, lastAssist: null, perfectChain: 0, celebrate: null,
  });
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

  if (!w.dead && w.owner === 'you') {
    if (it.shot) shoot(w, you, it.shot.eye, it.shot.dir, it.shot.holdT, rnd, ev);
    else if (it.pass && w.byId[it.pass.targetId]) pass(w, you, w.byId[it.pass.targetId], gradePass(it.pass.holdT), rnd, ev);
    else if (it.knock) knock(w, ev);
    else if (it.drag) drag(w, ev);
  }
  if (!w.dead && it.call && w.owner && w.byId[w.owner].role === 'mate') w.called = true;

  updateAI(w, dt, rnd, ev);

  if (w.owner) carry(w, dt);
  else for (const e of stepBall(b, dt, [])) onBallEvent(w, e, ev);

  if (!w.dead) {
    keeperCheck(w, rnd, ev);
    if (!w.owner) looseBall(w, rnd, ev);
    else tackles(w, dt, ev);
  }
  separate(w);
  w.ownT += dt;
  for (const e of ev) if (DEAD.has(e.type)) { w.dead = true; w.perfectChain = 0; }
  return ev;
}

/* ---------- you ---------- */

function moveYou(w, it, dt) {
  const p = w.you, onBall = w.owner === 'you';
  let top = onBall ? (it.sprint ? MOVE.dribbleSprint : MOVE.dribble) : (it.sprint ? MOVE.sprint : MOVE.run);
  if (w.boostT > 0) top += MOVE.knockBoost;
  const m = it.move || { x: 0, z: 0 }, ml = Math.min(1, Math.hypot(m.x, m.z));
  const dir = norm(m.x, m.z);
  if (w.dead) steer(p, 0, 0, MOVE.accel, dt);
  else steer(p, dir.x * ml * top, dir.z * ml * top, MOVE.accel, dt);
  p.x += p.vx * dt + (it.physical ? it.physical.x : 0);
  p.z += p.vz * dt + (it.physical ? it.physical.z : 0);
  if (it.facing) { p.fx = it.facing.x; p.fz = it.facing.z; }
  bound(p);
}

function shoot(w, p, eye, dir, holdT, rnd, ev) {
  const v = shotVelocity(w.ball, eye, dir, holdT, rnd, Math.hypot(p.vx, p.vz) / MOVE.sprint * 0.02);
  launch(w, p, v);
  startShot(w, p, ev, v.power);
}

function pass(w, from, to, grade, rnd, ev) {
  const v = choosePass({ x: w.ball.x, z: w.ball.z }, to, defenders(w), grade, rnd);
  launch(w, from, v);
  w.pendingPass = { from: from.id, to: to.id, grade, t: w.time, lead: v.lead, lob: !!v.lob };
  if (grade !== 'perfect') w.perfectChain = 0;
  w.called = false;
  ev.push({ type: 'pass', by: from.id, to: to.id, grade, lob: !!v.lob });
}

function knock(w, ev) {
  const p = w.you, s = Math.hypot(p.vx, p.vz);
  const d = s > 0.5 ? norm(p.vx, p.vz) : { x: p.fx, z: p.fz };
  launch(w, p, { vx: d.x * (s + MOVE.knockKick), vy: 0, vz: d.z * (s + MOVE.knockKick) });
  w.knockCD = 0.35; w.boostT = MOVE.knockTime;
  ev.push({ type: 'knock' });
}

function drag(w, ev) {
  const p = w.you;
  p.vx = p.vz = 0;
  w.dragGrace = AI.dragGrace;
  const d = closest(defenders(w), p);
  if (d && dist(d, p) < 4) d.stun = AI.dragStun;
  ev.push({ type: 'drag' });
}

function launch(w, p, v) {
  const b = w.ball;
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.curl = 0; b.y = Math.max(b.y, BALL.r);
  w.owner = null; w.ownT = 0; w.pendingPass = null;
  w.kick = { by: p.id, t: w.time };
}

function startShot(w, p, ev, power) {
  const cross = predictCross(w.ball);
  const gk = w.byId.gk;
  const decision = cross ? keeperSave(gk, cross, ballSpeed(w.ball)) : 'wide';
  w.shot = { by: p.id, from: { x: p.x, z: p.z }, t0: w.time, cross, decision, done: false };
  ev.push({ type: 'kick', by: p.id, power });
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
  const b = w.ball, you = w.you, defs = defenders(w), home = homePlayers(w);
  const owner = w.owner ? w.byId[w.owner] : null;
  const ownerIsHome = !!owner && owner.team === 'home';
  const dtargets = defenderTargets(defs, home, b, ownerIsHome ? owner.id : null);

  for (const p of w.players) {
    if (p.role === 'you') continue;
    p.stun = Math.max(0, p.stun - dt);
    let t = null;
    if (w.dead && w.celebrate && p.role === 'mate') t = celebrationSpot(w, p);
    else if (w.dead) t = { x: p.x, z: p.z, speed: 0 };
    else if (p.role === 'def') t = dtargets.get(p.id);
    else if (p.role === 'gk') t = keeperTarget(w, p);
    else if (w.owner === p.id) t = mateOnBall(w, p, rnd, ev);
    else if (w.pendingPass && w.pendingPass.to === p.id) t = runOntoPass(p, b, w.pendingPass.lead);
    else t = mateTarget(p, b, you, defs, ownerIsHome, !owner);
    if (!t) continue;
    let speed = t.speed * (p.stun ? 0.25 : 1);
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.25) speed = 0;
    else speed = Math.min(speed, d * 4);
    steer(p, d > 1e-6 ? dx / d * speed : 0, d > 1e-6 ? dz / d * speed : 0, p.role === 'gk' ? 40 : 18, dt);
    p.x += p.vx * dt; p.z += p.vz * dt;
    const s = Math.hypot(p.vx, p.vz);
    if (w.celebrate && p.role === 'mate' && s < 0.6) { const f = norm(you.x - p.x, you.z - p.z); p.fx = f.x; p.fz = f.z; }
    else if (s > 0.4) { p.fx = p.vx / s; p.fz = p.vz / s; }
    else if (p.role === 'gk' || p.role === 'def') { const f = norm(b.x - p.x, b.z - p.z); p.fx = f.x; p.fz = f.z; }
    bound(p);
  }
}

// A teammate a pass is meant for runs to where it was aimed, then attacks the ball.
function runOntoPass(p, b, lead) {
  if (dist(p, b) < 4 || !lead) return { x: b.x, z: b.z, speed: AI.chase };
  return { x: lead.x, z: lead.z, speed: AI.mateRun + 0.6 };
}

function keeperTarget(w, gk) {
  if (w.owner === 'gk') return { x: gk.x, z: gk.z, speed: 0 };
  const s = w.shot;
  if (s && s.cross && s.decision !== 'wide' && !s.done && w.time >= s.t0 + AI.gkReact) {
    gk.dive = Math.sign(s.cross.x - gk.x) || 1;
    return { x: s.cross.x, z: gk.z, speed: AI.gkDive };
  }
  gk.dive = 0;
  const k = keeperSpot(w.ball);
  return { x: k.x, z: k.z, speed: AI.gkMove };
}

function mateOnBall(w, p, rnd, ev) {
  const choice = mateDecision(p, defenders(w), w.ownT, w.called);
  if (choice === 'pass') {
    pass(w, p, w.you, rnd() < 0.7 ? 'perfect' : 'good', rnd, ev);
    return null;
  }
  if (choice === 'shoot') {
    const side = Math.sign(rnd() - 0.5) || 1;
    const aim = { x: side * (GOAL.halfW - 0.4 - rnd() * 0.9), y: 0.3 + rnd() * 1.7, z: GOAL.z };
    launch(w, p, ballistic(w.ball, aim, 23 + rnd() * 5));
    startShot(w, p, ev, 0.8);
    return null;
  }
  return { x: clamp(p.x * 0.6, -10, 10), z: GOAL.z + 10, speed: 5.6 };
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
    ev.push({ ...e, by, dist: s ? Math.hypot(s.from.x - e.x, s.from.z - GOAL.z) : 0, assist: a, chain: w.perfectChain });
  } else ev.push({ ...e, by: s ? s.by : null });
  if (s) s.done = true;
  if (e.type === 'post') w.shot = null;
}

function keeperCheck(w, rnd, ev) {
  const s = w.shot, b = w.ball, gk = w.byId.gk;
  if (!s || s.done || !s.cross) return;
  if (s.decision !== 'catch' && s.decision !== 'parry') return;
  if (w.time < s.t0 + s.cross.t - 0.03) return;
  s.done = true;
  if (s.decision === 'catch') {
    w.owner = 'gk'; w.ownT = 0;
    ev.push({ type: 'saved', by: s.by, x: s.cross.x, y: s.cross.y });
  } else {
    b.x = clamp(s.cross.x, gk.x - 1.5, gk.x + 1.5); b.z = GOAL.z + 0.5; b.y = Math.max(BALL.r, s.cross.y);
    b.vz = Math.abs(b.vz) * 0.25 + 3; b.vx = (rnd() - 0.5) * 9; b.vy = 2.5;
    w.shot = null;
    ev.push({ type: 'parried', by: s.by });
  }
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
  if (b.y > 1.6) return;
  for (const d of defenders(w)) {
    const range = sp > AI.fastPass ? AI.interceptFast : AI.interceptSlow;
    if (!fresh && !d.stun && dist(d, b) < range) { ev.push({ type: 'intercepted', by: d.id }); w.owner = d.id; return; }
  }
  if (sp > 27) return;
  let best = null, bd = Infinity;
  for (const p of homePlayers(w)) {
    if (w.kick && w.kick.by === p.id && w.time - w.kick.t < 0.3) continue;
    if (p.role === 'you' && w.knockCD > 0) continue;
    const d = dist(p, b), r = p.role === 'you' ? AI.receive : 1.2;
    if (d < r && d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const pp = w.pendingPass;
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
    if (d.stun || w.dragGrace > 0 || dist(d, w.ball) > AI.tackleRange) { d.tackleT = 0; continue; }
    d.tackleT += dt;
    if (d.tackleT >= AI.tackleTime) {
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
