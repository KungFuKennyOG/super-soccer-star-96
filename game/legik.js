// Putting a boot where it needs to be: where a leg's ankle is in the current pose (FK), and the hip
// and knee angles that take it to a target (two-bone IK). Everything is in the model's own space:
// metres, +z the way the player faces, +x his left, y up, the origin on the grass under him.
// Legs are named by their bone suffix: 'L' or 'R'.
import * as THREE from 'three';

const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const leg = (bn, n) => ({ up: bn['upperLeg' + n], lo: bn['lowerLeg' + n], ft: bn['foot' + n] });

// Where the ankle is in the current pose (out: Vector3).
export function ankleOf(bn, n, out) {
  const { up, lo, ft } = leg(bn, n), h = bn.hips;
  q1.copy(h.quaternion);
  out.copy(up.position).applyQuaternion(q1).add(h.position);     // the hip joint
  q1.multiply(up.quaternion);
  out.add(v1.copy(lo.position).applyQuaternion(q1));             // the knee
  q1.multiply(lo.quaternion);
  return out.add(v1.copy(ft.position).applyQuaternion(q1));
}

// Which way the foot points in the current pose (out: Quaternion).
export function footOf(bn, n, out) {
  const { up, lo, ft } = leg(bn, n);
  return out.copy(bn.hips.quaternion).multiply(up.quaternion).multiply(lo.quaternion).multiply(ft.quaternion);
}

// Bends the hip and knee so the ankle is at `target` (Vector3), the knee folding forward. A target out of
// reach gets a straight leg pointing at it. Returns how far short it fell (0 when reached).
export function reachLeg(bn, n, target) {
  const { up, lo, ft } = leg(bn, n), h = bn.hips;
  const L1 = lo.position.length(), L2 = ft.position.length();
  // the target as the thigh's parent (the hips) sees it, from the hip joint
  v1.copy(up.position).applyQuaternion(h.quaternion).add(h.position);
  v2.copy(target).sub(v1).applyQuaternion(q2.copy(h.quaternion).invert());
  const want = v2.length(), D = Math.min(L1 + L2 - 0.004, Math.max(Math.abs(L1 - L2) + 0.03, want));
  if (want > 1e-6) v2.multiplyScalar(D / want);
  // knee: the law of cosines; then lean the thigh sideways (z) and swing it (x) so the ankle lands there
  const knee = Math.acos(Math.min(1, Math.max(-1, (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
  const wy = -(L1 + L2 * Math.cos(knee)), wz = -L2 * Math.sin(knee);
  const side = Math.asin(Math.min(0.95, Math.max(-0.95, -v2.x / wy)));
  const swing = Math.atan2(v2.z, v2.y) - Math.atan2(wz, wy * Math.cos(side));
  up.rotation.set(Math.atan2(Math.sin(swing), Math.cos(swing)), 0, side);
  lo.rotation.set(knee, 0, 0);
  return Math.max(0, want - D);
}

// Turns the foot so it points the way `q` says (Quaternion, model space) whatever the leg is doing.
export function aimFoot(bn, n, q) {
  const { up, lo, ft } = leg(bn, n);
  q1.copy(bn.hips.quaternion).multiply(up.quaternion).multiply(lo.quaternion).invert();
  ft.quaternion.copy(q1.multiply(q));
}
