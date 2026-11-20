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

const q3 = new THREE.Quaternion(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3(), basis = new THREE.Matrix4();
// Bends the shoulder and elbow so the wrist is at `target` (Vector3, model space), the elbow pointing the
// way `pole` says (Vector3, model space, need not be unit). Arms are named like legs: 'L' or 'R'. The
// trunk must be posed first. A target out of reach gets a straight arm pointing at it.
export function reachArm(bn, n, target, pole) {
  const up = bn['upperArm' + n], lo = bn['foreArm' + n], hand = bn['hand' + n], cl = bn['clavicle' + n];
  const L1 = lo.position.length(), L2 = hand.position.length();
  // the shoulder joint, and the frame the upper arm hangs in (hips, spine, chest, clavicle)
  q3.copy(bn.hips.quaternion); v3.copy(bn.spine.position).applyQuaternion(q3).add(bn.hips.position);
  q3.multiply(bn.spine.quaternion); v3.add(v4.copy(bn.chest.position).applyQuaternion(q3));
  q3.multiply(bn.chest.quaternion); v3.add(v4.copy(cl.position).applyQuaternion(q3));
  q3.multiply(cl.quaternion); v3.add(v4.copy(up.position).applyQuaternion(q3));
  q3.invert();
  v3.subVectors(target, v3).applyQuaternion(q3);                 // shoulder to wrist, as the clavicle sees it
  v4.copy(pole).applyQuaternion(q3);
  const want = v3.length(), D = Math.min(L1 + L2 - 0.003, Math.max(Math.abs(L1 - L2) + 0.03, want));
  v3.multiplyScalar(1 / (want || 1));
  v4.addScaledVector(v3, -v4.dot(v3)).normalize();               // the pole, square to the reach
  // the upper arm leans off the line to the wrist toward the pole; the forearm closes the triangle
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2))));
  v5.copy(v3).multiplyScalar(Math.cos(a)).addScaledVector(v4, Math.sin(a));     // along the upper arm
  // its bone: -y down the arm, +z the side the forearm folds to (away from the pole), x across
  v5.negate(); v4.negate(); v4.addScaledVector(v5, -v4.dot(v5)).normalize(); v3.crossVectors(v5, v4);
  up.quaternion.setFromRotationMatrix(basis.makeBasis(v3, v5, v4));
  lo.rotation.set(-bend, 0, 0);
}

// Turns the hand so it points the way `q` says (Quaternion, model space) whatever the arm is doing.
export function aimHand(bn, n, q) {
  q3.copy(bn.hips.quaternion).multiply(bn.spine.quaternion).multiply(bn.chest.quaternion).multiply(bn['clavicle' + n].quaternion)
    .multiply(bn['upperArm' + n].quaternion).multiply(bn['foreArm' + n].quaternion).invert();
  bn['hand' + n].quaternion.copy(q3.multiply(q));
}
