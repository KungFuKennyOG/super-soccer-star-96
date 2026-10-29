// Penalty shootouts. Pure: the page builds an intent each frame and draws what this decides.
//
// Five kicks each (you first), then sudden death. You take every one of yours like any shot (look
// where you want it, hold and release the trigger; a quick tap is a chip, so a Panenka works when he
// dives). Their keeper guesses a side as you strike: guess right and he can reach it, unless it's
// tucked into a top corner or hit hard and wide. For theirs you're in goal: your gloves reach
// further than your hands (PENS.gain) and you can shuffle along the line; a shot that touches a
// glove or your body is saved.
//
// intent for a shootout step: { shot: { eye, dir, holdT } on release (your kicks),
//   gloves: [{ x, y, z }] world positions of your gloves (their kicks), move: { x }, physical: { x } }
import { GOAL, BALL } from './tuning.js';
import { clamp } from './vec.js';
import { stepBall, predictCross, ballSpeed } from './ball.js';
import { shotVelocity, ballistic } from './shot.js';

export const PENS = {
  spot: 11,                    // metres out from the goal line
  kicks: 5,
  guess: [0.38, 0.24, 0.38],   // their keeper: dive left, stay up the middle, dive right
  diveTo: 2.3,                 // where he dives to (x)
  reach: 1.05, centreReach: 0.85, reachUp: 1.75,   // how far he gets from there
  topY: 1.95, topX: 2.5,       // tucked in above and outside this, it's unstoppable
  nerves: 0.012,               // extra aim error from the spot (radians)
  hard: 25,                    // a kick faster than this (m/s) cuts his reach
  hardReach: 0.72,
  diveSpeed: 7, diveDelay: 0.08,
  runUp: 1.4,                  // their taker's run-up (s)
  speed: [14.5, 18.5],         // their kicks (m/s): arcade pace, quick enough to beat a guess
  missBase: 0.14,              // their chance to miss the target, a little less per star
  glove: 0.26, body: 0.24,     // your glove radius, your body's half-width
  gain: { x: 2.4, y: 1.5 },    // your gloves move this much per metre your hands move (from your chest)
  shuffle: 3, lineX: 2.6,      // stick shuffle along the line (m/s), how far either way
  pause: 1.8,                  // after a kick
};
export const SPOT_Z = GOAL.z + PENS.spot;

// first: who kicks first. level: their keeper's level (0..3) reaches a little further each level.
export function createShootout({ level = 0, oppStars = 3, first = 'you' } = {}) {
  return { kicks: { you: [], them: [], order: first }, next: first, sudden: false, done: false, winner: null,
    level, oppStars, phase: 'setup', t: 0, saves: 0, guess: 0, plan: null, taker: null };
}

const goals = a => a.filter(Boolean).length;

// Who has won, if anyone, from the kicks so far: 'you' | 'them' | null. Sets sudden once five each are level.
export function decide(so) {
  const y = so.kicks.you, th = so.kicks.them, n = PENS.kicks;
  if (y.length <= n && th.length <= n) {
    if (goals(y) + (n - y.length) < goals(th)) return 'them';
    if (goals(th) + (n - th.length) < goals(y)) return 'you';
    if (y.length < n || th.length < n) return null;
  }
  if (y.length === th.length) {
    if (goals(y) !== goals(th)) return goals(y) > goals(th) ? 'you' : 'them';
    so.sudden = true;
  }
  return null;
}

export function recordKick(so, by, scored) {
  so.kicks[by].push(scored);
  so.next = by === 'you' ? 'them' : 'you';
  const w = decide(so);
  if (w) { so.done = true; so.winner = w; }
  return w;
}

// Their keeper's guess as you strike: -1 left, 0 stays, 1 right.
export function keeperGuess(rnd = Math.random) {
  const r = rnd(), [l, c] = PENS.guess;
  return r < l ? -1 : r < l + c ? 0 : 1;
}

// Whether their keeper keeps your kick out, given where it crosses the line and how hard it's hit.
export function keeperSaves(cross, guess, speed, level = 0) {
  if (!cross || !cross.onTarget) return false;
  const at = guess * PENS.diveTo, ax = Math.abs(cross.x);
  if (cross.y > PENS.topY && ax > PENS.topX) return false;                  // top corner
  let reach = (guess ? PENS.reach : PENS.centreReach) + 0.04 * level;
  if (speed > PENS.hard && ax > 1.6) reach = Math.min(reach, PENS.hardReach);
  if (!guess && cross.y > 2.1) return false;                                // over him into the roof
  return Math.abs(cross.x - at) < reach && cross.y < (guess ? PENS.reachUp + 0.35 : 2.1);
}

// Where their taker puts it: { aim: {x, y, z}, speed }. Weaker sides miss the target more.
export function takerKick(rnd = Math.random, stars = 3) {
  const side = rnd() < 0.5 ? -1 : 1, speed = PENS.speed[0] + rnd() * (PENS.speed[1] - PENS.speed[0]);
  if (rnd() < PENS.missBase - 0.015 * stars) {
    return rnd() < 0.5 ? { aim: { x: side * (GOAL.halfW + 0.5), y: 0.6, z: GOAL.z }, speed } : { aim: { x: side * rnd() * 2, y: GOAL.h + 0.6, z: GOAL.z }, speed };
  }
  const where = rnd(), x = where < 0.2 ? (rnd() - 0.5) * 1.6 : side * (1.5 + rnd() * 1.75);
  return { aim: { x, y: 0.25 + rnd() * 1.95, z: GOAL.z }, speed };
}

// Did the ball's path from a to b this step come within r of point c?
export function touches(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = dx * dx + dy * dy + dz * dz || 1e-9;
  const k = clamp(((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / L, 0, 1);
  return Math.hypot(a.x + dx * k - c.x, a.y + dy * k - c.y, a.z + dz * k - c.z) < r;
}

// Your glove for a hand: from your chest, the hand's offset scaled up (pure arithmetic for the page).
export function gloveSpot(chest, hand) {
  return { x: chest.x + (hand.x - chest.x) * PENS.gain.x, y: Math.max(0.1, chest.y + (hand.y - chest.y) * PENS.gain.y), z: hand.z };
}

/* ---------- the shootout, step by step ---------- */

// Puts everyone in place for the next kick.
function setup(so, w, rnd) {
  const you = w.you, gk = w.byId.gk, taker = w.byId.d2;
  so.turn = so.next; so.phase = 'ready'; so.t = 0; so.plan = null; so.guess = 0;
  w.owner = null; w.dead = false; w.shot = null;
  Object.assign(w.ball, { x: 0, y: BALL.r, z: SPOT_Z, vx: 0, vy: 0, vz: 0, curl: 0, inNet: false });
  // everyone else waits on the edge of the area
  const wait = w.players.filter(p => p !== you && p !== gk && p !== taker);
  wait.forEach((p, i) => Object.assign(p, { x: -7 + i * 3.5, z: SPOT_Z + 9, vx: 0, vz: 0, fx: 0, fz: -1, dive: 0 }));
  for (const p of w.players) { p.dive = 0; p.stun = 0; }
  if (so.turn === 'you') {
    Object.assign(you, { x: 0, z: SPOT_Z + 0.62, vx: 0, vz: 0, fx: 0, fz: -1 });
    Object.assign(gk, { x: 0, z: GOAL.z + 0.3, vx: 0, vz: 0, fx: 0, fz: 1, antics: true, save: null, holding: false, rushing: false });
    Object.assign(taker, { x: -4, z: SPOT_Z + 9 });
  } else {
    Object.assign(you, { x: 0, z: GOAL.z + 0.3, vx: 0, vz: 0, fx: 0, fz: 1 });
    Object.assign(gk, { x: 6, z: SPOT_Z + 9, vx: 0, vz: 0, fx: 0, fz: -1, antics: false, save: null, holding: false, rushing: false });
    so.side = rnd() < 0.5 ? -1 : 1;
    Object.assign(taker, { x: so.side * 1.6, z: SPOT_Z + 2.8, vx: 0, vz: 0, fx: 0, fz: -1 });
  }
}

// Advances the shootout. Returns events: { type: 'penSetup', turn }, { type: 'kick', by, power, kind },
// { type: 'penResult', by: 'you' | 'them', scored, how: 'goal' | 'saved' | 'post' | 'miss', guess, chip },
// { type: 'shootoutOver', won }.
export function stepShootout(so, w, it, dt, rnd = Math.random) {
  const ev = [], b = w.ball;
  if (so.phase === 'over') return ev;
  if (so.phase === 'setup') { setup(so, w, rnd); ev.push({ type: 'penSetup', turn: so.turn }); }
  so.t += dt;
  w.time += dt;
  const you = w.you, gk = w.byId.gk, taker = w.byId.d2;

  if (so.turn === 'them') {
    // you on the line: shuffle with the stick or by stepping
    const mx = (it.move ? it.move.x : 0) * PENS.shuffle * dt + (it.physical ? it.physical.x : 0);
    you.x = clamp(you.x + mx, -PENS.lineX, PENS.lineX);
  }

  if (so.phase === 'ready') {
    if (so.turn === 'you' && it.shot) {
      const v = shotVelocity(b, it.shot.eye, it.shot.dir, it.shot.holdT, rnd, w.tune.shotErr + PENS.nerves, w.tune.shotPower);
      kickOff(so, w, v);
      gk.antics = false;
      so.guess = keeperGuess(rnd);
      const cross = predictCross(b, 4);
      so.plan = { cross, save: keeperSaves(cross, so.guess, ballSpeed(b), so.level), chip: !!v.chip };
      ev.push({ type: 'kick', by: 'you', power: v.power, kind: v.chip ? 'chip' : null });
    } else if (so.turn === 'them') {
      // the run-up, then the strike
      const k = Math.min(1, so.t / PENS.runUp), sx = so.side * 1.6, sz = SPOT_Z + 2.8;
      const nx = sx + (b.x - sx + so.side * 0.25) * k, nz = sz + (b.z + 0.55 - sz) * k;
      taker.vx = (nx - taker.x) / Math.max(dt, 1e-3); taker.vz = (nz - taker.z) / Math.max(dt, 1e-3);
      taker.x = nx; taker.z = nz; taker.fx = 0; taker.fz = -1;
      if (k >= 1) {
        const plan = takerKick(rnd, so.oppStars);
        const v = ballistic(b, plan.aim, plan.speed);
        kickOff(so, w, { ...v, power: 0.7 });
        taker.vx = taker.vz = 0;
        ev.push({ type: 'kick', by: taker.id, power: 0.7, kind: null });
      }
    }
    return ev;
  }

  if (so.phase === 'flight') {
    const prev = { x: b.x, y: b.y, z: b.z };
    let how = null, bev = [];
    if (so.turn === 'you') {
      // their keeper dives on his guess and gets there if he guessed right
      if (so.t > PENS.diveDelay && !gk.save) {
        // what he goes for: the height it's at if he's guessed right, else a guess at that too
        const c0 = so.plan.cross;
        gk.dive = so.guess;
        gk.save = { y: so.plan.save && c0 ? c0.y : 0.5 + rnd() * 1.2, kind: so.plan.save ? 'parry' : 'beaten', id: w.time };
      }
      if (so.t > PENS.diveDelay && so.guess) gk.x += clamp(so.guess * PENS.diveTo - gk.x, -PENS.diveSpeed * dt, PENS.diveSpeed * dt);
      const c = so.plan.cross;
      if (so.plan.save && c && so.t + dt >= c.t) {
        so.parried = true; how = 'saved';
        Object.assign(b, { x: c.x, y: Math.max(BALL.r, c.y), z: GOAL.z + 0.4, vz: Math.abs(b.vz) * 0.3 + 2, vx: (rnd() - 0.5) * 8, vy: 2.5 });
      } else bev = stepBall(b, dt, []);
    } else {
      bev = stepBall(b, dt, []);
      const gl = it.gloves || [], spots = [...gl, { x: you.x, y: 1.0, z: you.z }, { x: you.x, y: 1.55, z: you.z }];
      const hit = spots.some((g, i) => touches(prev, b, g, i < gl.length ? PENS.glove + BALL.r : PENS.body + BALL.r));
      if (hit && prev.z > GOAL.z) {
        so.parried = true; how = 'saved';
        Object.assign(b, { inNet: false, z: Math.max(b.z, GOAL.z + 0.3), vz: Math.abs(b.vz) * 0.35 + 1.5, vx: (b.x - you.x) * 2 + (rnd() - 0.5) * 4, vy: 2 });
      }
    }
    if (!how) for (const e of bev) {
      if (e.type === 'goal') how = 'goal';
      else if (e.type === 'post') how = 'post';
      else if (e.type === 'out') how = 'miss';
    }
    if (!how && so.t > 3) how = 'miss';
    if (how) {
      const scored = how === 'goal';
      if (how === 'saved' && so.turn === 'them') so.saves++;
      const winner = recordKick(so, so.turn, scored);
      ev.push({ type: 'penResult', by: so.turn, scored, how, guess: so.guess, chip: so.plan ? so.plan.chip : false });
      so.phase = 'after'; so.t = 0; so.over = winner;
    }
    return ev;
  }

  // after a kick: the ball settles, then the next one (or the end)
  stepBall(b, dt, []);
  if (so.turn === 'you' && so.guess) gk.x += clamp(so.guess * PENS.diveTo - gk.x, -PENS.diveSpeed * dt, PENS.diveSpeed * dt);
  if (so.t >= PENS.pause) {
    gk.dive = 0; gk.save = null; so.parried = false;
    if (so.done) { so.phase = 'over'; ev.push({ type: 'shootoutOver', won: so.winner === 'you' }); }
    else so.phase = 'setup';
  }
  return ev;
}

function kickOff(so, w, v) {
  const b = w.ball;
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.curl = 0;
  so.phase = 'flight'; so.t = 0; so.parried = false;
}

// The dots for the scoreboard: per side, an array of true / false / null (not taken yet), at least 5.
export function tally(so) {
  const n = Math.max(PENS.kicks, so.kicks.you.length, so.kicks.them.length);
  const pad = a => Array.from({ length: n }, (_, i) => (i < a.length ? a[i] : null));
  return { you: pad(so.kicks.you), them: pad(so.kicks.them), score: [goals(so.kicks.you), goals(so.kicks.them)] };
}
