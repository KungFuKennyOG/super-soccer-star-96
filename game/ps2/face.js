// The painted head: skin, a soft generic face, ears, the hair's roots on the scalp, and the strands
// for the hair mesh. Everything is painted from scratch in the head's own (phi, t) coordinates
// (headgeo.js), with the light and shade painted in. Faces are generic: a look only changes skin,
// hair, eye color, stubble and a few proportions. No photos, no likenesses.
import { R } from './kit.js';
import { mix, sstep, gauss as g, hash, vnoise, fbm, eachPixel, shadeSkin } from './paint.js';
import { phiOfU, hairline, F } from './headgeo.js';

const EYES = [[62, 40, 24], [46, 31, 20], [74, 96, 116], [76, 92, 60], [38, 27, 20]];
const blend = (c, to, k) => { c[0] = mix(c[0], to[0], k); c[1] = mix(c[1], to[1], k); c[2] = mix(c[2], to[2], k); };
const dim = (c, k) => { c[0] *= 1 - k; c[1] *= 1 - k; c[2] *= 1 - k; };

// skin, hair: [r, g, b]. st: a style from HAIR2. look: an integer that varies the face a little.
export function paintHead(ctx, { skin, hair, st, stubble = false, look = 0 }) {
  const h1 = hash(look, 1, 5), h2 = hash(look, 2, 5), h3 = hash(look, 3, 5);
  const noseW = 0.9 + 0.3 * h1, lipFull = 0.85 + 0.35 * h2, browH = 0.019 + 0.007 * h3, eyeCol = EYES[look % EYES.length];
  const darkSkin = 1 - (skin[0] + skin[1] + skin[2]) / 765, lipCol = [skin[0] * 0.84, skin[1] * (0.62 + 0.12 * darkSkin), skin[2] * (0.64 + 0.1 * darkSkin)];
  const rootCol = hair.map(v => v * 0.9 + 6), stubCol = [hair[0] * 0.5 + skin[0] * 0.3, hair[1] * 0.5 + skin[1] * 0.3, hair[2] * 0.5 + skin[2] * 0.32];
  ctx.fillStyle = `rgb(${skin.join(',')})`; ctx.fillRect(R.head.x, R.head.y, R.head.w, R.head.h);
  eachPixel(ctx, R.head, (u, t, c, px, py) => {
    const phi = phiOfU(u), ap = Math.abs(phi);
    // skin: never flat. Ruddier cheeks, nose and ears; a little blotchy; paler where the bone is close
    const ruddy = 0.55 * g(ap, 0.66, 0.3) * g(t, 0.63, 0.07) + 0.45 * g(phi, 0, 0.14) * g(t, 0.63, 0.035) + 0.6 * g(ap, 1.68, 0.14) * g(t, 0.565, 0.07) + 0.2 * g(phi, 0, 0.4) * g(t, 0.9, 0.04);
    c[0] *= 1 + 0.04 * ruddy; c[1] *= 1 - 0.08 * ruddy; c[2] *= 1 - 0.09 * ruddy;
    let m = 0.97 + 0.07 * (fbm(phi * 9, t * 26, look + 2) - 0.5) + 0.07 * (fbm(phi * 34, t * 95, look + 4) - 0.5) + 0.045 * (hash(px, py, look) - 0.5);   // blotches, mottling, pores
    // the light comes from above and in front
    m += 0.05 * g(phi, 0, 0.5) * g(t, 0.33, 0.05);                                    // forehead
    m -= 0.03 * (g(t, 0.3, 0.004) + g(t, 0.35, 0.004)) * g(phi, 0.1, 0.4) * h3;       // a line or two across it
    m -= 0.2 * g(ap, 0.37, 0.13) * g(t, F.eye - 0.018, 0.024);                           // the eyes sit back in shade
    m -= 0.09 * sstep(F.hair + 0.07, F.hair - 0.01, t) * g(phi, 0, 1.2);                // the hair's shadow on the forehead                          // under the brow
    m -= 0.12 * g(ap, 0.34, 0.15) * g(t, F.eye + 0.034, 0.013);                       // under the eye
    m -= 0.05 * g(ap, 0.18, 0.05) * g(t, F.eye, 0.03);                                // either side of the bridge
    m += 0.04 * g(phi, 0, 0.04) * g(t, 0.57, 0.06);                                   // ridge of the nose
    m -= 0.1 * g(ap, 0.115 * noseW, 0.05) * g(t, 0.59, 0.05);                         // its sides
    m += 0.03 * g(phi, 0, 0.05) * g(t, F.tip - 0.006, 0.01);                         // the tip
    m -= 0.1 * g(ap, 0.17 * noseW, 0.02) * g(t, F.tip + 0.012, 0.014);                // round the wings
    m -= 0.16 * g(phi, 0, 0.11 * noseW) * g(t, F.sub + 0.002, 0.008);                 // under the nose
    m -= 0.5 * g(ap, 0.075 * noseW, 0.03) * g(t, F.sub - 0.008, 0.006);               // nostrils
    m -= 0.05 * g(phi, 0, 0.03) * g(t, 0.71, 0.02);                                   // the groove above the lip
    m -= 0.08 * g(ap, 0.2 + (t - 0.66) * 2.0, 0.026) * g(t, 0.715, 0.04);            // nose to mouth lines
    m += 0.055 * g(ap, 0.58, 0.2) * g(t, 0.585, 0.03);                                // cheekbones
    m -= 0.08 * g(ap, 0.82, 0.26) * g(t, 0.73, 0.06);                                  // hollow cheeks
    m -= 0.11 * g(phi, 0, 0.2) * g(t, F.under - 0.004, 0.012);                        // under the lower lip
    m += 0.05 * g(phi, 0, 0.2) * g(t, F.chin - 0.01, 0.03);                           // chin
    m -= 0.17 * sstep(0.75, 1.5, ap) * sstep(0.3, 0.5, t);                             // the sides of the head turn from the light
    m -= 0.36 * sstep(0.925, 0.99, t);                                                // under the jaw
    m -= 0.25 * g(ap, 1.72, 0.06) * g(t, 0.555, 0.03) - 0.07 * g(ap, 1.84, 0.05) * g(t, 0.55, 0.06) + 0.1 * g(ap, 1.6, 0.03) * g(t, 0.565, 0.02);   // ears
    shadeSkin(c, m);

    // mouth
    const lipW = 0.33, across = Math.max(0, 1 - (ap / lipW) ** 2), bow = 1 - 0.3 * g(ap, 0, 0.04) + 0.15 * g(ap, 0.08, 0.04);
    const top = F.mouth - 0.027 * lipFull * across ** 0.8 * bow, bot = F.mouth + 0.036 * lipFull * across ** 0.7;
    const upper = t < F.mouth ? sstep(top - 0.004, top + 0.004, t) * sstep(lipW, lipW - 0.05, ap) : 0;
    const lower = t >= F.mouth ? sstep(bot + 0.004, bot - 0.006, t) * sstep(lipW, lipW - 0.05, ap) : 0;
    blend(c, lipCol, 0.85 * upper + 0.75 * lower);
    if (upper + lower > 0) dim(c, 0.05 * vnoise(px * 1.3, py * 0.2, 17) * (upper + lower) + 0.12 * upper);
    const lit = lower * g(t, F.mouth + 0.016, 0.007) * g(phi, 0, 0.14) * 0.13; c[0] += 255 * lit; c[1] += 235 * lit; c[2] += 225 * lit;
    dim(c, 0.6 * g(t, F.mouth + 0.004 * g(ap, 0.24, 0.08) - 0.003 * g(ap, 0, 0.05), 0.0035) * sstep(lipW + 0.04, lipW - 0.02, ap));
    dim(c, 0.16 * g(ap, lipW + 0.02, 0.03) * g(t, F.mouth + 0.002, 0.012));                                      // the corners

    // eyes
    const ex = (ap - 0.365) / 0.165, ey = (t - F.eye - 0.003 * ex) / 0.026, lid = 1 - ex * ex;
    if (lid > 0) {
      const edge = (ey < 0 ? lid ** 0.7 : 0.8 * lid ** 0.9) - Math.abs(ey);            // > 0 inside the almond
      if (edge > -0.5) {
        const inside = sstep(-0.1, 0.1, edge), ix = (ap - 0.357) / 0.086, iy = (t - F.eye + 0.002) / 0.0265, ir = Math.hypot(ix, iy);
        const sh = sstep(0.3, -1, ey), eye = [224 - 46 * sh, 217 - 48 * sh, 208 - 46 * sh];
        blend(eye, [200, 150, 140], 0.5 * sstep(-0.5, -1, ex));                                                       // pink at the inner corner
        blend(eye, eyeCol.map((v, k) => v * (0.62 + 0.7 * sstep(1, 0.35, ir)) + 14 * vnoise(Math.atan2(iy, ix) * 5, ir * 3, k)), sstep(1.0, 0.88, ir));
        blend(eye, [9, 7, 7], sstep(0.5, 0.4, ir));
        blend(eye, [16, 11, 9], 0.6 * sstep(0.84, 1.0, ir) * sstep(1.1, 1.0, ir));
        blend(eye, [255, 255, 255], 0.9 * g(ix, phi > 0 ? -0.32 : 0.32, 0.15) * g(iy, -0.4, 0.19));
        blend(c, eye, inside);
        dim(c, (ey < 0 ? 0.8 : 0.28) * g(edge, 0, 0.2) * (ey < 0 ? 1 : sstep(-1, 0.4, ex)));                          // lash line above, softer below
      }
    }
    dim(c, 0.2 * g(t, F.eye - 0.041 + 0.006 * ex * ex, 0.0045) * sstep(1.3, 0.8, Math.abs(ex)));                       // the lid's crease
    dim(c, 0.07 * g(t, F.eye + 0.04 - 0.004 * ex, 0.005) * sstep(1.0, 0.2, Math.abs(ex + 0.2)));                      // under the eye

    // eyebrows: strokes of hair along an arch
    const bx = (ap - 0.15) / 0.47;
    if (bx > -0.1 && bx < 1.1) {
      const arch = F.brow + 0.002 - 0.017 * Math.sin(Math.PI * Math.min(1, bx * 0.9 + 0.1)) + 0.012 * bx * bx;
      const thick = browH * (0.55 + 0.6 * sstep(0, 0.25, bx)) * (1 - 0.65 * sstep(0.5, 1.05, bx));
      const k = sstep(thick, thick * 0.3, Math.abs(t - arch)) * sstep(-0.06, 0.06, bx) * sstep(1.06, 0.88, bx);
      blend(c, hair.map(v => v * 0.6), k * (0.7 + 0.3 * vnoise(px * 0.9 + py * 0.6, py * 0.25, 3)));
    }

    // stubble, and the shadow where it would grow
    const beard = sstep(0.68, 0.76, t) * sstep(1.7, 1.0, ap) * (1 - 0.9 * (upper + lower)) * (1 - 0.8 * g(ap, 0.66, 0.25) * g(t, 0.7, 0.06));
    const tash = g(t, 0.725, 0.022) * sstep(0.42, 0.3, ap) * (1 - upper);
    blend(c, stubCol, Math.max(beard, tash) * (stubble ? 0.24 + 0.2 * hash(px, py, 7) : 0.1));

    // hair: its roots on the scalp, soft at the hairline, sideburns in front of the ears
    const lim = hairline(st, phi) + 0.025 * (vnoise(px / 5, py / 9, 11) - 0.5);
    const burn = sstep(0.58, 0.5, t) * g(ap, 1.5, 0.05) * sstep(0.38, 0.46, t);
    let hk = Math.max(sstep(lim + 0.025, lim - 0.03, t), burn * 0.35);
    if (hk > 0) {
      const strand = 0.72 + 0.5 * vnoise(px * 0.8, py * 0.12, 21) * vnoise(px * 0.23, py * 0.05, 22);
      if (st.buzz) hk *= 0.5 + 0.22 * hash(px, py, 13);
      blend(c, rootCol.map(v => v * strand), hk);
    }
  });
  // strands for the hair mesh: fine streaks from the crown to the ends, a band of sheen, and past the
  // hairline the strands end at different lengths (see-through between them)
  ctx.fillStyle = `rgb(${hair.join(',')})`; ctx.fillRect(R.hair.x, R.hair.y, R.hair.w, R.hair.h);
  eachPixel(ctx, R.hair, (u, v, c, px, py) => {
    const sway = px + 5 * Math.sin(py / 21 + px / 60);
    const fine = vnoise(sway * 0.75, py * 0.045, 31), broad = vnoise(sway * 0.16, py * 0.03, 32);
    const m = 0.62 + 0.55 * fine * (0.5 + broad) + 0.25 * g(v, 0.3, 0.2) * fine - 0.18 * sstep(0.6, 0.8, v);
    const sheen = 26 * g(v, 0.3, 0.16) * fine * fine;
    c[0] = Math.min(255, c[0] * m + sheen); c[1] = Math.min(255, c[1] * m + sheen); c[2] = Math.min(255, c[2] * m + sheen * 1.1);
    if (v < 0.8) return 255;
    const len = 0.25 + 0.75 * (0.6 * vnoise(px * 0.22, 0, 41) + 0.4 * vnoise(px * 0.7, 0, 42));
    return (v - 0.8) / 0.2 < len ? 255 : 0;
  });
}
