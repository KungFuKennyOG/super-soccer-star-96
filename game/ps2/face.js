// The painted head: skin, a soft generic face, ears, the hair's roots on the scalp, and the strands
// for the hair mesh. Everything is painted from scratch in the head's own (phi, t) coordinates
// (headgeo.js), with the light and shade painted in. Faces are generic: a look only changes skin,
// hair, eye color, stubble and a few proportions. No photos, no likenesses.
import { R } from './kit.js';
import { clamp01, mix, sstep, gauss as g, hash, vnoise, fbm, eachPixel, shadeSkin } from './paint.js';
import { phiOfU, hairline } from './headgeo.js';

const EYES = [[58, 38, 24], [44, 30, 20], [70, 92, 110], [72, 88, 58], [36, 26, 20]];
const blend = (c, to, k) => { c[0] = mix(c[0], to[0], k); c[1] = mix(c[1], to[1], k); c[2] = mix(c[2], to[2], k); };

// skin, hair: [r, g, b]. st: a style from HAIR2. look: an integer that varies the face a little.
export function paintHead(ctx, { skin, hair, st, stubble = false, look = 0 }) {
  const h1 = hash(look, 1, 5), h2 = hash(look, 2, 5), h3 = hash(look, 3, 5);
  const noseW = 0.9 + 0.3 * h1, lipFull = 0.85 + 0.4 * h2, browH = 0.011 + 0.005 * h3, eyeCol = EYES[look % EYES.length];
  const darkSkin = 1 - (skin[0] + skin[1] + skin[2]) / 765, lipCol = [skin[0] * 0.86, skin[1] * (0.66 + 0.1 * darkSkin), skin[2] * (0.68 + 0.08 * darkSkin)];
  const rootCol = hair.map(v => v * 0.9 + 6), stubCol = [hair[0] * 0.5 + skin[0] * 0.3, hair[1] * 0.5 + skin[1] * 0.3, hair[2] * 0.5 + skin[2] * 0.32];
  ctx.fillStyle = `rgb(${skin.join(',')})`; ctx.fillRect(R.head.x, R.head.y, R.head.w, R.head.h);
  eachPixel(ctx, R.head, (u, t, c, px, py) => {
    const phi = phiOfU(u), ap = Math.abs(phi), front = g(phi, 0, 0.9);
    // skin: never flat. Ruddier cheeks, nose and ears; a little blotchy
    const ruddy = 0.5 * g(ap, 0.62, 0.3) * g(t, 0.6, 0.07) + 0.4 * g(phi, 0, 0.14) * g(t, 0.59, 0.035) + 0.5 * g(ap, 1.6, 0.14) * g(t, 0.53, 0.07);
    c[0] *= 1 + 0.035 * ruddy; c[1] *= 1 - 0.07 * ruddy; c[2] *= 1 - 0.08 * ruddy;
    let m = 0.97 + 0.06 * (fbm(px / 26, py / 26, look + 2) - 0.5) + 0.02 * (hash(px, py, look) - 0.5);
    // the light comes from above and in front
    m += 0.05 * g(phi, 0, 0.5) * g(t, 0.34, 0.06);                                    // forehead
    m -= 0.16 * g(ap, 0.37, 0.2) * g(t, 0.468, 0.022);                                // under the brow
    m -= 0.07 * g(ap, 0.37, 0.17) * g(t, 0.514, 0.014);                               // under the eye
    m += 0.07 * g(phi, 0, 0.045) * g(t, 0.55, 0.055);                                 // ridge of the nose
    m -= 0.1 * g(ap, 0.115 * noseW, 0.05) * g(t, 0.56, 0.05);                         // its sides
    m += 0.05 * g(phi, 0, 0.06) * g(t, 0.598, 0.012);                                 // the tip
    m -= 0.2 * g(phi, 0, 0.15 * noseW) * g(t, 0.634, 0.011);                          // under the nose
    m -= 0.45 * g(ap, 0.075 * noseW, 0.032) * g(t, 0.628, 0.007);                     // nostrils
    m -= 0.07 * g(ap, 0.25 + (t - 0.62) * 1.1, 0.035) * g(t, 0.67, 0.045);            // nose to mouth lines
    m += 0.05 * g(ap, 0.58, 0.2) * g(t, 0.55, 0.035);                                 // cheekbones
    m -= 0.08 * g(ap, 0.82, 0.3) * g(t, 0.69, 0.07);                                  // hollow cheeks
    m -= 0.09 * g(phi, 0, 0.2) * g(t, 0.75, 0.014);                                   // under the lower lip
    m += 0.05 * g(phi, 0, 0.2) * g(t, 0.815, 0.035);                                  // chin
    m -= 0.07 * sstep(0.9, 1.6, ap) * sstep(0.3, 0.5, t);                             // the sides of the head turn from the light
    m -= 0.3 * sstep(0.875, 0.96, t) * front + 0.22 * sstep(0.84, 0.96, t) * (1 - front);   // under the jaw
    // ears: the rim, the hollow inside it
    m -= 0.22 * g(ap, 1.6, 0.07) * g(t, 0.525, 0.028) - 0.06 * g(ap, 1.72, 0.05) * g(t, 0.52, 0.05);
    shadeSkin(c, m);

    // mouth
    const lipW = 0.34 * (1 - 0.25 * g(t, 0.7, 0.03) * 0), inLip = sstep(lipW, lipW - 0.06, ap);
    const upper = inLip * sstep(0.697 - 0.016 * lipFull * (1 - 0.25 * g(ap, 0, 0.04) + 0.2 * g(ap, 0.07, 0.04)) * (1 - (ap / lipW) ** 2), 0.697, t) * (t < 0.6975 ? 1 : 0);
    const lower = inLip * (t >= 0.6975 ? 1 : 0) * sstep(0.6975 + 0.025 * lipFull * (1 - (ap / (lipW * 0.9)) ** 2), 0.6975 + 0.015 * lipFull * (1 - (ap / (lipW * 0.9)) ** 2), t);
    blend(c, lipCol, 0.8 * upper + 0.72 * lower);
    const lit = lower * g(t, 0.708, 0.006) * g(phi, 0, 0.12) * 0.12; c[0] += 255 * lit; c[1] += 235 * lit; c[2] += 225 * lit;
    const line = 0.55 * g(t, 0.6975 + 0.003 * g(ap, 0.2, 0.08), 0.0035) * sstep(lipW + 0.03, lipW - 0.03, ap); c[0] *= 1 - line; c[1] *= 1 - line * 1.05; c[2] *= 1 - line * 1.05;

    // eyes
    const ex = (ap - 0.37) / 0.15, ey = (t - 0.4875 - 0.002 * ex) / 0.0155, lid = 1 - ex * ex;
    if (lid > 0) {
      const edge = (ey < 0 ? lid ** 0.75 : 0.85 * lid ** 0.9) - Math.abs(ey);          // > 0 inside the almond
      if (edge > -0.5) {
        const inside = sstep(-0.12, 0.12, edge);
        const ix = (ap - 0.365) / 0.066, iy = (t - 0.4865) / 0.0175, ir = Math.hypot(ix, iy);
        const white = [226 - 40 * sstep(0.2, -1, ey), 218 - 42 * sstep(0.2, -1, ey), 208 - 40 * sstep(0.2, -1, ey)];
        const eye = white.slice();
        blend(eye, eyeCol.map(v => v * (0.7 + 0.5 * sstep(1, 0.3, ir))), sstep(1.0, 0.86, ir));
        blend(eye, [10, 8, 8], sstep(0.5, 0.38, ir));
        blend(eye, [14, 10, 8], 0.55 * sstep(0.84, 1.0, ir) * sstep(1.08, 1.0, ir));
        const glint = g(ix, phi > 0 ? -0.3 : 0.3, 0.16) * g(iy, -0.38, 0.2); blend(eye, [255, 255, 255], 0.85 * glint);
        blend(c, eye, inside);
        const lash = (ey < 0 ? 0.75 : 0.3) * g(edge, 0, 0.22) * (ey < 0 ? 1 : sstep(-1, 0.4, ex)); c[0] *= 1 - lash; c[1] *= 1 - lash; c[2] *= 1 - lash;   // lash line above, softer below
      }
    }
    const crease = 0.16 * g(t, 0.465 + 0.004 * ex * ex, 0.0035) * sstep(1.25, 0.8, Math.abs(ex)); c[0] *= 1 - crease; c[1] *= 1 - crease; c[2] *= 1 - crease;

    // eyebrows: strokes of hair along an arch
    const bx = (ap - 0.17) / 0.46;
    if (bx > -0.1 && bx < 1.1) {
      const arch = 0.447 - 0.012 * Math.sin(Math.PI * Math.min(1, bx * 0.9 + 0.1)) + 0.006 * bx * bx;
      const thick = browH * (0.55 + 0.6 * sstep(0, 0.25, bx)) * (1 - 0.6 * sstep(0.55, 1.05, bx));
      const k = sstep(thick, thick * 0.35, Math.abs(t - arch)) * sstep(-0.06, 0.06, bx) * sstep(1.06, 0.9, bx);
      blend(c, hair.map(v => v * 0.75), k * (0.62 + 0.3 * vnoise(px * 0.9 + py * 0.5, py * 0.22, 3)));
    }

    // stubble, and the shadow where it would grow
    const beard = sstep(0.615, 0.7, t) * sstep(1.65, 1.0, ap) * (1 - 0.9 * (upper + lower)) * (1 - 0.8 * g(ap, 0.62, 0.25) * g(t, 0.62, 0.05));
    blend(c, stubCol, beard * (stubble ? 0.16 + 0.14 * hash(px, py, 7) : 0.05));

    // hair: its roots on the scalp, soft at the hairline, sideburns in front of the ears
    const lim = hairline(st, phi) + 0.012 * (vnoise(px / 5, py / 9, 11) - 0.5);
    const burn = sstep(0.59, 0.5, t) * g(ap, 1.36, 0.075) * sstep(0.38, 0.44, t);
    let hk = Math.max(sstep(lim + 0.018, lim - 0.02, t), burn * 0.9);
    if (hk > 0) {
      const strand = 0.72 + 0.5 * vnoise(px * 0.8, py * 0.12, 21) * vnoise(px * 0.23, py * 0.05, 22);
      if (st.buzz) hk *= 0.52 + 0.2 * hash(px, py, 13);
      blend(c, rootCol.map(v => v * strand), hk);
    }
  });
  // strands for the hair mesh: fine streaks from the crown to the ends, with a band of sheen
  ctx.fillStyle = `rgb(${hair.join(',')})`; ctx.fillRect(R.hair.x, R.hair.y, R.hair.w, R.hair.h);
  eachPixel(ctx, R.hair, (u, v, c, px, py) => {
    const sway = px + 5 * Math.sin(py / 21 + px / 60);
    const fine = vnoise(sway * 0.75, py * 0.045, 31), broad = vnoise(sway * 0.16, py * 0.03, 32);
    const m = 0.62 + 0.55 * fine * (0.5 + broad) + 0.25 * g(v, 0.36, 0.2) * fine - 0.2 * sstep(0.8, 1, v);
    const sheen = 26 * g(v, 0.36, 0.16) * fine * fine;
    c[0] = clamp01((c[0] * m + sheen) / 255) * 255; c[1] = clamp01((c[1] * m + sheen) / 255) * 255; c[2] = clamp01((c[2] * m + sheen * 1.1) / 255) * 255;
  });
}
