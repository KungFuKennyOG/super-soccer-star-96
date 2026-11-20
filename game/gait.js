// How a player stands, walks, runs, side-steps and backs off: hips and legs. The feet lead: each foot
// follows a path over the ground (planted while it bears weight, rolling from heel to toe, then carried
// through the air to the next step) and the legs are bent to put the ankles there (game/legik.js). A
// planted foot moves back under the body at the body's own speed, in the direction it is really
// travelling, so feet grip the pitch whichever way he goes. The hips ride on the standing leg.
//
// The cycle is the sim's own (p.stride, rules/dribble.js): the right foot is planted round phase 0 and
// swings forward through phase pi, so a touch in the sim is the right boot's moment. Only a walk or a
// shuffle steps at its own quicker rate (the sim's is a runner's: at walking pace its steps are a metre
// long); the gait's phase (g.ph) drifts off the sim's then and is pulled back as he breaks into a run.
//
// The body turns at a body's pace (faceBody): the sim's facing snaps round with the velocity, the model
// eases after it, and a defender moving slowly near the ball keeps his chest to it and side-steps or
// backs off. Standing, the feet stay where they were put and step round when the body has turned.
//
// Everything above the hips is game/carriage.js. Strikes, touches and holds (game/strike.js) are laid
// over the legs afterwards.
import * as THREE from 'three';
import { P } from './body.js';
import { reachLeg, aimFoot } from './legik.js';
import { strideRate } from '../rules/dribble.js';
import { DRIBBLE } from '../rules/tuning.js';

const TAU = Math.PI * 2, REACH = 0.84, LR = ['L', 'R'];   // REACH: hip joint to ankle, as straight as a leg gets (m)
const TOUCH = { y: 0.23, z: DRIBBLE.near - 0.25 };            // where the right ankle is as its toe taps the ball on (game/strike.js TOUCH)
const HEEL = 0.07, TOE = 0.15, SOLE = 0.085;              // where the foot pivots as it rolls: behind and ahead of the ankle, and how far under it (m)
export const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
export const mix = (a, b, k) => a + (b - a) * k, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const wrap = a => a - TAU * Math.round(a / TAU);   // an angle as the short way round
const frac = x => x - Math.floor(x);
const eul = new THREE.Euler(0, 0, 0, 'YXZ'), q = new THREE.Quaternion(), hj = new THREE.Vector3(), fw = new THREE.Vector3();
const T = [new THREE.Vector3(), new THREE.Vector3()], PITCH = [0, 0], YAW = [0, 0], AIR = [0, 0], roll = { z: 0, y: 0 };

// What the gait remembers about a player, and what it tells the rest of the pose (and a clip blender):
//   s            eased ground speed (m/s)
//   ux, uz       which way he travels as his body sees it (+z ahead, +x his left); fwd = uz
//   mv, run, sprint   0..1: moving at all, running rather than walking (forward only), flat out
//   jk           0..1: moving, but not the way he faces (side-steps, backing off)
//   acc, accX    eased acceleration, forward and to his left (m/s2): + speeding up, - braking; + turning left
//   tilt         how far he leans into a turn (rad, + to his left)
//   ph           the gait's own phase (rad): p.stride, except while walking or shuffling
//   sw           -1..1, + while the left arm is the one coming forward (the right foot leads)
//   rd           0..1: ready stance (the ball is near)
//   py, pz       the pelvis's turn and tilt with the stride (rad), for the shoulders to answer
//   idle, w      standing: 1 - mv, and which leg bears the weight (-1 right .. 1 left)
//   L, crouch    the trunk's lean from speed, and from backing off or standing ready (rad)
//   still, puff  seconds he has stood still; 0..1 how out of breath he is
let made = 0;
export function gaitOf(m) {
  if (!m.gait) {
    const seed = frac(0.37 + 0.618034 * made++);            // each player his own stance, timing and habits
    m.gait = { seed, a: frac(seed * 5.3), b: frac(seed * 11.7), c: frac(seed * 23.1), t: seed * 50, s: 0, ux: 0, uz: 1, fwd: 1, mv: 0, run: 0, sprint: 0, jk: 0, idle: 1, w: 0,
      acc: 0, accX: 0, tilt: 0, py: 0, pz: 0, crouch: 0, hk: 0, br: seed * 6, da: 0, dx: 0, wx: null, wz: 0, ph: null, sw: 0, hipY: null, L: 0, rd: 0, near: 0, still: 0, puff: 0, lookY: 0, lookX: 0,
      yaw: null, dyaw: 0, jock: false, own: null, pd: [0, 0], p0: [0, 0], st: [-1, -1], calm: 0 };
  }
  return m.gait;
}

// The body's heading. Call after placeModel (which sets the sim's facing) and before poseLegs. The model
// turns after the sim's facing at a body's pace; a defender moving slowly near the ball faces the ball
// instead. busy: he is on the ball or striking it, so the model stays tight to the sim. ball: the sim ball,
// or null for no ball to watch (celebrating, the dance). Not for your own first-person legs.
export function faceBody(m, p, dt, ball = null, busy = false) {
  const g = gaitOf(m), s = Math.hypot(p.vx, p.vz);
  let want = m.root.rotation.y, near = 0;
  if (s > 0.3) g.own = null;
  if (ball) {
    const dx = ball.x - p.x, dz = ball.z - p.z, d = Math.hypot(dx, dz), def = p.role === 'def', to = Math.atan2(dx, dz);
    g.jock = def && !busy && d > 0.6 && d < (g.jock ? 15 : 13) && s < (g.jock ? 3.5 : 2.7);
    // anyone left standing with the play gone round behind him turns to it (and stays turned till he moves)
    if (!def && !busy && g.still > 0.7 && d > 1.5 && Math.abs(wrap(to - (g.own ?? want))) > 1.15) g.own = to;
    if (g.jock) want = to; else if (g.own !== null) want = g.own;
    near = busy ? 0 : def ? 1 - smooth((d - 6) / 5) : 0.3 * (1 - smooth((d - 3) / 3));
  } else g.jock = false;
  g.near = near;
  if (g.yaw === null) g.yaw = want;
  const e = wrap(want - g.yaw), top = dt * (busy ? 40 : 11);
  g.dyaw = clamp(e * Math.min(1, dt * (busy ? 30 : 9)), -top, top);
  g.yaw += g.dyaw;
  m.root.rotation.y = g.yaw;
}

// How far the ankle moves (roll.z ahead, roll.y up) when the foot tips by th: toes down, it pivots on
// the ball of the foot and the heel comes up; toes up, it sits back on the heel.
function rollOver(th) {
  const c = 1 - Math.cos(th), s = Math.sin(th);
  if (th >= 0) { roll.z = TOE * c + SOLE * s; roll.y = TOE * s - SOLE * c; } else { roll.z = -HEEL * c + SOLE * s; roll.y = -HEEL * s - SOLE * c; }
}

// Hips, legs and feet. p: the sim player (velocity in world space); m.phase: his stride phase. Call after
// restPose (and faceBody) and before anything that sends a boot to the ball. Returns the gait state.
export function poseLegs(m, bn, p, dt) {
  const g = gaitOf(m), first = !!m.firstPerson, k = m.onBallK || 0;
  const ry = m.root.rotation.y, c = Math.cos(ry), sn = Math.sin(ry);
  // his velocity as he sees it: +z the way he faces, +x his left
  const vx = p.vx * c - p.vz * sn, vz = p.vx * sn + p.vz * c, s = Math.hypot(vx, vz), e = Math.min(1, dt * 10);
  if (g.wx === null) { g.wx = p.vx; g.wz = p.vz; }
  g.t += dt;
  if (dt > 0) {
    // how hard he is speeding up or turning (m/s2), on a spring: it tips him forward, back and into the
    // turn, and swings a little past as he settles
    const awx = (p.vx - g.wx) / dt, awz = (p.vz - g.wz) / dt, h = Math.min(dt, 0.04);
    g.da += (150 * (clamp(awx * sn + awz * c, -16, 16) - g.acc) - 16 * g.da) * h; g.acc += g.da * h;
    g.dx += (150 * (clamp(awx * c - awz * sn, -16, 16) - g.accX) - 16 * g.dx) * h; g.accX += g.dx * h;
    g.wx = p.vx; g.wz = p.vz;
    g.still = s < 0.3 ? g.still + dt : 0;
    g.rd += (g.near - g.rd) * Math.min(1, dt * 4);
    g.puff = clamp(g.puff + dt * (0.3 * g.sprint + 0.08 * g.run - 0.07), 0, 1);
  }
  g.s += (s - g.s) * e;
  if (s > 0.25) {
    // the way he travels eases round; at a crawl, or flipped right over, it jumps (the feet are under him then)
    const ex = g.ux + (vx / s - g.ux) * e * 1.2, ez = g.uz + (vz / s - g.uz) * e * 1.2, l = Math.hypot(ex, ez);
    if (g.s < 0.5 || l < 0.35) { g.ux = vx / s; g.uz = vz / s; } else { g.ux = ex / l; g.uz = ez / l; }
  }
  const fk = smooth((g.uz - 0.2) / 0.5), fwd = Math.max(0, g.uz), bwd = Math.max(0, -g.uz), lat = Math.abs(g.ux);
  const mv = g.mv = smooth((g.s - 0.12) / 0.6), idle = g.idle = 1 - mv;
  const run = g.run = smooth((g.s - 1.9) / 1.0) * fk, sprint = g.sprint = smooth((g.s - 4.2) / 3) * fk, jk = g.jk = mv * (1 - fk);
  const drive = clamp(g.acc / 10, 0, 1), brake = clamp(-g.acc / 10, 0, 1), rd = g.rd * idle;
  g.fwd = g.uz;

  // the cycle: the sim's, but a walk or a shuffle steps at its own rate, and he brakes in quick short steps
  const free = Math.max(mv * (1 - run), brake * brake) * (1 - k), rate = mix(strideRate(s), mix(7.5 + 1.9 * g.s, 3.5 + 1.88 * g.s, fk) + 7 * brake, free);
  if (g.ph === null) g.ph = m.phase; else g.ph += dt * rate;
  // back in step with the sim: hurrying to catch it up, or easing off a little to let it come round
  const off = wrap(m.phase - g.ph), pull = free < 0.02 && Math.abs(off) < 0.03 ? off : clamp(off * Math.min(1, dt * 10), -dt * 0.3 * rate, dt * 7) * (1 - free);
  g.ph += pull;
  const turn = dt > 0 ? Math.max(rate * 0.5, rate + pull / dt) : rate;      // how fast the legs really turn over (rad/s)
  const sph = Math.sin(g.ph), cph = Math.cos(g.ph);
  g.sw = -sph * mv;

  // a foot stays down for `duty` of the cycle and covers `travel` metres of ground in that time: as much
  // as the body does, so it doesn't slide, and no more than a leg can (then he is in the air between steps)
  const cover = g.s * TAU / turn, reach = mix(mix(0.38 + 0.12 * bwd, 0.92, fk), 0.88, run);
  const duty = clamp(reach / Math.max(0.01, cover), 0.2, mix(mix(0.5, 0.6, fk), mix(0.34, 0.27, sprint), run)), travel = Math.min(reach * 1.1, cover * duty);
  // where it lands ahead of him (a braking step lands further out, a driving one under him), and how it flies
  const front = travel * clamp(mix(mix(0.5, 0.38, fk), mix(0.31, 0.27, sprint), run) + 0.14 * brake - 0.1 * drive - 0.07 * k, 0.1, 0.6), back = travel - front;
  const lift = mix(mix(0.075, 0.05, fk), mix(0.2, 0.4, sprint), run), kickUp = 0.75 * run, over = mix(0.1, 0.2, sprint) * run;
  const side = mix(0.075, mix(0.04, P.hipX, k), run) + lat * (travel * 0.5 + 0.025) + 0.03 * bwd;
  // the foot's tilt as it lands (heel first walking forward, flatter running, toes first backing off) and as it leaves
  const thLand = -(mix(0.3, mix(0.1, -0.06, sprint), run) + 0.12 * brake) * fwd + 0.3 * bwd + 0.1 * lat, thOff = mix(1.05, 1.2, run) * fwd + 0.3 * (1 - fwd);
  // standing: the feet where he put them (each player his own width and stagger), wider and on his toes when ready;
  // the weight on one leg, changing sides every so often
  const w = g.w = first ? 0 : (2 * smooth(Math.sin(g.t * 0.23 + g.seed * 9) * 3 + 0.5) - 1) * (1 - rd);
  const wide = first ? P.hipX + 0.015 : mix(0.1 + 0.045 * g.a, 0.2, rd), stag = first ? 0 : (g.b - 0.5) * 0.13 * (1 - rd);
  if (!first) steps(g, dt, idle);
  const tilt = g.tilt = first ? 0 : clamp(g.accX * 0.028, -0.3, 0.3) * mv;      // leaning into a turn
  let grounded = 0, reachK = 0;
  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1, u = frac((g.ph - (i ? 0 : Math.PI)) / TAU + duty / 2);
    let z, th, up = 0, toe = 0;
    if (u < duty) {                                     // planted: from the front of the step to the back, rolling onto the toes
      const v = u / duty;
      z = front - travel * v;
      th = thLand * (1 - smooth(v / 0.22)) + thOff * clamp((v - mix(0.5, 0.35, run)) / mix(0.5, 0.65, run), 0, 1) ** mix(2.4, 1.6, run);
      toe = -Math.max(0, th) * 0.9;
      grounded++;
    } else {                                            // carried forward: the heel comes up behind, the knee drives through, the foot reaches out and is pulled back to land
      const v = (u - duty) / (1 - duty), b = clamp((v - 0.4) / 0.6, 0, 1);
      z = -back + travel * (1 - Math.cos(Math.PI * v)) / 2 + over * 4 * b * (1 - b);
      // on the ball the right boot is by the ball as it comes through, so the touch (game/strike.js) is the stride's own
      if (i && k > 0) reachK = k * run * Math.exp(-(((v - (frac(DRIBBLE.touchAt / TAU + duty / 2) - duty) / (1 - duty)) / 0.22) ** 2));
      up = lift * Math.sin(Math.PI * v) * (1 + kickUp * Math.cos(Math.PI * v));
      th = mix(thOff, thLand, smooth(v * 1.15)) + 0.4 * run * Math.sin(Math.PI * v);
      toe = -Math.max(0, th) * 0.9 * (1 - smooth(v * 4));
    }
    rollOver(th);
    // standing: where this foot was planted, turned with the pitch as the body turns over it, lifted while it steps round
    const d = g.pd[i], cd = Math.cos(d), sd2 = Math.sin(d), ix = sd * wide, iz = sd * stag, hop = g.st[i] >= 0 ? 0.05 * Math.sin(Math.PI * g.st[i]) : 0;
    const out = sd * (0.12 - 0.06 * run);                // toes turned out a little: the foot rolls along its own line
    AIR[i] = smooth(up / 0.15) * mv;
    T[i].set(mix(ix * cd + iz * sd2, sd * side + g.ux * z + roll.z * Math.sin(out), mv), mix(P.ankleY + hop + 0.012 * rd, P.ankleY + roll.y + up, mv), mix(-ix * sd2 + iz * cd, g.uz * z + roll.z * Math.cos(out) - 0.03 * sprint, mv));
    if (i && reachK > 0) { T[i].y = mix(T[i].y, TOUCH.y, reachK); T[i].z = mix(T[i].z, TOUCH.z, reachK); }
    PITCH[i] = mix(0.1 * rd + 0.25 * hop / 0.05, th, mv); YAW[i] = mix(sd * (0.2 + 0.14 * g.c) + d, out, mv);
    bn['toe' + LR[i]].rotation.x = toe * mv;
  }
  // the trunk's lean from speed (game/carriage.js lays the rest of it on); the pelvis takes a share of all of it
  g.L = (0.03 + 0.08 * run + 0.1 * sprint) * mv * fk + 0.012 * idle;
  g.crouch = 0.11 * jk + 0.15 * rd;                      // bent forward at the waist: backing off, side-stepping, ready
  const h = bn.hips, strike = m.strike;
  if (!first) {
    // the pelvis: tipped with the lean, turned with the stride (the leading leg's hip forward), dropped on the
    // swinging side, leant into a turn, and sat over the standing foot
    const over2 = -cph;         // over2: + while the left foot is the one planted
    let yaw = g.py = (0.1 + 0.07 * run) * g.sw * fk + idle * w * 0.05;
    // a strike opens the hips (the kicking side drawn back) and swings them through
    if (strike) { const open = -0.22 * Math.min(1, strike.wind / 0.06), after = strike.t - strike.wind; yaw += after < 0 ? open * smooth(2 * strike.t / strike.wind) : mix(open, 0.2, smooth(after / 0.12)) * (1 - smooth((after - 0.14) / 0.2)); }
    g.pz = idle * w * 0.055 + mv * (0.05 - 0.025 * run) * over2;
    h.rotation.set(0.25 * (g.L + g.crouch + clamp(g.acc * 0.02, -0.24, 0.3)), yaw, g.pz - tilt * 0.8);
    h.position.x += idle * w * 0.04 + mv * (0.02 - 0.012 * run) * over2 + tilt * 0.7;       // (he leans from the feet: the hips go inside them)
    h.position.z -= 0.35 * g.crouch;                    // bent at the waist, the hips sit back over the heels
  }
  // the hips ride on the legs: over the standing leg and down between steps walking; down as a runner's
  // leg takes his weight and up through the air; lower still driving off, braking, backing off or ready
  const rest = h.userData.rest.y, c2 = cph * cph - sph * sph;
  const dip = 0.016 * (travel / 0.9) ** 2 * fk;
  const moving = mix(rest - 0.012 - dip * (1 - c2) - 0.035 * (1 - fk), rest - 0.05 - 0.015 * sprint - mix(0.036, 0.022, sprint) * c2 * (grounded ? 1 : 0.8), run);
  const want = mix(rest - 0.008 - 0.004 * Math.abs(w) - 0.075 * rd + 0.006 * rd * Math.sin(g.t * 5.2 + g.seed * 9), moving, mv) - 0.03 * drive - 0.06 * brake - 0.02 * k * run;      // (and he sinks as he stops, then comes up)
  let low = 9;
  fw.set(0, 0, 1).applyQuaternion(h.quaternion);
  for (let i = 0; i < 2; i++) {
    hj.set(i ? -P.hipX : P.hipX, -0.02, 0).applyQuaternion(h.quaternion);
    // a foot off the ground swings in line with its own hip, the way the pelvis faces (so the knee tracks
    // straight instead of folding in or out), and comes in to land
    T[i].x = mix(T[i].x, h.position.x + hj.x + (T[i].z - h.position.z - hj.z) * fw.x / Math.max(0.5, fw.z), AIR[i] * fk);
    // how high the hips can be and both ankles still be reached
    const dx = T[i].x - h.position.x - hj.x, dz = T[i].z - h.position.z - hj.z;
    low = Math.min(low, T[i].y - hj.y + Math.sqrt(Math.max(0.01, REACH * REACH - dx * dx - dz * dz)));
  }
  const hipY = Math.min(want, low);
  g.hipY = g.hipY === null ? hipY : dt > 0 ? g.hipY + (hipY - g.hipY) * Math.min(1, dt * 30) : g.hipY;
  h.position.y = Math.min(g.hipY, low);
  for (let i = 0; i < 2; i++) {
    reachLeg(bn, LR[i], T[i]);
    aimFoot(bn, LR[i], q.setFromEuler(eul.set(PITCH[i], YAW[i], 0)));
  }
  return g;
}

// Standing feet stay where they were planted while the body turns over them (g.pd: how far round each
// is from where the body now faces); when that is too far, or the turn has stopped short, they step
// round one at a time, the foot on the side he turned to first.
function steps(g, dt, idle) {
  if (idle < 0.5) { g.pd[0] = g.pd[1] = 0; g.st[0] = g.st[1] = -1; return; }
  g.calm = Math.abs(g.dyaw) > dt * 0.3 ? 0 : g.calm + dt;
  for (let i = 0; i < 2; i++) {
    if (g.st[i] < 0) { g.pd[i] = clamp(wrap(g.pd[i] - g.dyaw), -0.7, 0.7); continue; }   // past that the planted foot swivels
    g.st[i] += dt / 0.2;
    g.p0[i] = clamp(wrap(g.p0[i] - g.dyaw), -1.2, 1.2);
    if (g.st[i] >= 1) { g.st[i] = -1; g.pd[i] = 0; } else g.pd[i] = g.p0[i] * (1 - smooth(g.st[i]));
  }
  if (g.st[0] >= 0 || g.st[1] >= 0) return;
  const a0 = Math.abs(g.pd[0]), a1 = Math.abs(g.pd[1]), i = Math.abs(a0 - a1) < 0.05 ? (g.pd[0] < 0 ? 0 : 1) : a0 > a1 ? 0 : 1, a = Math.max(a0, a1);
  if (a > 0.45 || (a > 0.1 && g.calm > 0.3)) { g.st[i] = 0; g.p0[i] = g.pd[i]; }
}
