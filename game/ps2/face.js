// The painted head: skin, a generic face, ears, the neck, then the hair. Everything is painted from
// scratch in the head's own (phi, t) coordinates (headgeo.js), with the light and shade painted in the
// way a 2003 face texture had them: deep eye sockets, a shadow under the nose and lip, a jawline.
// Faces are generic: a look only changes skin, hair, eye color, stubble and a few proportions.
// No photos, no likenesses.
// It has to be quick (a sheet per look at load, on a headset): the light and shade are built first as
// fields, each soft shape added only over the patch it covers, then one pass colors the skin, then the
// small features (eyes, brows, nostrils, mouth, ears) are painted over their own few pixels.
import { R, HEAD_SHEET } from './kit.js';
import { mix, sstep, gauss as g, hash } from './paint.js';
import { phiOfU, uOfPhi, hairline, F, EAR } from './headgeo.js';

const w = R.head.w, h = R.head.h, SW = HEAD_SHEET.w;
const PHI = new Float32Array(w), TT = new Float32Array(h), COL = new Float32Array(w), HL = new Float32Array(w);
for (let px = 0; px < w; px++) PHI[px] = phiOfU((px + 0.5) / w);
for (let py = 0; py < h; py++) TT[py] = (py + 0.5) / h;
// light (a multiplier, less one), redness, shine, beard
const M = new Float32Array(w * h), RED = new Float32Array(w * h), HI = new Float32Array(w * h), BRD = new Float32Array(w * h);
// Down each column, the same for every face: the edge of the jaw (rising to its corner under the ear) and
// the light along it, how far the side of the head has turned from the light, the beard's edge across the
// cheek (sideburn to mouth) and where it stops by the ear, the moustache, the chin, the thin patch beside it.
const TJ = new Float32Array(w), JL = new Float32Array(w), SD = new Float32Array(w), BL = new Float32Array(w), BS = new Float32Array(w), TA = new Float32Array(w), CH = new Float32Array(w), GP = new Float32Array(w);
for (let px = 0; px < w; px++) {
  const ap = Math.abs(PHI[px]);
  TJ[px] = 0.957 - 0.115 * sstep(0.3, 1.45, ap); JL[px] = 0.07 * sstep(0.25, 0.7, ap); SD[px] = sstep(0.75, 1.5, ap);
  BL[px] = 0.6 + (1.45 - ap) * 0.125 + 0.03 * g(ap, 0.75, 0.3); BS[px] = sstep(1.72, 1.45, ap); TA[px] = sstep(0.47, 0.3, ap) * (1 - 0.3 * g(ap, 0, 0.03)); CH[px] = sstep(0.44, 0.27, ap); GP[px] = 0.5 * g(ap, 0.42, 0.1);
}
// smooth noise (paint.js's, without the wrap: this runs for every pixel of skin)
function vn(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const colOf = phi => Math.max(0, Math.min(w - 1, Math.round(uOfPhi(Math.max(-Math.PI, Math.min(Math.PI, phi))) * w - 0.5)));
const rowOf = t => Math.max(0, Math.min(h - 1, Math.round(t * h - 0.5)));

// field += amp x a soft spot at (pc, tc), widths (pw, tw). pc > 0: one each side of the face.
function G(f, amp, pc, pw, tc, tw) {
  const y0 = rowOf(tc - 2.6 * tw), y1 = rowOf(tc + 2.6 * tw);
  for (const c of pc ? [pc, -pc] : [0]) {
    const x0 = colOf(c - 2.6 * pw), x1 = colOf(c + 2.6 * pw);
    for (let px = x0; px <= x1; px++) { const k = (PHI[px] - c) / pw; COL[px] = Math.exp(-k * k); }
    for (let py = y0; py <= y1; py++) {
      const k = (TT[py] - tc) / tw, rv = amp * Math.exp(-k * k), o = py * w;
      for (let px = x0; px <= x1; px++) f[o + px] += rv * COL[px];
    }
  }
}
// fn(ap, t, side, px, py) for every pixel with |phi| in a0..a1 and t in t0..t1, both sides of the face
function each(a0, a1, t0, t1, fn) {
  const y0 = rowOf(t0), y1 = rowOf(t1);
  for (const s of [1, -1]) {
    if (s < 0 && a0 <= 0) a0 = 1e-4;                           // (the middle column only once)
    const xa = colOf(s * a0), xb = colOf(s * a1), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) fn(Math.abs(PHI[px]), TT[py], s, px, py);
  }
}
const EYES = [[64, 40, 22], [48, 31, 19], [78, 98, 118], [84, 96, 62], [40, 27, 19], [98, 76, 40], [66, 88, 112]];

// skin, hair: [r, g, b]. st: a style from HAIR2. look: an integer that varies the face.
export function paintHead(ctx, { skin, hair, st, stubble = false, look = 0 }) {
  const img = ctx.createImageData(HEAD_SHEET.w, HEAD_SHEET.h), d = img.data;
  const rnd = k => hash(look, k, 5), dk = sstep(0.45, 0.78, 1 - (skin[0] + skin[1] + skin[2]) / 765);     // dk: 0 for fair skin, 1 for the darkest
  // what a look changes. The head's shape is the same for everyone, so these are all paint: how heavy and
  // how arched the brows are, the eyes' size, opening, slant and spacing, how wide the nose spreads, the
  // lips, how gaunt the cheeks are, the lines of age, freckles, a cleft chin
  const noseW = 0.86 + 0.4 * rnd(1) + 0.1 * dk, lipFull = 0.66 + 0.6 * rnd(2) + 0.2 * dk, mouthW = 0.9 + 0.2 * rnd(12);
  const browH = 0.016 + 0.012 * rnd(3), browArch = 0.2 + 0.9 * rnd(4), browTilt = 0.018 * (rnd(5) - 0.5), browUp = 0.008 * (rnd(14) - 0.4), browIn = 0.09 + 0.06 * rnd(15);
  const eyeOpen = 0.82 + 0.38 * rnd(6), eyeTilt = -0.002 + 0.01 * rnd(7), eyeW = 0.92 + 0.16 * rnd(8), ec = 0.345 + 0.025 * rnd(16);
  const gaunt = 0.3 + 1.3 * rnd(9), fold = 0.04 + 0.16 * rnd(10), lined = rnd(11), tired = rnd(17), cleft = rnd(18) < 0.3, freckled = dk < 0.2 && rnd(19) < 0.4;
  const beard = stubble ? 1 + Math.floor(rnd(13) * 4) : 0;                    // 0 shaved this morning, 1 a day's growth, 2 heavy, 3 a goatee and moustache, 4 a moustache
  const eyeCol = dk > 0.35 ? EYES[[0, 1, 4][look % 3]] : EYES[look % EYES.length];
  const dim = (i, k) => { const m = 1 - k; d[i] *= m; d[i + 1] *= m; d[i + 2] *= m; };
  const tint = (i, r, gg, b, k) => { d[i] += (r - d[i]) * k; d[i + 1] += (gg - d[i + 1]) * k; d[i + 2] += (b - d[i + 2]) * k; };
  const at = (px, py) => ((R.head.y + py) * SW + R.head.x + px) * 4;

  // ---- light and shade: the light comes from above and in front ----
  M.fill(0); RED.fill(0); HI.fill(0); BRD.fill(0);
  for (let px = 0; px < w; px++) HL[px] = hairline(st, PHI[px]);
  G(M, 0.08, 0, 0.5, 0.33, 0.06);                                             // forehead
  G(M, 0.05, 0.4, 0.25, F.brow - 0.022, 0.012);                               // the brow bone catches it
  G(M, -0.12, 1.0, 0.22, 0.42, 0.08);                                         // temples
  G(M, -0.3, 0.34, 0.2, F.eye - 0.014, 0.034);                                // the eyes sit back in shade under the brow
  G(M, -0.2, 0.19, 0.065, F.eye - 0.012, 0.032);                              // deepest beside the bridge
  G(M, -0.1 - 0.1 * tired, 0.34, 0.17, F.eye + 0.04, 0.014);                  // under the eye
  G(M, -0.08, 0.6, 0.06, F.eye + 0.005, 0.03);                                // its outer corner
  G(M, 0.11, 0.5, 0.2, 0.588, 0.028);                                         // the top of the cheek
  G(M, 0.03, 0, 0.035, 0.57, 0.06);                                           // ridge of the nose
  G(M, -0.22, 0.12 * noseW, 0.045, 0.585, 0.05);                              // its sides
  G(M, 0.03, 0, 0.05, F.tip - 0.008, 0.012);                                  // the tip
  G(M, 0.06, 0.14 * noseW, 0.03, F.tip - 0.002, 0.009);                       // the wings, lit on top
  G(M, -0.2, 0.185 * noseW, 0.026, F.tip + 0.014, 0.015);                     // and shaded round the side
  G(M, -0.34, 0, 0.12 * noseW, F.sub + 0.001, 0.008);                         // under the nose
  G(M, -0.16, 0, 0.12, F.sub + 0.024, 0.018);                                 // its shadow on the lip
  G(M, -0.07, 0, 0.028, 0.715, 0.02);                                         // the groove above the lip
  G(M, 0.04, 0.07, 0.03, 0.72, 0.018);
  G(M, -0.16 * gaunt * (1 - 0.35 * dk), 0.85, 0.25, 0.72, 0.065);                               // hollow cheeks
  G(M, -0.24, 0, 0.19, F.under - 0.002, 0.014);                               // under the lower lip
  G(M, 0.1, 0, 0.17, F.chin - 0.02, 0.025);                                   // chin
  if (cleft) G(M, -0.12, 0, 0.022, F.chin - 0.012, 0.022);
  G(M, -0.2, 1.63, 0.1, 0.56, 0.08);                                          // behind and under the ear
  if (lined > 0.35) { G(M, -0.05 * lined, 0.02, 0.36, 0.3, 0.0035); G(M, -0.04 * lined, 0.05, 0.3, 0.345, 0.003); G(M, -0.035 * lined, 0, 0.02, F.brow + 0.005, 0.02); }   // lines across the forehead, a frown
  G(HI, 0.45, 0, 0.3, 0.325, 0.04); G(HI, 0.5, 0, 0.024, 0.585, 0.04); G(HI, 0.7, 0, 0.036, F.tip - 0.012, 0.008); G(HI, 0.55, 0.55, 0.14, 0.578, 0.018); G(HI, 0.3, 0, 0.1, F.chin - 0.025, 0.014);
  G(RED, 0.7, 0.62, 0.28, 0.64, 0.07); G(RED, 0.7, 0, 0.13, 0.63, 0.035); G(RED, 0.3, 0, 0.35, 0.9, 0.04); G(RED, 0.35, 0.36, 0.2, F.eye, 0.035); G(RED, -0.3, 0, 0.6, 0.31, 0.06);
  const bAll = [0.12, 0.3, 0.48, 0.18, 0.16][beard];
  // the shapes that don't run level: the sides of the head, the jaw, the hair's shadow, the beard, the fold from nose to mouth
  const xa = colOf(-1.75), xb = colOf(1.75), sideK = 0.17 - 0.1 * dk, shadeK = st.buzz ? 0.04 : 0.11;
  for (let py = rowOf(0.15); py < h; py++) {
    const t = TT[py], o = py * w, sT = sideK * sstep(0.3, 0.5, t), tashT = g(t, 0.722, 0.024), chinT = sstep(0.795, 0.835, t), gapT = g(t, 0.81, 0.03), fadeT = bAll * (1 - 0.5 * sstep(0.95, 1, t));
    for (let px = xa; px <= xb; px++) {
      let m = -sT * SD[px];
      if (t > 0.76) { const e = t - TJ[px], k = (e + 0.032) / 0.03; m -= 0.4 * sstep(-0.012, 0.03, e); if (k > -1 && k < 1) m += JL[px] * (1 - k * k) ** 2; }   // dark under the jaw, a light along its edge
      else if (t < 0.4) m -= shadeK * sstep(HL[px] + 0.055, HL[px] + 0.004, t);
      M[o + px] += m;
      if (t > 0.58) {
        const tash = tashT * TA[px], all = Math.max(tash, sstep(BL[px] - 0.015, BL[px] + 0.035, t) * BS[px] * (1 - GP[px] * gapT));
        BRD[o + px] = fadeT * all + (beard === 3 ? 0.5 * Math.max(tash, chinT * CH[px]) : beard === 4 ? 0.5 * tash : 0);
      }
    }
  }
  each(0.12, 0.62, 0.63, 0.82, (ap, t, s, px, py) => {
    const k = ap - (0.2 * noseW + (t - 0.655) * 1.6);
    M[py * w + px] += fold * sstep(0.64, 0.67, t) * sstep(0.815, 0.76, t) * (-g(k, 0, 0.022) + 0.4 * g(k, 0.05, 0.03));
  });

  // ---- skin: never flat. Blotchy, mottled, pored; ruddier cheeks, nose and chin; warmer in the shade ----
  const hiK = 255 * (0.06 + 0.09 * dk), hiG = 0.92, hiB = 0.8, deep = st.buzz ? 9 : st.fade + 0.03, sc = [hair[0] * 0.45 + skin[0] * 0.3, hair[1] * 0.45 + skin[1] * 0.31, hair[2] * 0.45 + skin[2] * 0.34];
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const o = py * w + px, i = at(px, py);
    d[i + 3] = 255;
    if (TT[py] < HL[px] - deep) { d[i] = skin[0]; d[i + 1] = skin[1]; d[i + 2] = skin[2]; continue; }       // under the hair
    const b1 = vn(px * 0.03, py * 0.045, look + 2), b2 = vn(px * 0.19, py * 0.19, look + 4), b3 = vn(px * 0.085, py * 0.1, look + 6), red = RED[o] + 0.6 * (b1 - 0.5) + 0.5 * (b3 - 0.5);
    let m = 1 + M[o] + 0.1 * (b1 - 0.5) + 0.08 * (b2 - 0.5) + 0.1 * (b3 - 0.5) + 0.06 * (hash(px, py, look) - 0.5);
    let r = skin[0] * (1 + 0.05 * red), gg = skin[1] * (1 - 0.09 * red), b = skin[2] * (1 - 0.1 * red);
    if (m < 1) { const sd = 1 - m; m = 1 - sd * (1 - 0.2 * dk); r *= m * (1 + 0.1 * sd); gg *= m * (1 - 0.06 * sd); b *= m * (1 - 0.14 * sd); } else { r *= m; gg *= m; b *= m; }
    if (freckled && RED[o] > 0.12 && hash(px >> 1, py >> 1, look + 8) < 0.07) { const k = Math.min(1, RED[o] * 2); r *= 1 - 0.07 * k; gg *= 1 - 0.13 * k; b *= 1 - 0.18 * k; }
    if (HI[o] > 0.004) { const v = HI[o] * hiK * (0.85 + 0.3 * b2); r += v; gg += v * hiG; b += v * hiB; }   // skin shines where it's tight over bone
    if (BRD[o] > 0.01) { const k = BRD[o] * (hash(px, py, 7) < 0.45 + 0.4 * b2 ? 1.3 : 0.55); r += (sc[0] - r) * k; gg += (sc[1] - gg) * k; b += (sc[2] - b) * k; }   // stubble: dots, and the shadow they add up to
    d[i] = r; d[i + 1] = gg; d[i + 2] = b;
  }

  // ---- eyes: an almond between two lids, in the socket's shade, the upper lid over the top of the iris ----
  const ew = 0.195 * eyeW, eh = 0.0215 * eyeOpen;
  each(ec - 1.45 * ew, ec + 1.45 * ew, F.eye - 0.055, F.eye + 0.05, (ap, t, s, px, py) => {
    const i = at(px, py), ex = (ap - ec) / ew, a = Math.max(0, 1 - ex * ex), dy = t - (F.eye + 0.001 - eyeTilt * ex);
    const up = eh * a ** 0.55 * (1 - 0.18 * ex), lo = 0.62 * eh * a ** 0.75 * (1 + 0.22 * ex), wide = sstep(1.3, 0.9, Math.abs(ex));
    dim(i, 0.34 * g(dy + up + 0.011 * (0.45 + 0.55 * a ** 0.4), 0, 0.003) * wide);                            // the lid's crease
    dim(i, -0.07 * g(dy + up + 0.005, 0, 0.003) * a);                                                        // the lid itself catches a little light
    dim(i, 0.12 * g(dy - lo - 0.015 - 0.004 * ex * ex, 0, 0.0035) * sstep(1.1, 0.3, Math.abs(ex + 0.15)));     // the bag under the eye
    if (a <= 0) return;
    const e = Math.min(dy + up, lo - dy);                                                                    // > 0 between the lids
    if (e > -0.002) {
      const shade = sstep(0.016, 0, dy + up), v = (1 - 0.42 * shade - 0.34 * ex * ex) * (1 - 0.06 * dk) * (1 + 0.6 * M[py * w + px]);
      let r = 196 * v, gg = 187 * v, b = 178 * v;
      const pink = 0.6 * sstep(-0.62, -1, ex); r += (150 * v - r) * pink; gg += (96 * v - gg) * pink; b += (88 * v - b) * pink;
      const ix = (ap - ec + 0.012) / 0.079, iy = (dy + 0.2 * eh) / 0.0252, rr = Math.hypot(ix, iy);
      if (rr < 1.05) {
        const iv = (0.55 + 0.5 * sstep(-0.6, 0.9, iy) + 0.35 * (vn(Math.atan2(iy, ix) * 6, rr * 3, look + 20) - 0.5)) * (1 - 0.6 * sstep(0.7, 1, rr)) * (1 - 0.55 * shade);
        const ik = sstep(1.04, 0.88, rr), pu = sstep(0.47, 0.36, rr), cl = 0.8 * g(ix, s > 0 ? -0.3 : 0.3, 0.14) * g(iy, -0.2, 0.14);
        r += (mix(eyeCol[0] * iv, 9, pu) - r) * ik; gg += (mix(eyeCol[1] * iv, 7, pu) - gg) * ik; b += (mix(eyeCol[2] * iv, 7, pu) - b) * ik;
        r += (250 - r) * cl; gg += (250 - gg) * cl; b += (250 - b) * cl;
      }
      tint(i, r, gg, b, sstep(-0.002, 0.002, e));
    }
    tint(i, 24, 16, 12, 0.92 * g(dy + up, -0.0012, 0.0042) * a ** 0.15 * (0.7 + 0.3 * ex));                  // lashes along the upper lid, heavier outward
    dim(i, 0.36 * g(dy - lo, 0.001, 0.003) * a ** 0.3 * (0.35 + 0.65 * sstep(-0.6, 0.5, ex)));
  });

  // ---- eyebrows: strokes of hair along an arch, upright by the nose, lying over toward the tail ----
  const browCol = hair.map((v, k) => Math.min(v, [118, 84, 50][k]) * 0.55 + 4);
  each(0.06, 0.78, F.brow - 0.06, F.brow + 0.05, (ap, t, s, px, py) => {
    const bx = (ap - browIn) / 0.6;
    const line = F.brow + 0.006 - browUp - 0.012 * browArch * sstep(0, 0.6, bx) + (0.01 * browArch + browTilt) * sstep(0.62, 1.05, bx);
    const thick = browH * (0.72 + 0.28 * sstep(0, 0.2, bx)) * (1 - 0.74 * sstep(0.42, 1, bx));
    let k = sstep(thick, thick * 0.3, Math.abs(t - line)) * sstep(-0.05, 0.04, bx) * sstep(1.04, 0.88, bx);
    if (k <= 0) return;
    const th = mix(1.2, 0.3, sstep(0, 0.35, bx)), cs = Math.cos(th), sn = Math.sin(th), ox = s * px;
    k *= 0.45 + 0.75 * vn((sn * ox + cs * py) * 0.75, (cs * ox - sn * py) * 0.2, look + 30);
    tint(at(px, py), browCol[0], browCol[1], browCol[2], Math.min(0.94, k));
  });

  // ---- nostrils, and the crease round each wing ----
  each(0, 0.32, F.tip - 0.02, F.sub + 0.012, (ap, t, s, px, py) => {
    const i = at(px, py), nx = (ap - 0.092 * noseW) / (0.06 * noseW), ny = (t - F.sub + 0.008 + 0.003 * nx) / 0.009;
    dim(i, 0.78 * sstep(1.2, 0.35, Math.hypot(nx, ny)));
    const wx = (ap - 0.15 * noseW) / 0.075, wy = (t - F.tip - 0.012) / 0.024;
    dim(i, 0.28 * g(Math.hypot(wx, wy), 1, 0.2) * sstep(-0.3, 0.4, wx) * sstep(0.9, 0.2, wy));
  });

  // ---- mouth: lips are the skin's own color gone redder, the upper one in shade with its bow, the lower one
  // fuller and catching the light ----
  const lipW = 0.36 * mouthW, lipR = 0.9 - 0.05 * dk, lipG = 0.67 + 0.06 * dk, lipB = 0.68 + 0.07 * dk;
  each(0, lipW + 0.1, F.mouth - 0.04, F.mouth + 0.055, (ap, t, s, px, py) => {
    const i = at(px, py), a = Math.max(0, 1 - (ap / lipW) ** 2), ends = sstep(lipW, lipW - 0.08, ap);
    const line = F.mouth + 0.004 * (ap / lipW) ** 2 - 0.0025 * g(ap, 0, 0.05);
    const top = line - 0.021 * lipFull * a ** 0.7 * (1 - 0.3 * g(ap, 0, 0.045) + 0.1 * g(ap, 0.1, 0.05)), bot = line + 0.03 * lipFull * a ** 0.6;
    const upper = t < line ? sstep(top - 0.004, top + 0.004, t) * ends : 0, lower = t >= line ? sstep(bot + 0.007, bot - 0.005, t) * ends : 0;
    if (upper + lower > 0) {
      const k = (0.9 * upper + 0.8 * lower) * (0.8 + 0.4 * vn(px * 1.2, py * 0.16, look + 17)), lt = 1 - 0.2 * upper + 0.06 * lower * g(t, line + 0.4 * (bot - line), 0.008);
      d[i] *= 1 + (lipR * lt - 1) * k; d[i + 1] *= 1 + (lipG * lt - 1) * k; d[i + 2] *= 1 + (lipB * lt - 1) * k;
      const lit = lower * (0.05 + 0.1 * dk) * g(t, line + 0.38 * (bot - line), 0.0045) * g(ap, 0.02, 0.1); d[i] += 255 * lit; d[i + 1] += (236 - 30 * dk) * lit; d[i + 2] += (224 - 30 * dk) * lit;
    }
    dim(i, -0.05 * g(t, top - 0.006, 0.004) * ends);                                                         // the rim of the upper lip catches a little light
    dim(i, 0.72 * g(t, line, 0.0032) * sstep(lipW + 0.035, lipW - 0.03, ap));                               // the line between the lips
    dim(i, 0.22 * g(ap, lipW + 0.015, 0.03) * g(t, line + 0.003, 0.011));                                    // its corners
  });

  // ---- ears: the rim, the fold inside it, the dark bowl, the lobe (their own patch of the sheet) ----
  const ex0 = Math.round(EAR.u0 * w), ex1 = Math.round(EAR.u1 * w), ey0 = Math.round(EAR.t0 * h), ey1 = Math.round(EAR.t1 * h);
  for (let py = ey0 - 2; py < Math.min(h, ey1 + 2); py++) for (let px = ex0 - 2; px < Math.min(w, ex1 + 2); px++) {
    const x = ((px + 0.5 - ex0) / (ex1 - ex0) - 0.04) / 0.92, y = ((py + 0.5 - ey0) / (ey1 - ey0) - 0.03) / 0.94;
    const q = Math.hypot((x - 0.42) / 0.62, (y - 0.47) / 0.52), back = sstep(0.2, 0.45, x), lobe = sstep(0.72, 0.86, y);
    let m = 0.78 + 0.18 * g(q, 0.93, 0.1) * Math.max(back, sstep(0.4, 0.2, y)) * (1 - lobe)                   // the rim, lit
      - 0.34 * g(q, 0.72, 0.09) * back * sstep(0.85, 0.6, y)                                                 // the groove inside it
      + 0.12 * g(q, 0.5, 0.08) * back * (1 - lobe)                                                           // the fold
      - 0.55 * sstep(1, 0.4, Math.hypot((x - 0.33) / 0.2, (y - 0.53) / 0.2)) - 0.3 * sstep(1, 0.3, Math.hypot((x - 0.2) / 0.09, (y - 0.52) / 0.07))   // the bowl and the hole
      + 0.14 * g(x, 0.07, 0.07) * g(y, 0.5, 0.1) - 0.12 * sstep(0.25, 0, y) + 0.06 * lobe;
    m += 0.06 * (vn(px * 0.3, py * 0.3, look + 9) - 0.5);
    const sd = Math.max(0, 1 - m) * (1 - 0.2 * dk), k = 1 - sd, rd = 0.15 + 0.3 * lobe;
    const r = skin[0] * (1 + 0.05 * rd) * k * (1 + 0.12 * sd), gg = skin[1] * (1 - 0.09 * rd) * k * (1 - 0.06 * sd), b = skin[2] * (1 - 0.1 * rd) * k * (1 - 0.14 * sd);
    for (const i of [at(px, py), at(w - 1 - px, py)]) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; }
  }
  // a mole or two
  for (let n = 0; n < 2; n++) if (rnd(40 + n) < 0.6) {
    const mp = (0.3 + 0.9 * rnd(42 + n)) * (rnd(44 + n) < 0.5 ? -1 : 1), mt = 0.55 + 0.3 * rnd(46 + n), cx = colOf(mp), cy = rowOf(mt);
    for (let py = cy - 2; py <= cy + 2; py++) for (let px = cx - 2; px <= cx + 2; px++) dim(at(px, py), 0.4 * sstep(2.4, 0.8, Math.hypot(px - cx, py - cy)));
  }

  // ---- neck (R.neck's rectangle of this sheet, see headgeo.js): round it from the nape (the edges) to the
  // throat (the middle), down it from inside the jaw to the collar ----
  const nr = R.neck, nPhi = u => ((u * nr.w - 1.5) / (nr.w - 3) - 0.5) * 2 * Math.PI, nT = v => 0.736 + 0.6 * v;
  for (let py = 0; py < nr.h; py++) for (let px = 0; px < nr.w; px++) {
    const i = (py * SW + nr.x + px) * 4 + nr.y * SW * 4, v = (py + 0.5) / nr.h, ap = Math.abs(nPhi((px + 0.5) / nr.w)), front = sstep(2.3, 1.4, ap);
    const b1 = vn(px * 0.11, py * 0.11, look + 2), cord = ap - 0.2 - 1.35 * (1 - v) ** 1.3;
    let m = 1 + 0.12 * (b1 - 0.5) + 0.05 * (hash(px, py, look) - 0.5)
      - 0.5 * sstep(0.62, 0.12, v) * front - 0.13 * sstep(0.7, 1.7, ap)                                     // the jaw's shadow; the sides turn from the light
      + 0.08 * g(cord, 0, 0.16) * sstep(0.2, 0.45, v) - 0.07 * g(cord, -0.3, 0.2) * sstep(0.2, 0.5, v)      // the cords from behind the ear to the collarbone
      + 0.07 * g(ap, 0, 0.13) * g(v, 0.45, 0.08) - 0.09 * g(ap, 0, 0.16) * g(v, 0.64, 0.08)                 // the Adam's apple and the hollow under it
      - 0.07 * sstep(2.7, 3.1, ap) - 0.2 * sstep(0.3, 0, v) * (1 - front);                                  // the groove down the nape; dark where it runs up into the head
    const sd = Math.max(0, 1 - m) * (1 - 0.2 * dk), k = m < 1 ? 1 - sd : m, bd = bAll * front * sstep(0.55, 0.15, v) * (hash(px, py, 7) < 0.5 ? 1.2 : 0.5);
    d[i] = mix(skin[0] * k * (1 + 0.1 * sd), sc[0], bd); d[i + 1] = mix(skin[1] * k * (1 - 0.06 * sd), sc[1], bd); d[i + 2] = mix(skin[2] * k * (1 - 0.14 * sd), sc[2], bd); d[i + 3] = 255;
  }

  paintRoots(d, SW, R.head, st, hair, look);
  paintRoots(d, SW, nr, st, hair, look, nPhi, nT);                             // the hair at the nape runs on down the neck
  paintStrands(d, SW, R.hair, st, hair, look);
  ctx.putImageData(img, 0, 0);
}

// ---- hair ----
// The roots are painted straight onto the scalp: the hairline with its ragged edge, the sideburns, the
// clipped sides and nape thinning out to skin, and every strand running the way that style is combed.
// The hair's shell (headgeo.js) wears the same pixels. The pieces that hang free wear the strand sheet.
const INV2PI = 0.5 / Math.PI;
function vnoise3(x, y, z, seed) {                           // smooth noise in space (curls: no seam, no pinch at the crown)
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), s0 = seed + zi * 31, s1 = s0 + 31;
  const a = hash(xi, yi, s0), b = hash(xi + 1, yi, s0), c = hash(xi, yi + 1, s0), d = hash(xi + 1, yi + 1, s0);
  const e = hash(xi, yi, s1), f = hash(xi + 1, yi, s1), gg = hash(xi, yi + 1, s1), h = hash(xi + 1, yi + 1, s1);
  const lo = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v, hi = e + (f - e) * u + (gg - e) * v + (e - f - gg + h) * u * v;
  return lo + (hi - lo) * w;
}
// smooth noise that repeats every n cells across (paint.js's, made for an inner loop)
function vnw(x, y, seed, n) {
  const xf = Math.floor(x), yi = Math.floor(y), fx = x - xf, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  let xi = (xf | 0) % n; if (xi < 0) xi += n;
  const xj = xi + 1 === n ? 0 : xi + 1;
  const a = hash(xi, yi, seed), b = hash(xj, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xj, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// The strands' light and dark where a hair points along `S` (0..1 round the pole) at height `v` on it.
// Returns a multiplier; leaves the sheen (how much of a highlight this strand would carry) in `sh[0]`.
const sh = [0];
function strand(st, S, v, seed) {
  const pin = Math.min(1, (1 - v * v) * 7);                 // the strands crowd together at the pole: fade the fine ones
  let fine, broad;
  if (st.choppy) { fine = vnw(S * 256, v * 8, seed, 256); broad = 0.3 + 1.1 * vnw(S * 72, v * 12, seed + 1, 72); }   // short hair: tufts, not long strands
  else { fine = vnw(S * 192, v * 2.6, seed, 192); broad = 0.4 + vnw(S * 44, v * 1.6, seed + 1, 44); }
  const k = st.swept ? 0.62 : 0.56;
  sh[0] = fine * fine * pin * broad;
  return 1 - k * 0.5 + k * (fine * pin + 0.5 * (1 - pin)) * broad;
}
function curl(X, Y, Z, seed) {
  const a = Math.abs(2 * vnoise3(X * 15, Y * 15, Z * 15, seed) - 1), b = Math.abs(2 * vnoise3(X * 34 + 7, Y * 34, Z * 34, seed + 5) - 1);
  const m = Math.min(a * 1.7, 1) * (0.6 + 0.4 * b);         // dark where the coils turn under
  sh[0] = m * m * m;
  return 0.42 + 0.75 * m;
}

// The hair on the scalp. d: the sheet's pixels (RGBA), SW: its width, r: the head's region.
function paintRoots(d, SW, r, st, hair0, look, phiOf = phiOfU, tOf = v => v) {
  const hair = [Math.max(hair0[0], 26), Math.max(hair0[1], 22), Math.max(hair0[2], 20)];      // (black hair still shows its strands)
  const w = r.w, h = r.h, se = Math.sin(st.pole), ce = Math.cos(st.pole), seed = 40 + look * 3;
  const lim = new Float32Array(w), sp = new Float32Array(w), cp = new Float32Array(w), fr = new Float32Array(w);
  let low = 0;
  for (let px = 0; px < w; px++) {
    const phi = phiOf((px + 0.5) / w), ap = Math.abs(phi), c = Math.cos(phi);
    sp[px] = Math.sin(phi); cp[px] = c; fr[px] = Math.max(0, c) ** 1.5;
    const jit = st.curls ? 0.03 * (vnw(px * 80 / w, 0, seed, 80) - 0.5) : 0.03 * (vnw(px * 56 / w, 0, seed, 56) - 0.5) + 0.018 * (vnw(px * 220 / w, 0, seed + 1, 220) - 0.5);   // strands end at different lengths
    const burn = sstep(0.14, 0.05, Math.abs(ap - 1.4)), base = hairline(st, phi);
    lim[px] = base + (st.burn - base) * burn + jit * (st.buzz ? 0.5 : 1) * (0.6 + 0.4 * fr[px]);
    low = Math.max(low, lim[px] + 0.02);
  }
  const lumHair = (hair[0] + hair[1] + hair[2]) / 765, gloss = 44 + 70 * lumHair, soft = st.buzz ? 0.02 : 0.011;
  for (let py = 0; py < h; py++) {
    const t = tOf((py + 0.5) / h), Y = t < 0.45 ? 1 - t / 0.45 : (0.45 - t) / 0.55, sth = Math.sqrt(1 - Y * Y);
    if (t > low) break;
    // down the row: the hair is lighter on top, and the band where it shines (two bands when it's slicked)
    const lit = 0.82 + 0.22 * Y, band = gloss * (st.curls ? 0.9 * (0.4 + 0.6 * Math.max(0, Y)) : st.buzz ? 0.25 * g(Y, 0.7, 0.2) : st.swept ? 1.25 * (g(Y, 0.7, 0.2) + 0.5 * g(Y, 0.1, 0.16)) : 0.8 * g(Y, 0.7, 0.2) + 0.3 * g(Y, 0.1, 0.22));
    for (let px = 0; px < w; px++) {
      const e = lim[px] - t;
      if (e < -soft) continue;
      let k = e > soft ? 1 : sstep(-soft, soft, e);
      const fz = st.fade * (1 - fr[px]);
      if (e < fz) { const den = Math.max(0, e / fz); k *= den * (0.55 + 0.45 * den) + (1 - den) * 0.5 * hash(px, py, 13) * den ** 0.3; }   // clipped short: skin shows through
      if (st.buzz) k *= 0.5 + 0.34 * hash(px, py, 14);
      const X = sth * sp[px], Z = sth * cp[px];
      let m = st.curls ? curl(X, Y, Z, seed) : strand(st, Math.atan2(X, Y * ce + Z * se) * INV2PI + 0.5, Y * se - Z * ce, seed);
      if (st.buzz) m = 0.8 + 0.25 * (m - 0.8);
      m *= lit * (0.7 + 0.3 * sstep(0, 0.035, e));                                                         // the ends lie thin on the skin: darker, or the skin's shine greys them
      const i = ((r.y + py) * SW + r.x + px) * 4, s = band * sh[0];
      d[i] += (hair[0] * m + s - d[i]) * k; d[i + 1] += (hair[1] * m + s * 0.95 - d[i + 1]) * k; d[i + 2] += (hair[2] * m + s * 0.88 - d[i + 2]) * k;
    }
  }
}

// The strand sheet for the pieces that hang free: strands run down it, root to tip; the lower part is
// cut away between them so every lock ends in its own point.
function paintStrands(d, SW, r, st, hair0, look) {
  const hair = [Math.max(hair0[0], 26), Math.max(hair0[1], 22), Math.max(hair0[2], 20)];
  const w = r.w, h = r.h, seed = 60 + look * 3, lumHair = (hair[0] + hair[1] + hair[2]) / 765, gloss = 44 + 70 * lumHair;
  const len = new Float32Array(w);
  for (let px = 0; px < w; px++) len[px] = st.curls ? 0.6 + 0.3 * Math.abs(Math.sin(px * 0.2 + 3 * vnw(px * 0.05, 0, seed, 1024)))
    : 0.5 + 0.5 * (0.6 * vnw(px * 96 / w, 0, seed + 2, 96) + 0.4 * vnw(px * 256 / w, 0, seed + 3, 256));
  for (let py = 0; py < h; py++) {
    const v = (py + 0.5) / h, lit = (0.85 + 0.25 * g(v, 0.5, 0.3)) * (st.tail ? 1 - 0.55 * g(v, 0.14, 0.022) : 1), band = gloss * g(v, 0.42, 0.2);   // (the tail's band)
    for (let px = 0; px < w; px++) {
      const i = ((r.y + py) * SW + r.x + px) * 4, sway = px + 4 * Math.sin(py / 19 + px / 50);
      const fine = vnw(sway * 192 / w, v * 2.2, seed, 192), broad = 0.4 + vnw(sway * 44 / w, v * 1.4, seed + 1, 44);
      const m = (0.62 + 0.62 * fine * broad) * lit, s = band * fine * fine * broad;
      d[i] = hair[0] * m + s; d[i + 1] = hair[1] * m + s * 0.95; d[i + 2] = hair[2] * m + s * 0.88;
      d[i + 3] = v < 0.42 || (v - 0.42) / 0.58 < len[px] ? 255 : 0;
    }
  }
}
