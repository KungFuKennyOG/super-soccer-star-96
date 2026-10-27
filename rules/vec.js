// Tiny 2D helpers on the ground plane ({ x, z }). Pure.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function norm(x, z) {
  const l = Math.hypot(x, z);
  return l > 1e-6 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
}

// rotate a ground vector by a radians (positive turns +X toward -Z)
export function rot(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.z * s, z: -v.x * s + v.z * c };
}

// Moves cur toward target by at most step; returns the new value.
export function approach(cur, target, step) {
  return cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
}

// Steers a velocity toward a desired one at most accel*dt in length.
export function steer(p, dvx, dvz, accel, dt) {
  const ex = dvx - p.vx, ez = dvz - p.vz, l = Math.hypot(ex, ez), m = accel * dt;
  if (l <= m) { p.vx = dvx; p.vz = dvz; } else { p.vx += ex / l * m; p.vz += ez / l * m; }
}
