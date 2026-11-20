// The PS2-look body, on the game's skeleton. Built the way a modeller would block out a footballer, not
// from round tubes: every cross-section has its own front, back, inner and outer radius, limbs follow
// the bones' natural curve, and muscles are laid on top (pectorals, shoulder blades, quadriceps, the
// teardrop over the knee, a calf that sits high and to the inside, the forearm's bulk below the elbow).
// The kit is cloth over that: a loose shirt hanging from the chest and shoulder blades in real folds,
// set-in sleeves that leave the shoulder at an angle and droop to the elbow, wide shorts falling from
// the hips with an open hem, socks over a shin guard. Hands have four fingers and a thumb.
import { P } from '../body.js';
import { R, SPAN, HEAD_SHEET } from './kit.js';
import { Builder } from './build.js';
import { addHead } from './headgeo.js';
import { sstep } from './paint.js';

const v = (span, y) => (span[0] - y) / (span[0] - span[1]);
const ang = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// muscles and hollows on a section: { a: angle (0 = front, a quarter turn = his left), aw, y, yw, d }
const bumps = list => (a, r) => {
  let d = 0;
  for (const m of list) d += m.d * Math.max(0, 1 - (ang(a, m.a) / m.aw) ** 2) * Math.max(0, 1 - ((r.c[1] - m.y) / m.yw) ** 2);
  return d;
};
const out = (a, d) => [Math.sin(a) * d, 0, Math.cos(a) * d];
// cloth hanging in folds: deeper toward the hem, never the same twice round
// (it only ever billows outward, so it can't cut into what's underneath)
const drape = (a, k, seed) => k * (0.75 + 0.55 * Math.sin(a * 5 + seed) + 0.3 * Math.sin(a * 8 + seed * 2.3) + 0.25 * Math.sin(a * 3 + seed * 0.7));

const cache = new Map();
export function figureGeometry(style = 0) {
  if (cache.has(style)) return cache.get(style);
  const b = new Builder();
  torso(b);
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) { leg(b, s, n); arm(b, s, n); }
  b.part(HEAD_SHEET);                                   // the head and hair: second material, their own sheet
  addHead(b, style);
  const g = b.geometry();
  cache.set(style, g);
  return g;
}

function torso(b) {
  // shirt: [y, half width, depth in front, depth behind, squareness]
  const S = [
    [1.566, 0.073, 0.086, 0.066, 2], [1.546, 0.078, 0.09, 0.07, 2], [1.53, 0.108, 0.094, 0.085, 2], [1.512, 0.14, 0.1, 0.097, 2.1], [1.485, 0.186, 0.112, 0.108, 2.3],
    [1.45, 0.19, 0.134, 0.126, 2.5], [1.39, 0.186, 0.15, 0.132, 2.6], [1.33, 0.18, 0.147, 0.128, 2.6], [1.26, 0.172, 0.138, 0.118, 2.5],
    [1.18, 0.166, 0.13, 0.106, 2.4], [1.09, 0.163, 0.126, 0.099, 2.4], [1.0, 0.166, 0.126, 0.111, 2.4], [0.93, 0.172, 0.128, 0.132, 2.4],
    [0.88, 0.178, 0.132, 0.142, 2.4], [0.888, 0.162, 0.116, 0.127, 2.4],                    // the hem, turned under
  ];
  const form = bumps([
    { a: 0.52, aw: 0.55, y: 1.385, yw: 0.075, d: 0.009 }, { a: -0.52, aw: 0.55, y: 1.385, yw: 0.075, d: 0.009 },   // pectorals
    { a: 0, aw: 0.16, y: 1.4, yw: 0.09, d: -0.005 },                                                              // the groove between them
    { a: 2.55, aw: 0.5, y: 1.42, yw: 0.075, d: 0.009 }, { a: -2.55, aw: 0.5, y: 1.42, yw: 0.075, d: 0.009 },       // shoulder blades
    { a: 1.95, aw: 0.45, y: 1.32, yw: 0.09, d: 0.006 }, { a: -1.95, aw: 0.45, y: 1.32, yw: 0.09, d: 0.006 },       // lats
    { a: Math.PI, aw: 0.28, y: 1.25, yw: 0.26, d: -0.007 },                                                       // the spine
  ]);
  const w = p => {
    const y = p[1], side = sstep(0.07, 0.19, Math.abs(p[0])) * sstep(1.4, 1.49, y) * 0.5, cl = p[0] > 0 ? 'clavicleL' : 'clavicleR';
    const nk = sstep(1.5, 1.555, y) * 0.7, ch = sstep(1.1, 1.3, y), sp = sstep(0.9, 1.08, y);
    return { neck: nk, [cl]: side * (1 - nk), chest: ch * (1 - nk) * (1 - side), spine: (1 - ch) * sp, hips: (1 - ch) * (1 - sp) };
  };
  // (the first two rings are the collar: a band standing round the neck, on the collar's rows of the sheet)
  b.loft(S.map(([y, rx, f, bk, n], i) => ({ c: [0, y, 0.004 + (i < 2 ? 0.004 : 0)], rx, rz: [f, bk], n, v: i === 0 ? 0 : i === 1 ? 0.03 : i === S.length - 1 ? 0.995 : Math.max(0.045, v(SPAN.shirt, y)), w })), R.shirt, {
    seg: 30, a0: -Math.PI / 2,
    // below the chest the shirt hangs free of the body
    shape: (a, r) => out(a, form(a, r) + drape(a, 0.009 * sstep(1.3, 0.89, r.c[1]) ** 1.3, 0.9)),
  });
  // the seat of the shorts, between and above the legs
  const PV = [[1.0, 0.16, 0.11, 0.112], [0.93, 0.166, 0.114, 0.122], [0.86, 0.15, 0.1, 0.114], [0.815, 0.11, 0.06, 0.07], [0.795, 0.07, 0.03, 0.035]];
  b.loft(PV.map(([y, rx, f, bk]) => ({ c: [0, y, 0], rx, rz: [f, bk], n: 2.4, v: v(SPAN.pelvis, y), w: { hips: 1 } })), R.pelvis, { seg: 14, a0: Math.PI, capEnd: true });
}

function leg(b, s, n) {
  const up = 'upperLeg' + n, lo = 'lowerLeg' + n, ft = 'foot' + n, toe = 'toe' + n, lx = s * P.hipX, mirror = s < 0;
  const io = (o, i) => (s > 0 ? [o, i] : [i, o]);        // outer and inner radius → toward +x and away from it
  // shorts leg: [y, centre out from the middle, outer, inner, front, back]. Wide, falling from the hips in folds.
  const SH = [[0.92, 0.075, 0.09, 0.075, 0.1, 0.116, { hips: 0.7, [up]: 0.3 }], [0.86, 0.08, 0.096, 0.084, 0.108, 0.138, { hips: 0.35, [up]: 0.65 }], [0.78, 0.088, 0.103, 0.094, 0.116, 0.133, { [up]: 1 }],
    [0.7, 0.094, 0.107, 0.1, 0.121, 0.123, { [up]: 1 }], [0.65, 0.098, 0.11, 0.102, 0.124, 0.123, { [up]: 1 }], [0.615, 0.1, 0.113, 0.104, 0.127, 0.125, { [up]: 1 }], [0.622, 0.098, 0.097, 0.088, 0.11, 0.108, { [up]: 1 }]];
  b.loft(SH.map(([y, cx, o, i, f, bk, w], k) => ({ c: [s * cx, y, 0.004], rx: io(o, i), rz: [f, bk], n: 2.2, v: k === SH.length - 1 ? 0.995 : v(SPAN.shorts, y), w })), s > 0 ? R.shortsL : R.shortsR, {
    seg: 16, a0: Math.PI, shape: (a, r) => out(a, drape(a, 0.008 * sstep(0.9, 0.62, r.c[1]), 2 + s)) });
  // thigh and knee: [y, outer, inner, front, back, how far forward]
  const knee = y => { const k = sstep(P.kneeY + 0.04, P.kneeY - 0.04, y); return { [up]: 1 - k, [lo]: k }; };
  const TH = [[0.69, 0.1, 0.086, 0.106, 0.1, 0.012], [0.63, 0.097, 0.086, 0.104, 0.096, 0.015], [0.59, 0.088, 0.081, 0.095, 0.086, 0.017], [0.555, 0.076, 0.072, 0.08, 0.071, 0.017],
    [P.kneeY, 0.067, 0.066, 0.071, 0.06, 0.016], [0.497, 0.064, 0.062, 0.064, 0.06, 0.01], [0.475, 0.062, 0.06, 0.06, 0.062, 0.005]];
  const thigh = bumps([{ a: s * 0.35, aw: 0.9, y: 0.65, yw: 0.09, d: 0.006 },                                        // the quadriceps' outer head
    { a: -s * 0.6, aw: 0.6, y: 0.562, yw: 0.035, d: 0.009 },                                                        // the teardrop inside the knee
    { a: 0, aw: 0.55, y: P.kneeY, yw: 0.024, d: 0.007 }, { a: 0, aw: 0.5, y: 0.492, yw: 0.016, d: -0.004 },          // kneecap, the dip under it
    { a: Math.PI, aw: 0.5, y: P.kneeY, yw: 0.03, d: -0.006 }, { a: Math.PI - s * 0.7, aw: 0.4, y: 0.56, yw: 0.05, d: 0.005 }]);   // hollow behind the knee, hamstring tendon
  const t0 = b.pos.length / 3;
  b.loft(TH.map(([y, o, i, f, bk, z]) => ({ c: [lx, y, z], rx: io(o, i), rz: [f, bk], v: v(SPAN.thigh, y), w: knee(y) })), R.thigh, { seg: 12, a0: Math.PI, mirror, shape: (a, r) => out(a, thigh(a, r)) });
  b.soft.push([t0, b.pos.length / 3, 0.45]);
  // lower leg in its sock: turned over at the top, the calf high behind and fuller inside, a straight shin under the guard, a slim ankle
  const ankle = y => { const k = sstep(P.ankleY + 0.03, P.ankleY - 0.015, y), kn = sstep(P.kneeY + 0.02, P.kneeY - 0.05, y); return { [up]: (1 - kn), [lo]: kn * (1 - k), [ft]: k }; };
  const SK = [[0.486, 0.066, 0.064, 0.063, 0.066, 0.004], [0.478, 0.072, 0.07, 0.069, 0.072, 0.004], [0.452, 0.073, 0.071, 0.07, 0.073, 0.003], [0.444, 0.068, 0.066, 0.065, 0.07, 0.002],
    [0.41, 0.068, 0.068, 0.064, 0.078, 0], [0.37, 0.07, 0.072, 0.064, 0.088, -0.002], [0.325, 0.066, 0.069, 0.062, 0.085, -0.003], [0.27, 0.057, 0.057, 0.059, 0.07, -0.003],
    [0.21, 0.049, 0.049, 0.056, 0.058, -0.002], [0.15, 0.042, 0.042, 0.047, 0.048, 0], [0.105, 0.039, 0.039, 0.043, 0.045, 0], [0.06, 0.04, 0.04, 0.043, 0.045, 0.002]];
  const calf = bumps([{ a: Math.PI - s * 0.75, aw: 0.7, y: 0.345, yw: 0.07, d: 0.007 }, { a: Math.PI + s * 0.7, aw: 0.6, y: 0.375, yw: 0.06, d: 0.006 },   // inner head lower and fuller, outer head higher
    { a: 0, aw: 0.7, y: 0.31, yw: 0.13, d: 0.006 }, { a: Math.PI, aw: 0.7, y: 0.14, yw: 0.06, d: -0.004 }]);                                             // shin guard, the tendon above the heel
  b.loft(SK.map(([y, o, i, f, bk, z]) => ({ c: [lx, y, z], rx: io(o, i), rz: [f, bk], v: v(SPAN.sock, y), w: ankle(y) })), R.sock, { seg: 12, a0: Math.PI, mirror, shape: (a, r) => out(a, calf(a, r)) });
  // boot: lofted heel to toe. [z, half width, half height, centre height]
  const BT = [[-0.08, 0.016, 0.022, 0.03], [-0.068, 0.034, 0.045, 0.04], [-0.036, 0.042, 0.051, 0.044], [0.005, 0.045, 0.05, 0.043], [0.045, 0.048, 0.041, 0.035], [0.09, 0.052, 0.032, 0.027], [0.14, 0.05, 0.027, 0.023], [0.182, 0.042, 0.023, 0.02], [0.206, 0.027, 0.016, 0.014]];
  const bw = p => { const k = sstep(0.07, 0.12, p[2]); return { [ft]: 1 - k, [toe]: k }; };
  b.loft(BT.map(([z, hw, hh, cy], i) => ({ c: [lx, cy, z], rx: hw, rz: hh, n: 2.6, v: i / (BT.length - 1), w: bw })), R.boot, { seg: 12, a0: Math.PI, mirror, ax: [1, 0, 0], az: [0, 1, 0], capStart: true, capEnd: true,
    shape: (a, r) => (Math.cos(a) < -0.5 ? [0, (-Math.cos(a) - 0.5) * r.rz * 0.5, 0] : null) });   // a flat sole
}

function arm(b, s, n) {
  const ua = 'upperArm' + n, fa = 'foreArm' + n, hd = 'hand' + n, cl = 'clavicle' + n, ax = s * P.shoulderX, ay = P.shoulderY, mirror = s < 0;
  const io = (o, i) => (s > 0 ? [o, i] : [i, o]);
  // Set-in sleeve. Its first ring is the seam round the shoulder, tilted so its top sits on the end of the
  // shoulder and its bottom in the armpit; the rings turn level as they go down the arm, wider than the arm
  // so the cloth hangs off it. [tilt (deg), centre out and down from the joint, across, depth, weights]
  const SL = [[64, -0.036, -0.058, 0.074, 0.076, { chest: 0.55, [cl]: 0.35, [ua]: 0.1 }], [46, -0.008, -0.07, 0.071, 0.078, { [cl]: 0.45, [ua]: 0.45, chest: 0.1 }], [26, -0.004, -0.108, 0.064, 0.076, { [ua]: 0.82, [cl]: 0.18 }],
    [9, -0.002, -0.156, 0.063, 0.074, { [ua]: 1 }], [0, 0, -0.205, 0.064, 0.074, { [ua]: 1 }], [0, 0.002, -0.25, 0.067, 0.076, { [ua]: 1 }], [0, 0.002, -0.243, 0.055, 0.059, { [ua]: 1 }]];
  b.loft(SL.map(([deg, dx, dy, rx, rz, w], i) => {
    const t = deg * Math.PI / 180;
    return { c: [ax + s * dx, ay + dy, 0], rx, rz, n: 2.15, ax: [Math.cos(t), s * Math.sin(t), 0], v: i === SL.length - 1 ? 0.995 : i / (SL.length - 2), w };
  }), R.sleeve, { seg: 12, a0: Math.PI, mirror, capStart: true, shape: (a, r) => out(a, drape(a, 0.006 * sstep(1.4, 1.2, r.c[1]), 4 + s)) });

  // arm: [down from the shoulder, outer, inner, front, back, forward]
  const armW = dy => { const e = sstep(P.elbowDY + 0.04, P.elbowDY - 0.04, dy), h = sstep(P.wristDY + 0.02, P.wristDY - 0.02, dy); return { [ua]: 1 - e, [fa]: e * (1 - h), [hd]: h }; };
  const AR = [[-0.2, 0.056, 0.054, 0.06, 0.058, 0], [-0.265, 0.054, 0.052, 0.058, 0.056, 0], [-0.292, 0.048, 0.047, 0.05, 0.053, -0.003], [P.elbowDY, 0.046, 0.045, 0.045, 0.053, -0.005],
    [-0.34, 0.052, 0.046, 0.05, 0.05, -0.003], [-0.385, 0.05, 0.044, 0.049, 0.046, 0], [-0.44, 0.043, 0.04, 0.043, 0.041, 0.003], [-0.5, 0.034, 0.032, 0.036, 0.034, 0.006], [P.wristDY + 0.006, 0.025, 0.024, 0.034, 0.032, 0.008],
    [-0.578, 0.017, 0.017, 0.036, 0.034, 0.01], [-0.605, 0.018, 0.018, 0.045, 0.041, 0.011], [-0.638, 0.017, 0.017, 0.046, 0.042, 0.012], [-0.654, 0.013, 0.014, 0.043, 0.04, 0.012]];
  const muscle = bumps([{ a: 0, aw: 0.8, y: ay - 0.25, yw: 0.045, d: 0.005 }, { a: Math.PI, aw: 0.8, y: ay - 0.24, yw: 0.05, d: 0.004 }, { a: s * 0.9, aw: 0.7, y: ay - 0.355, yw: 0.045, d: 0.005 }]);   // biceps, triceps, the forearm's outer bulk
  b.loft(AR.map(([dy, o, i, f, bk, z]) => ({ c: [ax + s * 0.004, ay + dy, z], rx: io(o, i), rz: [f, bk], n: dy < -0.57 ? 2.6 : 2, v: v(SPAN.arm, dy), w: armW(dy) })), R.arm, { seg: 12, a0: Math.PI, mirror, capEnd: true, shape: (a, r) => out(a, muscle(a, r)) });
  // fingers: four, each its own, hanging loosely curled toward the palm. [across the palm, length, thickness]
  const H = { [hd]: 1 }, FG = [[0.036, 0.066, 0.0092], [0.016, 0.075, 0.0098], [-0.005, 0.07, 0.0094], [-0.025, 0.056, 0.0084]];
  for (const [z, len, r] of FG) {
    const curl = 0.5 + 0.45 * (0.036 - z) / 0.061;                                          // the little finger curls most
    b.loft([0, 0.38, 0.72, 1].map(f => ({ c: [ax + s * (0.004 - len * curl * f * f * 0.7), ay - 0.646 - len * f * (1 - 0.25 * curl * f), 0.012 + z], rx: r * (1 - 0.3 * f), rz: r * (1 - 0.25 * f), v: v(SPAN.arm, -0.66 - 0.06 * f), w: H })), R.arm, { seg: 5, a0: Math.PI, mirror, capEnd: true });
  }
  const TB = [[-0.582, 0.04, 0.014, 0], [-0.61, 0.056, 0.0135, 0.004], [-0.64, 0.066, 0.0115, 0.01], [-0.664, 0.069, 0.007, 0.016]];   // thumb: off the front edge of the palm, turned in
  b.loft(TB.map(([dy, z, rad, inx]) => ({ c: [ax + s * (0.002 - inx), ay + dy, z], rx: rad * 0.9, rz: rad, v: v(SPAN.arm, dy - 0.02), w: H })), R.arm, { seg: 6, a0: Math.PI, mirror, capEnd: true });
}
