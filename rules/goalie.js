// KEEPER RUSH: you're in goal and they keep coming. Pure.
//
// Shots come from all over the box: drives from the edge, angled shots, one on ones, curlers and
// chips, and the odd penalty. Every save makes the next one harder (more pace, better placed, more
// kinds of shot). Three goals and you're done. You move anywhere in the six-yard box (stick or
// stepping) and your gloves reach further than your hands, like in a shootout (rules/penalties.js).
//
// intent: { move: {x, z} world, physical: {x, z}, gloves: [{x, y, z}] world }
import { GOAL, BALL } from './tuning.js';
import { clamp } from './vec.js';
import { stepBall, ballSpeed } from './ball.js';
import { ballistic } from './shot.js';
import { PENS, touches } from './penalties.js';

export const RUSH = {
  lives: 3,
  move: 4.2,                                // your speed round the box (m/s)
  box: { x: GOAL.halfW + 2, z: 6 },         // how far you can roam from the goal line
  speed: [15, 27], speedPerSave: 0.55,      // shot pace, and how fast it climbs
  runUp: [1.3, 0.75],                       // the shooter's run-up shrinks as it gets harder
  miss: [0.16, 0.04],                       // and he misses the target less
  points: { save: 100, perLevel: 20, catch: 50, tips: 100 },
  pause: 1.4,
  curlLead: 0.42,
};

// shot kinds, and the save count from which each one turns up
const KINDS = [
  { id: 'edge', from: 0 }, { id: 'angle', from: 0 }, { id: 'pen', from: 2 }, { id: 'close', from: 3 },
  { id: 'curl', from: 5 }, { id: 'chip', from: 7 },
];

export function createRush() {
  return { lives: RUSH.lives, saves: 0, points: 0, streak: 0, best: 0, phase: 'setup', t: 0, shot: null, over: false, conceded: 0 };
}

const lerp = (a, b, k) => a + (b - a) * clamp(k, 0, 1);
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];

// The next shot for this many saves: { kind, from: {x, z}, aim: {x, y, z}, speed, curl, chip }.
export function planShot(saves, rnd = Math.random, youX = 0) {
  const kind = pick(KINDS.filter(k => saves >= k.from), rnd).id, side = rnd() < 0.5 ? -1 : 1;
  const hard = clamp(saves / 18, 0, 1);
  let from, speed = Math.min(RUSH.speed[1], RUSH.speed[0] + saves * RUSH.speedPerSave + rnd() * 2), curl = 0, chip = false;
  if (kind === 'edge') from = { x: (rnd() - 0.5) * 16, z: GOAL.z + 16 + rnd() * 5 };
  else if (kind === 'angle') from = { x: side * (9 + rnd() * 4), z: GOAL.z + 5 + rnd() * 6 };
  else if (kind === 'pen') from = { x: 0, z: GOAL.z + PENS.spot };
  else if (kind === 'close') { from = { x: (rnd() - 0.5) * 8, z: GOAL.z + 8 + rnd() * 3 }; speed *= 0.8; }
  else if (kind === 'curl') { from = { x: side * (6 + rnd() * 6), z: GOAL.z + 17 + rnd() * 4 }; curl = -side * (5 + rnd() * 3); speed *= 0.9; }
  else { from = { x: (rnd() - 0.5) * 6, z: GOAL.z + 13 + rnd() * 4 }; chip = true; }
  // where it's going: away from you, nearer the corners as it gets harder
  let aim;
  if (rnd() < lerp(RUSH.miss[0], RUSH.miss[1], hard)) aim = { x: side * (GOAL.halfW + 0.4 + rnd()), y: 0.5 + rnd() * 2.6, z: GOAL.z };
  else {
    const away = Math.abs(youX) > 0.6 ? -Math.sign(youX) : side;
    const toward = rnd() < lerp(0.65, 0.85, hard) ? away : -away;
    aim = { x: toward * lerp(0.6 + rnd() * 2.2, 1.6 + rnd() * 1.75, hard), y: chip ? 1.6 + rnd() * 0.6 : 0.25 + rnd() * lerp(1.4, 2.0, hard), z: GOAL.z };
  }
  if (chip) speed = 9 + rnd() * 2;
  return { kind, from, aim, speed, curl, chip };
}

// Puts the shooter and ball in place for the next shot.
function setup(r, w, rnd) {
  const you = w.you, sh = w.byId.d2;
  r.shot = planShot(r.saves, rnd, you.x);
  r.phase = 'runup'; r.t = 0; r.saved = false;
  w.owner = null; w.dead = false; w.shot = null;
  const f = r.shot.from;
  Object.assign(w.ball, { x: f.x, y: BALL.r, z: f.z, vx: 0, vy: 0, vz: 0, curl: 0, inNet: false });
  const dx = f.x - (r.shot.aim.x * 0.3), dz = f.z - GOAL.z, d = Math.hypot(dx, dz) || 1;
  r.start = { x: f.x + dx / d * 3, z: f.z + dz / d * 3 };
  Object.assign(sh, { x: r.start.x, z: r.start.z, vx: 0, vz: 0, fx: -dx / d, fz: -dz / d });
  // the rest wait out of the way: your two defenders on the edge of the box, their two up top
  const rest = w.players.filter(p => p !== you && p !== sh);
  rest.forEach((p, i) => Object.assign(p, { x: (i % 2 ? 1 : -1) * (14 + i), z: GOAL.z + 18 + i * 2, vx: 0, vz: 0, dive: 0 }));
}

// Advances the rush. Events: { type: 'rushSetup', kind }, { type: 'kick', by, power, kind },
// { type: 'rushResult', how: 'saved' | 'goal' | 'miss' | 'post', points, catch, tips, lives },
// { type: 'rushOver', saves, points }.
export function stepRush(r, w, it, dt, rnd = Math.random) {
  const ev = [], b = w.ball, you = w.you;
  if (r.phase === 'over') return ev;
  if (r.phase === 'setup') { setup(r, w, rnd); ev.push({ type: 'rushSetup', kind: r.shot.kind }); }
  r.t += dt; w.time += dt;

  // you: anywhere in the six-yard box, facing out
  const m = it.move || { x: 0, z: 0 };
  you.x = clamp(you.x + m.x * RUSH.move * dt + (it.physical ? it.physical.x : 0), -RUSH.box.x, RUSH.box.x);
  you.z = clamp(you.z + m.z * RUSH.move * dt + (it.physical ? it.physical.z : 0), GOAL.z + 0.2, GOAL.z + RUSH.box.z);
  you.fx = 0; you.fz = 1;

  const sh = w.byId.d2;
  if (r.phase === 'runup') {
    const k = Math.min(1, r.t / lerp(RUSH.runUp[0], RUSH.runUp[1], r.saves / 18)), s = r.start;
    const nx = s.x + (b.x - s.x) * k * 0.85, nz = s.z + (b.z - s.z) * k * 0.85;
    sh.vx = (nx - sh.x) / Math.max(dt, 1e-3); sh.vz = (nz - sh.z) / Math.max(dt, 1e-3); sh.x = nx; sh.z = nz;
    if (k >= 1) {
      const v = ballistic(b, r.shot.aim, r.shot.speed);
      Object.assign(b, { vx: v.vx, vy: v.vy, vz: v.vz, curl: r.shot.curl });
      b.vx -= r.shot.curl * (v.T || 0) * RUSH.curlLead;      // a curler starts outside the target and bends back in
      sh.vx = sh.vz = 0;
      r.phase = 'flight'; r.t = 0;
      ev.push({ type: 'kick', by: sh.id, power: r.shot.chip ? 0.3 : clamp(r.shot.speed / 26, 0.4, 1), kind: r.shot.chip ? 'chip' : null });
    }
    return ev;
  }

  if (r.phase === 'flight') {
    const prev = { x: b.x, y: b.y, z: b.z }, gl = it.gloves || [];
    const bev = stepBall(b, dt, []);
    let how = null, caught = false, tips = false;
    if (!r.saved) {
      const hits = gl.filter(g => touches(prev, b, g, PENS.glove + BALL.r));
      const body = [{ x: you.x, y: 1.0, z: you.z }, { x: you.x, y: 1.55, z: you.z }, { x: you.x, y: 0.35, z: you.z }].some(g => touches(prev, b, g, PENS.body + BALL.r));
      if ((hits.length || body) && prev.z > GOAL.z) {
        how = 'saved'; r.saved = true;
        caught = body || (hits.length === 2 && ballSpeed(b) < 24);
        tips = !body && hits.length === 1 && Math.abs(b.x - you.x) > 1.5;
        if (caught) Object.assign(b, { inNet: false, x: you.x, y: 1.1, z: you.z + 0.35, vx: 0, vy: 0, vz: 0, curl: 0 });
        else Object.assign(b, { inNet: false, z: Math.max(b.z, GOAL.z + 0.3), vz: Math.abs(b.vz) * 0.35 + 1.5, vx: (b.x - you.x) * 2.5 + (rnd() - 0.5) * 3, vy: 2.5, curl: 0 });
      }
    }
    if (!how && !r.saved) for (const e of bev) { if (e.type === 'goal') how = 'goal'; else if (e.type === 'post') how = 'post'; else if (e.type === 'out') how = 'miss'; }
    if (!how && !r.saved && r.t > 3.5) how = 'miss';
    if (how) {
      let points = 0;
      if (how === 'saved') {
        r.saves++; r.streak++;
        points = RUSH.points.save + RUSH.points.perLevel * r.saves + (caught ? RUSH.points.catch : 0) + (tips ? RUSH.points.tips : 0);
        points = Math.round(points * (1 + Math.min(1, (r.streak - 1) * 0.1)));
        r.points += points;
      } else if (how === 'goal') { r.lives--; r.streak = 0; r.conceded++; }
      ev.push({ type: 'rushResult', how, points, catch: caught, tips, lives: r.lives, streak: r.streak });
      r.phase = 'after'; r.t = 0;
    }
    return ev;
  }

  // after a shot
  if (!(r.saved && b.vx === 0 && b.vz === 0 && b.y > 0.9)) stepBall(b, dt, []);
  if (r.t >= RUSH.pause) {
    if (r.lives <= 0) { r.phase = 'over'; r.over = true; ev.push({ type: 'rushOver', saves: r.saves, points: r.points }); }
    else r.phase = 'setup';
  }
  return ev;
}
