// The head's sculpt, modelled on the FIFA 98 heads: rather than an egg with a face painted on, the
// face is built in the geometry (brow ridge, deep-set eyes, a nose with a bridge, tip and nostril
// wings, a muzzle with lips, a chin, cheekbones over hollow cheeks, square jaw corners, ears, the
// back of the skull). The face texture (atlas.js) only adds color: brows, eyes, lips, stubble.
//
// faceSculpt(phi, t) → [out, dy]: phi is the angle round the head from the nose (0 = front, ±pi = back,
// +pi/2 = the player's left), t runs from the crown (0) to the chin (1). out pushes the surface out
// along the horizontal, dy moves it up or down (metres).

const g = (v, c, w) => { const k = (v - c) / w; return Math.exp(-k * k); };

export function faceSculpt(phi, t) {
  const ap = Math.abs(phi), front = g(phi, 0, 1.1);
  let out = 0, dy = 0;
  out += 0.007 * g(ap, 0.6, 0.35) * g(t, 0.55, 0.22);                 // a flatter, broader face front
  out += 0.012 * g(phi, 0, 0.9) * g(t, 0.395, 0.05);                  // heavy brow ridge
  out -= 0.013 * g(ap, 0.37, 0.17) * g(t, 0.455, 0.05);               // deep-set eyes
  out += 0.011 * g(phi, 0, 0.11) * g(t, 0.47, 0.035);                 // bridge of the nose
  out += 0.026 * g(phi, 0, 0.13) * g(t, 0.565, 0.045);                // nose
  out += 0.012 * g(ap, 0.15, 0.07) * g(t, 0.59, 0.03);                // nostril wings
  out += 0.009 * g(phi, 0, 0.5) * g(t, 0.665, 0.06);                  // muzzle
  out += 0.004 * g(phi, 0, 0.32) * g(t, 0.66, 0.018);                 // upper lip
  out += 0.006 * g(phi, 0, 0.3) * g(t, 0.7, 0.02);                    // lower lip
  out -= 0.005 * g(ap, 0.4, 0.08) * g(t, 0.68, 0.03);                 // mouth corners
  out -= 0.005 * g(phi, 0, 0.3) * g(t, 0.745, 0.022);                 // under the lower lip
  out += 0.016 * g(phi, 0, 0.42) * g(t, 0.83, 0.07);                  // square chin
  out += 0.008 * g(ap, 0.78, 0.25) * g(t, 0.52, 0.06);                // cheekbones
  out -= 0.008 * g(ap, 0.82, 0.25) * g(t, 0.66, 0.07);                // hollow cheeks
  out += 0.016 * g(ap, 1.4, 0.4) * g(t, 0.78, 0.09);                 // strong jaw corners
  out -= 0.006 * g(ap, 1.12, 0.25) * g(t, 0.34, 0.08);                // temples
  out += 0.016 * g(ap, 1.57, 0.13) * g(t, 0.52, 0.07);                // ears
  out += 0.008 * g(ap, Math.PI, 0.7) * g(t, 0.55, 0.12);              // back of the skull
  dy -= 0.01 * front * g(t, 0.95, 0.08);                              // the chin's underside
  return [out, dy];
}
