// Hair as a solid low-poly shell over the head, the way the PS1 / Model 3 footballers wore it: a
// "helmet" that follows the skull and stops at the hairline (low on the back, higher at the temples,
// highest at the forehead), with per-style volume, a flat top, or a mullet / long hair hanging down.
// Built into the player's single skinned mesh by body.js.

// front, side, back: where the hair stops, as a fraction of the way from the crown (0) to the chin (1)
// off: how far it stands off the skull. tail: how far it hangs below that at the back (m); sides: at the sides.
export const HAIR_STYLES = [
  { name: 'crop', off: 0.008, front: 0.29, side: 0.42, back: 0.62 },
  { name: 'curly', off: 0.034, front: 0.27, side: 0.48, back: 0.64, curls: 0.011 },
  { name: 'shaved', none: true },
  { name: 'mullet', off: 0.014, front: 0.3, side: 0.45, back: 0.66, tail: 0.2 },
  { name: 'long', off: 0.018, front: 0.28, side: 0.56, back: 0.66, tail: 0.27, sides: 0.15 },
  { name: 'flattop', off: 0.016, front: 0.3, side: 0.42, back: 0.6, flat: 0.105 },
];

// b: the Builder from body.js. H: the head ellipsoid { cx, cy, cz, rx, ry, rz }. region: atlas rect.
// w: skin weights for every hair vertex.
export function hairShell(b, style, H, region, w) {
  const st = HAIR_STYLES[style % HAIR_STYLES.length];
  if (st.none) return;
  const seg = 16, rows = 6, extra = st.tail ? 2 : 0, total = rows + extra;
  const start = b.pos.length / 3;
  for (let j = 0; j <= total; j++) {
    for (let i = 0; i <= seg; i++) {
      const a = Math.PI + i / seg * Math.PI * 2, front = Math.cos(a), side = Math.abs(Math.sin(a));
      const lim = front > 0 ? st.side + (st.front - st.side) * front : st.side + (st.back - st.side) * -front;
      const t = Math.min(j, rows) / rows * lim * Math.PI;
      let off = st.off;
      if (st.curls) off += st.curls * Math.sin(a * 5 + j) * Math.sin(t * 4 + 0.5);
      const rx = H.rx + off, ry = H.ry + off, rz = H.rz + off;
      let x = H.cx + Math.sin(a) * Math.sin(t) * rx, y = H.cy + Math.cos(t) * ry, z = H.cz + Math.cos(a) * Math.sin(t) * rz;
      if (st.flat) y = Math.min(y, H.cy + st.flat);
      if (j > rows) {                                   // hanging part: down the back (and sides for long hair)
        const k = (j - rows) / extra;
        const drop = st.tail * k * Math.max(0, -front) + (st.sides || 0) * k * side * (front < 0.05 ? 1 : 0);
        if (drop > 0.002) {                              // elsewhere the extra rows sit on the hairline (no area)
          y -= drop;
          x *= 1 + 0.12 * k * side; z -= 0.025 * k * Math.max(0, -front);
        }
      }
      b.vert([x, y, z], (region.x + region.w * i / seg) / b.size, (region.y + region.h * Math.min(0.999, j / total)) / b.size, w);
    }
  }
  const n = seg + 1;
  for (let j = 0; j < total; j++) for (let i = 0; i < seg; i++) {
    const p = start + j * n + i, q = p + n;
    b.idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
}
