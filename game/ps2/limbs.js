// The PS2-look figure's legs and arms (figure.js has the trunk and the shorts). Limbs follow the bones'
// natural line with a different radius front, back, inside and outside, and the muscles laid on top:
// quadriceps and the teardrop over the knee, a calf that sits high and to the inside, the forearm's
// bulk below the elbow. Socks over a shin guard, boots lofted heel to toe. The sleeve is set into the
// shoulder; the hand hangs half closed, turned the way a hanging hand turns, with four fingers and a thumb.
import { P } from '../body.js';
import { R, SPAN } from './kit.js';
import { vOf, bumps, out } from './build.js';
import { sstep } from './paint.js';

export function leg(b, s, n) {
  const up = 'upperLeg' + n, lo = 'lowerLeg' + n, ft = 'foot' + n, toe = 'toe' + n, lx = s * P.hipX, mirror = s < 0;
  const io = (o, i) => (s > 0 ? [o, i] : [i, o]);        // outer and inner radius → toward +x and away from it
  // thigh and knee: [y, outer, inner, front, back, how far forward]. Only the part below the shorts' hem shows.
  const knee = y => { const k = sstep(P.kneeY + 0.04, P.kneeY - 0.04, y); return { [up]: 1 - k, [lo]: k }; };
  const TH = [[0.69, 0.087, 0.076, 0.097, 0.089, 0.013], [0.64, 0.084, 0.079, 0.094, 0.085, 0.016], [0.595, 0.077, 0.074, 0.087, 0.077, 0.017], [0.558, 0.069, 0.067, 0.076, 0.067, 0.017],
    [P.kneeY, 0.063, 0.062, 0.069, 0.058, 0.016], [0.497, 0.061, 0.06, 0.063, 0.058, 0.01], [0.475, 0.059, 0.058, 0.059, 0.06, 0.005]];
  const thigh = bumps([{ a: s * 0.35, aw: 0.9, y: 0.65, yw: 0.09, d: 0.006 },                                        // the quadriceps' outer head
    { a: -s * 0.6, aw: 0.6, y: 0.562, yw: 0.035, d: 0.008 },                                                        // the teardrop inside the knee
    { a: 0, aw: 0.55, y: P.kneeY, yw: 0.024, d: 0.007 }, { a: 0, aw: 0.5, y: 0.492, yw: 0.016, d: -0.004 },          // kneecap, the dip under it
    { a: Math.PI, aw: 0.5, y: P.kneeY, yw: 0.03, d: -0.006 }, { a: Math.PI - s * 0.7, aw: 0.4, y: 0.56, yw: 0.05, d: 0.005 }]);   // hollow behind the knee, hamstring tendon
  const t0 = b.pos.length / 3;
  b.loft(TH.map(([y, o, i, f, bk, z]) => ({ c: [lx, y, z], rx: io(o, i), rz: [f, bk], v: vOf(SPAN.thigh, y), w: knee(y) })), R.thigh, { seg: 12, a0: Math.PI, mirror, shape: (a, r) => out(a, thigh(a, r)) });
  b.soft.push([t0, b.pos.length / 3, 0.45]);
  // lower leg in its sock: turned over at the top, the calf high behind and fuller inside, a straight shin under the guard, a slim ankle
  const ankle = y => { const k = sstep(P.ankleY + 0.03, P.ankleY - 0.015, y), kn = sstep(P.kneeY + 0.02, P.kneeY - 0.05, y); return { [up]: (1 - kn), [lo]: kn * (1 - k), [ft]: k }; };
  const SK = [[0.486, 0.063, 0.061, 0.061, 0.064, 0.004], [0.478, 0.069, 0.067, 0.067, 0.07, 0.004], [0.452, 0.07, 0.068, 0.068, 0.071, 0.003], [0.444, 0.065, 0.063, 0.063, 0.068, 0.002],
    [0.41, 0.065, 0.065, 0.062, 0.075, 0], [0.37, 0.067, 0.068, 0.062, 0.084, -0.002], [0.325, 0.063, 0.065, 0.06, 0.081, -0.003], [0.27, 0.055, 0.055, 0.057, 0.067, -0.003],
    [0.21, 0.047, 0.047, 0.054, 0.056, -0.002], [0.15, 0.041, 0.041, 0.046, 0.047, 0], [0.105, 0.038, 0.038, 0.042, 0.044, 0], [0.06, 0.04, 0.04, 0.043, 0.045, 0.002]];
  const calf = bumps([{ a: Math.PI - s * 0.75, aw: 0.7, y: 0.345, yw: 0.07, d: 0.007 }, { a: Math.PI + s * 0.7, aw: 0.6, y: 0.375, yw: 0.06, d: 0.006 },   // inner head lower and fuller, outer head higher
    { a: 0, aw: 0.7, y: 0.31, yw: 0.13, d: 0.006 }, { a: Math.PI, aw: 0.7, y: 0.14, yw: 0.06, d: -0.004 }]);                                             // shin guard, the tendon above the heel
  b.loft(SK.map(([y, o, i, f, bk, z]) => ({ c: [lx, y, z], rx: io(o, i), rz: [f, bk], v: vOf(SPAN.sock, y), w: ankle(y) })), R.sock, { seg: 12, a0: Math.PI, mirror, shape: (a, r) => out(a, calf(a, r)) });
  // boot: lofted heel to toe. [z, half width, half height, centre height]
  const BT = [[-0.08, 0.016, 0.022, 0.03], [-0.068, 0.034, 0.045, 0.04], [-0.036, 0.042, 0.051, 0.044], [0.005, 0.045, 0.05, 0.043], [0.045, 0.048, 0.041, 0.035], [0.09, 0.052, 0.032, 0.027], [0.14, 0.05, 0.027, 0.023], [0.182, 0.042, 0.023, 0.02], [0.206, 0.027, 0.016, 0.014]];
  const bw = p => { const k = sstep(0.07, 0.12, p[2]); return { [ft]: 1 - k, [toe]: k }; };
  b.loft(BT.map(([z, hw, hh, cy], i) => ({ c: [lx, cy, z], rx: hw, rz: hh, n: 2.6, v: i / (BT.length - 1), w: bw })), R.boot, { seg: 12, a0: Math.PI, mirror, ax: [1, 0, 0], az: [0, 1, 0], capStart: true, capEnd: true,
    shape: (a, r) => (Math.cos(a) < -0.5 ? [0, (-Math.cos(a) - 0.5) * r.rz * 0.5, 0] : null) });   // a flat sole
}

// The sleeve. Each ring is given by the two points where it crosses the figure seen from the front: on
// top (over the shoulder, then down the outside of the arm) and underneath (the armpit, then down the
// inside of the arm), with its depth in front and behind. The first ring is the seam, buried in the
// shoulder; the top line carries the shoulder's slope on over its point and falls, standing a little
// off the arm, to a wide hem just above the elbow. [top x, y, under x, y, front, back]
const SL = [[0.15, 1.522, 0.15, 1.38, 0.06, 0.064], [0.19, 1.505, 0.163, 1.356, 0.065, 0.069], [0.221, 1.484, 0.165, 1.336, 0.068, 0.071], [0.244, 1.45, 0.162, 1.313, 0.069, 0.073],
  [0.259, 1.4, 0.157, 1.286, 0.071, 0.074], [0.27, 1.33, 0.152, 1.253, 0.072, 0.075], [0.279, 1.255, 0.147, 1.214, 0.073, 0.076], [0.287, 1.185, 0.143, 1.176, 0.074, 0.078],
  [0.264, 1.212, 0.156, 1.208, 0.064, 0.064]];                                                             // the hem, turned up inside to the arm
const TURN = 0.4;                                        // how far the hanging hand is turned, its back coming round to the front (radians)

export function arm(b, s, n) {
  const ua = 'upperArm' + n, fa = 'foreArm' + n, hd = 'hand' + n, cl = 'clavicle' + n, ax = s * P.shoulderX, ay = P.shoulderY, mirror = s < 0;
  const io = (o, i) => (s > 0 ? [o, i] : [i, o]);
  // The cap stays with the shoulder, the tube goes with the arm, the armpit is shared between them.
  const sw = p => {
    const dy = ay - p[1], dx = s * p[0] - P.shoulderX, k = sstep(0, 0.12, dy + 0.5 * dx) * (0.55 + 0.45 * sstep(-0.05, 0.03, dx));
    return { [ua]: k, [cl]: 0.6 * (1 - k), chest: 0.4 * (1 - k) };
  };
  const hangs = (a, r) => (r.lip ? null : out(a, 0.004 * sstep(1.36, 1.18, r.c[1]) * Math.max(0, 0.4 + 0.6 * Math.sin(a * 2 + 1 + s) + 0.3 * Math.sin(a * 3 + 2.3)), r));
  b.loft(SL.map(([tx, ty, bx, by, f, bk], i) => {
    const dx = tx - bx, dy = ty - by, l = Math.hypot(dx, dy);
    const droop = 0.14 * sstep(1.3, 1.18, ty);             // the cloth lies on the arm in front and hangs off it behind, so the hem is lower at the back
    return { c: [s * (tx + bx) / 2, (ty + by) / 2, 0], rx: l / 2, rz: [f, bk], n: 2.1, ax: [dx / l, s * dy / l, 0], az: [0, Math.sin(droop), Math.cos(droop)],
      v: i === SL.length - 1 ? 0.995 : i / (SL.length - 2), w: sw, lip: i === SL.length - 1 };
  }), R.sleeve, { seg: 12, a0: Math.PI, mirror, shape: hangs });

  // arm: [down from the shoulder, outer, inner, front, back, forward]. It starts up inside the sleeve, a little
  // slimmer than it shows below the hem so it never comes through the cloth. From the elbow down the forearm
  // turns with the hand (the wrist's flat side follows the back of the hand).
  const armW = dy => { const e = sstep(P.elbowDY + 0.04, P.elbowDY - 0.04, dy), h = sstep(P.wristDY + 0.02, P.wristDY - 0.02, dy); return { [ua]: 1 - e, [fa]: e * (1 - h), [hd]: h }; };
  // turned t round the arm's own line: a direction, and a ring (its centre and its two axes; `bend` tips it toward the palm)
  const spin = (t, [x, y, z]) => [x * Math.cos(t) - s * z * Math.sin(t), y, s * x * Math.sin(t) + z * Math.cos(t)];
  const turned = (t, c, bend = 0) => {
    const p = spin(t, [c[0] - ax, c[1], c[2]]);
    return { c: [ax + p[0], p[1], p[2]], ax: spin(t, [Math.cos(bend), -s * Math.sin(bend), 0]), az: spin(t, [0, 0, 1]) };
  };
  const AR = [[-0.17, 0.05, 0.043, 0.052, 0.052, 0], [-0.24, 0.053, 0.05, 0.055, 0.055, 0], [-0.285, 0.049, 0.048, 0.052, 0.054, -0.003], [P.elbowDY, 0.047, 0.046, 0.047, 0.054, -0.005],
    [-0.34, 0.054, 0.047, 0.052, 0.052, -0.003], [-0.385, 0.052, 0.045, 0.051, 0.048, 0], [-0.44, 0.045, 0.041, 0.045, 0.043, 0.003], [-0.5, 0.036, 0.034, 0.038, 0.036, 0.006], [P.wristDY + 0.006, 0.028, 0.027, 0.035, 0.033, 0.008]];
  const muscle = bumps([{ a: 0, aw: 0.8, y: ay - 0.25, yw: 0.045, d: 0.003 }, { a: Math.PI, aw: 0.8, y: ay - 0.24, yw: 0.05, d: 0.003 }, { a: s * 0.9, aw: 0.7, y: ay - 0.355, yw: 0.045, d: 0.005 }]);   // biceps, triceps, the forearm's outer bulk
  // The hand: bigger than its paint (v stays where the sheet has the knuckles), thick through the palm,
  // rounding in to the knuckles. [down from the wrist, half thickness, half width toward the thumb, toward the little finger, squareness, toward the palm]
  const HS = 1.12, hy = d => ay + P.wristDY + d * HS;
  const PALM = [[-0.018, 0.019, 0.037, 0.035, 2.5, 0], [-0.045, 0.021, 0.047, 0.044, 2.6, 0.001], [-0.075, 0.019, 0.048, 0.045, 2.5, 0.004], [-0.093, 0.0125, 0.044, 0.042, 2.2, 0.008]];
  const rings = [...AR.map(([dy, o, i, f, bk, z]) => ({ ...turned(TURN * sstep(-0.34, P.wristDY, dy), [ax, ay + dy, z]), rx: io(o, i), rz: [f, bk], v: vOf(SPAN.arm, dy), w: armW(dy) })),
    ...PALM.map(([d, t, f, bk, sq, inx]) => ({ ...turned(TURN, [ax - s * inx, hy(d), 0.01], 0.25 * d / -0.093), rx: t, rz: [f, bk], n: sq, v: vOf(SPAN.arm, P.wristDY + d), w: armW(P.wristDY + d) }))];
  b.loft(rings, R.arm, { seg: 12, a0: Math.PI, mirror, capEnd: true, shape: (a, r) => out(a, muscle(a, r), r) });
  // Fingers: four, lying side by side, each bent at its three joints: a hand half closed, as it hangs or
  // as he runs, the little finger closed most. [across the palm, length, how far it is closed]
  const f0 = b.pos.length / 3, H = { [hd]: 1 }, FG = [[0.0435, 0.074, 0.82], [0.0215, 0.084, 1], [-0.0005, 0.078, 1.14], [-0.022, 0.063, 1.26]];
  for (const [z, len, shut] of FG) {
    const r = len < 0.07 ? 0.0102 : 0.0112, at = [0.008, hy(-0.089)], ring = [];
    let t = 0;
    [[0.6, 0], [0.82, 0.46], [0.42, 0.3], [0, 0.24]].forEach(([bend, part], k) => {         // the knuckle, two joints, the tip: how far each bends, the bone before it
      at[0] += Math.sin(t) * len * part; at[1] -= Math.cos(t) * len * part;
      const half = t + bend * shut / 2;                                                    // (a ring at a joint sits square across the bend)
      ring.push({ ...turned(TURN, [ax - s * at[0], at[1], z], half), rx: r * (1.05 - 0.07 * k), rz: r * (1 - 0.05 * k), v: vOf(SPAN.arm, -0.66 - 0.06 * [0, 0.45, 0.75, 1][k]), w: H });
      t += bend * shut;
    });
    b.loft(ring, R.arm, { seg: 5, a0: Math.PI, mirror, capEnd: true });
  }
  const TB = [[-0.02, 0.041, 0.015, 0.001], [-0.048, 0.056, 0.015, 0.007], [-0.076, 0.064, 0.0125, 0.017], [-0.096, 0.064, 0.008, 0.028]];   // thumb: off the front edge of the palm, turned in
  b.loft(TB.map(([d, z, rad, inx]) => ({ ...turned(TURN, [ax - s * inx, hy(d), z], 0.3), rx: rad * 0.9, rz: rad, v: vOf(SPAN.arm, P.wristDY + d - 0.02), w: H })), R.arm, { seg: 6, a0: Math.PI, mirror, capEnd: true });
  b.soft.push([f0, b.pos.length / 3, 0.4]);                // fingers lying together would shade each other black
}
