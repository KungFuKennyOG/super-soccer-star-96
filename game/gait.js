// How a player stands, walks and runs. The feet lead: each foot follows a path over the ground (planted
// while it bears weight and carried through the air to the next step) and the legs are bent to put the
// ankles there (game/legik.js). A planted foot moves back under the body at the body's own speed, in the
// direction it is really travelling, so feet grip the pitch whether he runs forward, backs off or steps
// sideways. The hips ride on the standing leg; pelvis and shoulders turn against each other with the
// stride; the body leans into speed, acceleration and turns; arms swing from walking straight to pumping
// bent; the head watches the ball. Standing, the weight rests on one leg and shifts now and then.
//
// The cycle is the sim's own (p.stride, rules/dribble.js), so a touch in the sim is still the right
// boot's moment: the right foot is planted round phase 0 and swings forward through phase pi.
// Strikes, touches and holds (game/strike.js) are laid over this afterwards.
import * as THREE from 'three';
import { P } from './body.js';
import { reachLeg, aimFoot } from './legik.js';
import { strideRate } from '../rules/dribble.js';
import { DRIBBLE } from '../rules/tuning.js';

const TAU = Math.PI * 2, LEG = 0.845;                    // hip joint to ankle, straight (m)
const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const mix = (a, b, k) => a + (b - a) * k, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const frac = x => x - Math.floor(x);
const eul = new THREE.Euler(0, 0, 0, 'YXZ'), q = new THREE.Quaternion(), T = { L: new THREE.Vector3(), R: new THREE.Vector3() };

function stateOf(m) {
  if (!m.gait) {
    const seed = frac((m.phase || 0) * 7.13 + 0.37);
    m.gait = { seed, s: 0, ux: 0, uz: 1, hipY: null, lean: 0, roll: 0, vx: 0, vz: 0, lookY: 0, lookX: 0, t: seed * 50, f: 0, mv: 0, run: 0, sprint: 0 };
  }
  return m.gait;
}

// Legs, feet and hips. p: the sim player (velocity in world space); m.phase: his stride phase.
// Call after restPose and before anything that sends a boot to the ball. Returns the gait state.
export function poseLegs(m, bn, p, dt) {
  const g = stateOf(m), ry = m.root.rotation.y, c = Math.cos(ry), sn = Math.sin(ry), k = m.onBallK || 0;
  // his velocity as he sees it: +z the way he faces, +x his left
  const vx = p.vx * c - p.vz * sn, vz = p.vx * sn + p.vz * c, s = Math.hypot(vx, vz), e = Math.min(1, dt * 12);
  g.t += dt;
  if (dt > 0) {
    // how hard he is speeding up or turning (m/s2), eased: it tips him forward, back and into the turn
    const ax = (vx - g.vx) / dt, az = (vz - g.vz) / dt, h = Math.min(1, dt * 5);
    g.lean += (clamp(az, -9, 9) - g.lean) * h; g.roll += (clamp(ax, -9, 9) - g.roll) * h;
    g.vx = vx; g.vz = vz;
  }
  g.s += (s - g.s) * e;
  if (s > 0.25) { g.ux += (vx / s - g.ux) * e; g.uz += (vz / s - g.uz) * e; const l = Math.hypot(g.ux, g.uz) || 1; g.ux /= l; g.uz /= l; }
  const mv = g.mv = smooth((g.s - 0.15) / 0.75), run = g.run = smooth((g.s - 1.6) / 2.6), sprint = g.sprint = smooth((g.s - 4) / 3.2), fwd = Math.max(0, g.uz);
  // one cycle takes `period` seconds; a foot stays down for `duty` of it, as long as the leg can cover
  const period = TAU / strideRate(g.s), reach = mix(0.6, 0.84, sprint) * mix(0.6, 1, fwd);
  const duty = clamp(1.15 * reach / Math.max(0.01, g.s * period), 0.24, 0.6), travel = Math.min(reach, g.s * duty * period);
  // a runner lands a little ahead of himself and pushes off far behind; a walker is even
  const front = travel * mix(0.5, 0.4, run), back = travel - front, lift = mix(0.06, 0.34, sprint) * mix(0.45, 1, fwd) + 0.05 * run;
  const side = mix(P.hipX * 0.8, P.hipX * mix(0.62, 1, k), run);            // runners' feet land nearer the middle (not on the ball: they run either side of it)
  // standing: the weight on one leg, changing sides every so often
  const w = 2 * smooth(Math.sin(g.t * 0.23 + g.seed * 9) * 3 + 0.5) - 1, idle = 1 - mv;
  let low = 9, zL = 0, zR = 0, grounded = 0, press = 0;
  for (const n of ['L', 'R']) {
    const sd = n === 'L' ? 1 : -1, u = frac((m.phase - (n === 'L' ? Math.PI : 0)) / TAU + duty / 2);
    let z, y = P.ankleY, pitch, toe = 0;
    if (u < duty) {                                     // planted: from the front of the step to the back, then up onto the toes
      const v = u / duty, heel = mix(0.28, 0.04, run) * fwd, off = mix(0.5, 0.95, sprint);
      z = front * (1 - 0.3 * k) - (front * (1 - 0.3 * k) + back) * v;
      pitch = -heel * (1 - smooth(v / 0.3)) + off * smooth((v - 0.5) / 0.5) * fwd;
      y += 0.1 * Math.sin(Math.max(0, pitch)); toe = -Math.max(0, pitch) * 0.85;
      if (mv > 0.5) { grounded++; press = Math.max(press, Math.sin(Math.PI * v)); }
    } else {                                            // carried forward: the heel comes up behind, the knee drives through, the foot reaches out
      const v = (u - duty) / (1 - duty), ease = (1 - Math.cos(Math.PI * v)) / 2, off = mix(0.5, 0.95, sprint) * fwd;
      z = -back + (back + front * (1 - 0.3 * k)) * ease;
      // on the ball the right boot reaches for it as it comes through, so the touch (game/strike.js) is the stride's own
      if (n === 'R' && k > 0) { const vt = (frac(DRIBBLE.touchAt / TAU + duty / 2) - duty) / (1 - duty); z += 0.125 * k * run * Math.exp(-(((v - vt) / 0.2) ** 2)); }
      y += lift * Math.sin(Math.PI * v) * (1 + 0.55 * run * Math.cos(Math.PI * v)) + 0.1 * Math.sin(off) * (1 - v) ** 2;
      pitch = mix(off, -mix(0.28, 0.04, run) * fwd, smooth(v * 1.15)) + 0.35 * run * Math.sin(Math.PI * v);
    }
    // standing: the weight-bearing foot under him, the other out to the side and a little ahead, toes turned out
    const mine = sd === (w > 0 ? 1 : -1), a = Math.abs(w);
    const ix = sd * mix(P.hipX + 0.015, mine ? P.hipX * 0.72 : P.hipX + 0.06, a), iz = mix(0, mine ? -0.03 : 0.07, a);
    const t = T[n].set(mix(ix, sd * side + g.ux * z, mv), mix(P.ankleY, y, mv), mix(iz, g.uz * z - 0.04 * sprint, mv));
    low = Math.min(low, t.y + Math.sqrt(Math.max(0.01, (LEG * 0.992) ** 2 - (t.x - sd * P.hipX) ** 2 - t.z ** 2)));   // how high the hip can be and still reach it
    if (n === 'L') zL = z; else zR = z;
    bn['toe' + n].rotation.x = toe * mv;
    T[n].pitch = pitch * mv; T[n].yaw = sd * mix(mix(0.2, mine ? 0.12 : 0.34, a), 0.1 - 0.06 * run, mv);
  }
  g.f = travel > 0.05 ? clamp((zR - zL) / travel, -1, 1) * mv : 0;          // + when the right foot leads (so the left arm does)
  // the hips ride on the standing leg: lowest as it takes the weight, up through the air between steps
  const rest = bn.hips.userData.rest.y, want = rest - mix(0.005, 0.05, run) - 0.035 * press * run + (grounded ? 0 : 0.03 * run * mv);
  const hipY = Math.min(want, low + 0.02);
  g.hipY = g.hipY === null || dt <= 0 ? (g.hipY ?? hipY) : g.hipY + (hipY - g.hipY) * Math.min(1, dt * 28);
  bn.hips.position.y = Math.min(g.hipY, low + 0.02);
  if (!m.firstPerson) {
    // the pelvis turns with the stride (the leading leg's hip forward), drops on the swinging side, and sits over the standing foot
    bn.hips.rotation.y = 0.17 * g.f;
    const over = -Math.cos(m.phase);                     // + while the left foot is the one planted
    bn.hips.position.x += idle * w * 0.034 + (1 - run) * mv * 0.018 * over;
    bn.hips.rotation.z = idle * w * 0.05 + mv * (1 - 0.5 * run) * 0.04 * over;
  }
  for (const n of ['L', 'R']) {
    reachLeg(bn, n, T[n]);
    aimFoot(bn, n, q.setFromEuler(eul.set(T[n].pitch, T[n].yaw, 0)));
  }
  g.w = w;
  return g;
}

// Everything above the hips. g: what poseLegs returned; ball: the sim ball or null; kick: how much of a
// strike the pose is (0..1, game/strike.js).
export function poseUpper(m, bn, p, dt, t, g, ball, kick) {
  const { mv, run, sprint, f, w } = g, idle = 1 - mv, br = Math.sin(t * 1.7 + g.seed * 20);
  // lean: into his speed, further as he accelerates, back as he brakes, and into a turn
  const lean = Math.min(0.24, g.s * 0.03) * Math.max(0.2, g.uz) + clamp(g.lean * 0.014, -0.1, 0.13) + 0.012 * idle;
  const tilt = clamp(g.roll * 0.016, -0.14, 0.14);
  bn.spine.rotation.set(lean * 0.6 + 0.012 * br * idle, 0, -tilt * 0.6 - bn.hips.rotation.z * 0.8);
  bn.chest.rotation.set(lean * 0.4 + 0.012 * br * idle, -bn.hips.rotation.y * (1.75 + 0.2 * sprint), -tilt * 0.4 - idle * w * 0.02);
  // the head: level whatever the body does, and on the ball
  let ly = 0, lx = 0;
  if (ball) {
    const ry = m.root.rotation.y, c = Math.cos(ry), sn = Math.sin(ry), dx = ball.x - m.root.position.x, dz = ball.z - m.root.position.z;
    const bx = dx * c - dz * sn, bz = dx * sn + dz * c, d = Math.hypot(bx, bz);
    if (d > 0.3) { ly = clamp(Math.atan2(bx, bz), -1.15, 1.15) * mix(1, 0.55, sprint); lx = clamp(Math.atan2(1.62 - (ball.y ?? 0.11), d) - 0.1, -0.25, 0.6) * 0.75; }
  }
  const h = dt > 0 ? Math.min(1, dt * 7) : 0;
  g.lookY += (ly - g.lookY) * h; g.lookX += (lx - g.lookX) * h;
  const yaw = g.lookY - bn.hips.rotation.y - bn.chest.rotation.y;          // the neck undoes the shoulders' twist first
  bn.neck.rotation.set(-lean * 0.55 + g.lookX * 0.5 + 0.02 * idle, yaw * 0.55, tilt * 0.5);
  bn.head.rotation.set(g.lookX * 0.5 - lean * 0.25, yaw * 0.45, tilt * 0.3);
  // arms: hanging loose when he stands, swinging from the shoulder as he walks, bent and pumping as he runs,
  // each opposite its leg; the hand that comes forward closes on the chest's middle
  for (const n of ['L', 'R']) {
    const sd = n === 'L' ? 1 : -1, a = sd * f, own = frac(g.seed * (n === 'L' ? 3.1 : 5.7));     // a: + as this arm comes forward
    const sway = 0.03 * Math.sin(t * 0.8 + own * 9) * idle;
    const swing = a * (0.3 * mv + 0.3 * run + 0.42 * sprint) - 0.16 * run + 0.06 * a * a * sprint;
    const elbow = mix(0.2 + 0.12 * own, 0.45, mv) + (0.95 + 0.2 * a) * run + 0.12 * Math.max(0, a) * sprint;
    bn['upperArm' + n].rotation.set(-swing - 0.05 * idle + sway, -sd * (0.2 + 0.22 * run + 0.15 * Math.max(0, a) * run), sd * (0.07 + 0.03 * own * idle + 0.06 * run));
    bn['foreArm' + n].rotation.set(-elbow, -sd * 0.12 * idle, 0);
    bn['hand' + n].rotation.set(-0.18 - 0.12 * run, 0, sd * 0.1 * idle);
    bn['clavicle' + n].rotation.set(0, sd * 0.07 * a * run, sd * (0.03 * br * idle + 0.05 * Math.abs(a) * run));
  }
  if (kick) {                                            // the far arm goes out as he strikes, the shoulders open
    bn.upperArmL.rotation.z += 0.66 * kick; bn.upperArmL.rotation.x *= 1 - kick; bn.foreArmL.rotation.x *= 1 - 0.5 * kick;
    bn.upperArmR.rotation.x += 0.35 * kick; bn.spine.rotation.y = -0.25 * kick; bn.spine.rotation.x += 0.06 * kick;
  }
}
