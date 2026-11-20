// The PS2-look body: a skinned mesh of about 3,000 triangles on the game's skeleton, shaped like the
// 2003-era footballers: athletic, a loose untucked shirt with real sleeve and hem edges, long shorts
// with open legs, socks to the knee over a shin guard, shaped boots, hands with a thumb.
import { P } from '../body.js';
import { R, SPAN } from './kit.js';
import { Builder } from './build.js';
import { addHead } from './headgeo.js';
import { sstep, gauss } from './paint.js';

const v = (span, y) => (span[0] - y) / (span[0] - span[1]);
const ang = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// soft bumps on a tube: { a: angle (0 = front), aw, y, yw, d }
const bumps = list => (a, r) => {
  let d = 0;
  for (const m of list) d += m.d * Math.max(0, 1 - (ang(a, m.a) / m.aw) ** 2) * Math.max(0, 1 - ((r.c[1] - m.y) / m.yw) ** 2);
  return d ? [Math.sin(a) * d, 0, Math.cos(a) * d] : null;
};

const cache = new Map();
export function figureGeometry(style = 0) {
  if (cache.has(style)) return cache.get(style);
  const b = new Builder();

  // shirt: [y, half width, half depth, z, squareness]
  const S = [
    [1.548, 0.064, 0.068, 0.012, 2], [1.528, 0.086, 0.078, 0.006, 2], [1.502, 0.135, 0.092, 0, 2.2], [1.47, 0.178, 0.106, 0, 2.4],
    [1.425, 0.19, 0.122, 0.008, 2.6], [1.36, 0.186, 0.13, 0.014, 2.7], [1.28, 0.176, 0.124, 0.012, 2.6], [1.2, 0.168, 0.118, 0.008, 2.5],
    [1.11, 0.165, 0.116, 0.004, 2.4], [1.02, 0.167, 0.118, 0.002, 2.4], [0.93, 0.178, 0.124, 0.002, 2.4], [0.856, 0.19, 0.13, 0.002, 2.4],
    [0.864, 0.174, 0.116, 0.002, 2.4],                                                      // the hem turns under
  ];
  const torsoW = p => {
    const y = p[1], side = sstep(0.07, 0.19, Math.abs(p[0])) * sstep(1.4, 1.48, y) * 0.5, cl = p[0] > 0 ? 'clavicleL' : 'clavicleR';
    const nk = sstep(1.5, 1.55, y) * 0.7, ch = sstep(1.1, 1.3, y), sp = sstep(0.9, 1.08, y);
    return { neck: nk, [cl]: side * (1 - nk), chest: ch * (1 - nk) * (1 - side), spine: (1 - ch) * sp, hips: (1 - ch) * (1 - sp) };
  };
  b.loft(S.map(([y, rx, rz, z, n], i) => ({ c: [0, y, z], rx, rz, n, v: i === S.length - 1 ? 0.995 : v(SPAN.shirt, y), w: torsoW })), R.shirt, {
    seg: 20, a0: -Math.PI / 2,
    shape: bumps([{ a: 0.5, aw: 0.6, y: 1.36, yw: 0.08, d: 0.006 }, { a: -0.5, aw: 0.6, y: 1.36, yw: 0.08, d: 0.006 },        // chest
      { a: 2.6, aw: 0.5, y: 1.4, yw: 0.07, d: 0.006 }, { a: -2.6, aw: 0.5, y: 1.4, yw: 0.07, d: 0.006 }, { a: Math.PI, aw: 0.3, y: 1.2, yw: 0.2, d: -0.005 }]),
  });
  // shorts: the seat, then a leg each with an open hem
  const PV = [[1.0, 0.16, 0.108], [0.93, 0.166, 0.114], [0.86, 0.168, 0.11], [0.81, 0.14, 0.085], [0.785, 0.1, 0.055]];
  b.loft(PV.map(([y, rx, rz]) => ({ c: [0, y, 0], rx, rz, n: 2.5, v: v(SPAN.pelvis, y), w: { hips: 1 } })), R.pelvis, { seg: 16, a0: Math.PI, capEnd: true, shape: bumps([{ a: Math.PI, aw: 1.0, y: 0.9, yw: 0.08, d: 0.01 }]) });

  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const up = 'upperLeg' + n, lo = 'lowerLeg' + n, ft = 'foot' + n, toe = 'toe' + n, lx = s * P.hipX, mirror = s < 0;
    const SH = [[0.9, 0.084, 0, { hips: 0.6, [up]: 0.4 }], [0.84, 0.094, 0, { hips: 0.25, [up]: 0.75 }], [0.76, 0.113, 0.004, { [up]: 1 }], [0.68, 0.126, 0.006, { [up]: 1 }], [0.618, 0.131, 0.008, { [up]: 1 }], [0.623, 0.118, 0.008, { [up]: 1 }]];
    b.loft(SH.map(([y, r, z, w], i) => ({ c: [lx + s * 0.004 * (0.9 - y) / 0.28, y, z], rx: r, rz: r * 0.98, n: 2.2, v: i === SH.length - 1 ? 0.995 : v(SPAN.shorts, y), w })), s > 0 ? R.shortsL : R.shortsR, { seg: 12, a0: Math.PI });
    // thigh and knee
    const knee = y => { const k = sstep(P.kneeY + 0.04, P.kneeY - 0.04, y); return { [up]: 1 - k, [lo]: k }; };
    const TH = [[0.69, 0.097, 0.008], [0.63, 0.092, 0.012], [0.58, 0.08, 0.012], [0.548, 0.069, 0.012], [P.kneeY, 0.064, 0.013], [0.495, 0.061, 0.008], [0.475, 0.06, 0.004]];
    b.loft(TH.map(([y, r, z]) => ({ c: [lx, y, z], rx: r, rz: r * 0.97, v: v(SPAN.thigh, y), w: knee(y) })), R.thigh, { seg: 10, a0: Math.PI, mirror,
      shape: bumps([{ a: 0, aw: 1.1, y: 0.64, yw: 0.09, d: 0.007 }, { a: -s * 0.55, aw: 0.7, y: 0.565, yw: 0.04, d: 0.008 }, { a: 0, aw: 0.7, y: P.kneeY, yw: 0.024, d: 0.008 }, { a: Math.PI, aw: 1, y: 0.63, yw: 0.08, d: 0.006 }]) });
    // sock: turned over at the top, a calf behind, the shin guard in front, a slim ankle
    const ankle = y => { const k = sstep(P.ankleY + 0.03, P.ankleY - 0.015, y), kn = sstep(P.kneeY + 0.02, P.kneeY - 0.05, y); return { [up]: (1 - kn), [lo]: kn * (1 - k), [ft]: k }; };
    const SK = [[0.484, 0.065, 0.004], [0.476, 0.071, 0.004], [0.452, 0.072, 0.002], [0.444, 0.067, 0], [0.4, 0.072, -0.006], [0.35, 0.072, -0.01], [0.29, 0.063, -0.008], [0.22, 0.052, -0.003], [0.15, 0.044, 0], [0.105, 0.041, 0], [0.06, 0.041, 0.002]];
    b.loft(SK.map(([y, r, z]) => ({ c: [lx, y, z], rx: r, rz: r * 0.97, v: v(SPAN.sock, y), w: ankle(y) })), R.sock, { seg: 10, a0: Math.PI, mirror,
      shape: bumps([{ a: -s * 2.4, aw: 0.9, y: 0.37, yw: 0.08, d: 0.017 }, { a: s * 2.4, aw: 0.8, y: 0.385, yw: 0.07, d: 0.012 }, { a: 0, aw: 0.75, y: 0.31, yw: 0.14, d: 0.008 }, { a: Math.PI, aw: 0.8, y: 0.14, yw: 0.06, d: -0.004 }]) });
    // boot: lofted heel to toe. [z, half width, half height, centre height]
    const BT = [[-0.078, 0.016, 0.022, 0.03], [-0.066, 0.033, 0.044, 0.039], [-0.035, 0.041, 0.05, 0.043], [0.005, 0.044, 0.049, 0.042], [0.045, 0.047, 0.04, 0.034], [0.09, 0.051, 0.031, 0.026], [0.14, 0.049, 0.026, 0.022], [0.18, 0.041, 0.022, 0.019], [0.203, 0.026, 0.016, 0.014]];
    const bw = p => { const k = sstep(0.07, 0.12, p[2]); return { [ft]: 1 - k, [toe]: k }; };
    b.loft(BT.map(([z, hw, hh, cy], i) => ({ c: [lx, cy, z], rx: hw, rz: hh, n: 2.6, v: i / (BT.length - 1), w: bw })), R.boot, { seg: 12, a0: Math.PI, mirror, ax: [1, 0, 0], az: [0, 1, 0], capStart: true, capEnd: true,
      shape: (a, r) => (Math.cos(a) < -0.5 ? [0, (-Math.cos(a) - 0.5) * r.rz * 0.5, 0] : null) });   // a flat sole

    // sleeve, then the arm from inside it
    const ua = 'upperArm' + n, fa = 'foreArm' + n, hd = 'hand' + n, cl = 'clavicle' + n, ax = s * P.shoulderX, ay = P.shoulderY;
    const SL = [[0.014, 0.02, 0.03, -0.075, { chest: 0.5, [cl]: 0.4, [ua]: 0.1 }], [0.004, 0.044, 0.056, -0.05, { chest: 0.4, [cl]: 0.45, [ua]: 0.15 }], [-0.016, 0.057, 0.067, -0.028, { [cl]: 0.4, [ua]: 0.6 }], [-0.06, 0.062, 0.071, -0.018, { [ua]: 1 }], [-0.14, 0.064, 0.071, -0.014, { [ua]: 1 }], [-0.222, 0.068, 0.074, -0.012, { [ua]: 1 }], [-0.214, 0.054, 0.058, -0.012, { [ua]: 1 }]];
    b.loft(SL.map(([dy, rx, rz, ox, w], i) => ({ c: [ax + s * ox, ay + dy, 0], rx, rz, n: 2.2, v: i === SL.length - 1 ? 0.995 : v(SPAN.sleeve, dy), w })), R.sleeve, { seg: 10, a0: Math.PI, mirror, capStart: true });
    const armW = dy => { const e = sstep(P.elbowDY + 0.04, P.elbowDY - 0.04, dy), h = sstep(P.wristDY + 0.02, P.wristDY - 0.02, dy); return { [ua]: 1 - e, [fa]: e * (1 - h), [hd]: h }; };
    const AR = [[-0.16, 0.052, 0.055], [-0.23, 0.054, 0.056], [-0.285, 0.047, 0.049], [P.elbowDY, 0.043, 0.045], [-0.36, 0.05, 0.052], [-0.44, 0.044, 0.046], [-0.52, 0.034, 0.038], [P.wristDY + 0.004, 0.03, 0.035],
      [-0.588, 0.026, 0.039], [-0.615, 0.03, 0.044], [-0.645, 0.03, 0.042], [-0.672, 0.024, 0.034], [-0.688, 0.013, 0.02]];
    b.loft(AR.map(([dy, rx, rz]) => ({ c: [ax - s * (0.012 * sstep(-0.45, -0.2, dy) + 0.016 * sstep(-0.6, -0.69, dy)), ay + dy, dy < -0.57 ? 0.004 + 0.02 * sstep(-0.6, -0.69, dy) : 0], rx, rz, n: dy < -0.57 ? 2.6 : 2, v: v(SPAN.arm, dy), w: armW(dy) })), R.arm, { seg: 10, a0: Math.PI, mirror, capEnd: true,
      shape: (a, r) => {
        const dy = r.c[1] - ay, th = gauss(dy, -0.615, 0.025) * Math.max(0, Math.cos(a)) ** 3;                                 // the thumb, at the front edge of the hand
        const fore = 0.006 * gauss(dy, -0.37, 0.05) * Math.max(0, Math.cos(ang(a, s * 0.8))), bi = 0.005 * gauss(dy, -0.24, 0.04) * Math.max(0, Math.cos(a));
        return [Math.sin(a) * (fore + bi) - s * th * 0.008, 0, Math.cos(a) * (fore + bi) + th * 0.014];
      } });
  }
  addHead(b, style);
  const g = b.geometry();
  cache.set(style, g);
  return g;
}
