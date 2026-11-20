// Moves played over the run cycle (game/actors.js): the bicycle kick and the header (m.special), the
// goal dance's guide, and celebrating. Each is laid over a body that is already posed.
import * as THREE from 'three';
import { ankleOf, footOf, reachLeg, aimFoot } from './legik.js';

const q = new THREE.Quaternion(), eul = new THREE.Euler();
const aL = new THREE.Vector3(), aR = new THREE.Vector3(), fL = new THREE.Quaternion(), fR = new THREE.Quaternion();
const frac = x => x - Math.floor(x), smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

// Moves the hips (dy up, dx to his left) with the feet staying where they are on the grass: the knees
// bend as he sinks. Going up past standing the feet leave the ground, coming `tuck` of the way with him.
function ride(bn, dy, dx = 0, tuck = 0.8) {
  ankleOf(bn, 'L', aL); ankleOf(bn, 'R', aR); footOf(bn, 'L', fL); footOf(bn, 'R', fR);
  bn.hips.position.y += dy; bn.hips.position.x += dx;
  if (dy > 0) { aL.y += dy * tuck; aR.y += dy * tuck; }
  reachLeg(bn, 'L', aL); aimFoot(bn, 'L', fL); reachLeg(bn, 'R', aR); aimFoot(bn, 'R', fR);
}

// Moves from the air (m.special = { kind, t }, set on the frame the ball is met): the bicycle kick throws
// the body back and swings the striking leg over the head; a header is met at the top of a jump, the trunk
// and neck thrown through it, then he comes down and the knees take it.
export function specialPose(bn, sp) {
  if (sp.kind === 'bicycle') {
    const k = Math.min(1, sp.t / 0.9), up = Math.sin(Math.PI * Math.min(1, k * 1.4));
    bn.hips.rotation.x = -1.5 * up; bn.hips.position.y += 0.55 * up;
    bn.upperLegR.rotation.x = -2.7 * up; bn.lowerLegR.rotation.x = 0.3 * (1 - up);
    bn.upperLegL.rotation.x = -0.9 * up; bn.lowerLegL.rotation.x = 1.2 * up;
    bn.upperArmL.rotation.set(0, 0, 1.4 * up); bn.upperArmR.rotation.set(0, 0, -1.4 * up);
    bn.neck.rotation.x = 0.4 * up;
  } else if (sp.kind === 'header') {
    const t = sp.t, into = smooth(t / 0.04), air = t < 0.3 ? 1 - (t / 0.3) ** 2 : 0, land = t < 0.3 ? 0 : Math.sin(Math.PI * Math.min(1, (t - 0.3) / 0.45));
    const thrown = into * (1 - smooth(t / 0.45)), arms = into * (1 - smooth((t - 0.12) / 0.5));
    ride(bn, into * (0.2 * air - 0.09 * land));
    bn.lowerLegL.rotation.x += 0.5 * air * into; bn.lowerLegR.rotation.x += 0.3 * air * into;      // heels up behind him in the air
    bn.spine.rotation.x += 0.32 * thrown + 0.1 * land; bn.neck.rotation.x += 0.38 * into * (1 - smooth(t / 0.3));
    bn.upperArmL.rotation.x += 0.5 * arms; bn.upperArmR.rotation.x += 0.5 * arms;                  // arms thrown back and out as the head goes through
    bn.upperArmL.rotation.z += 0.75 * arms; bn.upperArmR.rotation.z -= 0.75 * arms;
    bn.foreArmL.rotation.x -= 0.4 * arms; bn.foreArmR.rotation.x -= 0.4 * arms;
  }
}

// Teammates lead the goal dance facing you, so they mirror the move: your "left" is their right arm.
// The arms are the signal (straight and clear); the body bounces on the beat, swaying over planted feet.
const ARM = { up: 2.8, down: 0.2, out: 1.55 };
export function dancePose(bn, g) {
  const bounce = Math.abs(Math.sin(Math.PI * g.beat)), sway = Math.sin(Math.PI * g.beat);
  ride(bn, -0.1 * bounce, 0.035 * sway);
  bn.hips.rotation.z = -0.05 * sway;
  bn.spine.rotation.set(0.04 * bounce, 0, 0.07 * sway);
  bn.chest.rotation.set(0, 0.15 * sway, 0);
  bn.neck.rotation.set(0, 0, 0.12 * sway); bn.head.rotation.set(-0.05, 0, 0);
  let l = 'down', r = 'down';                       // the mate's own arms
  if (g.move === 'left') r = 'up';
  if (g.move === 'right') l = 'up';
  if (g.move === 'up') l = r = 'up';
  if (g.move === 'out') l = r = 'out';
  bn.upperArmL.rotation.set(0, 0, ARM[l]); bn.upperArmR.rotation.set(0, 0, -ARM[r]);
  bn.foreArmL.rotation.set(l === 'down' ? -0.25 : 0, 0, 0); bn.foreArmR.rotation.set(r === 'down' ? -0.25 : 0, 0, 0);
  bn.clavicleL.rotation.z = l === 'up' ? 0.25 : 0; bn.clavicleR.rotation.z = r === 'up' ? -0.25 : 0;
}

// Celebrating (gs: the gait state, game/gait.js; k: 0..1 how far into it he is, eased by the caller).
// Standing, he jumps: sinks, springs, hangs, lands on bent knees, each player in his own time and his own
// way (both arms up, a fist pumping, arms flung wide). Running to the scorer he doesn't jump: an arm
// punches the air or both are held out like wings.
export function celebratePose(bn, gs, t, k = 1) {
  const c = frac(t / 0.7 + gs.seed * 3), up = c < 0.5 ? 4 * (c / 0.5) * (1 - c / 0.5) : 0, down = c < 0.5 ? 0 : Math.sin(Math.PI * (c - 0.5) / 0.5);
  const stand = gs.idle * k, style = gs.c < 0.4 ? 0 : gs.c < 0.72 ? 1 : 2, pump = stand * (up - down);
  if (stand > 0.01) ride(bn, stand * (0.27 * up - 0.11 * down));
  bn.lowerLegL.rotation.x += 0.35 * up * stand; bn.lowerLegR.rotation.x += 0.55 * up * stand;
  bn.spine.rotation.x += stand * (0.12 * down - 0.1 * up); bn.neck.rotation.x -= k * (0.18 + 0.1 * up * stand);
  const run = gs.idle < 0.5;
  for (let i = 0; i < 2; i++) {
    const n = i ? 'R' : 'L', sd = i ? -1 : 1, ua = bn['upperArm' + n], fa = bn['foreArm' + n];
    let x = 0, z = 0, f = 0, lift = 0.3;
    if (run && style) { x = 0.15; z = 1.75 + sd * 0.25 * Math.sin(t * 2.6 + gs.seed * 9); f = 0.25; }                 // running: arms out like wings, tipping from side to side
    else if (run && i) { x = -0.35; z = 2.4; f = 0.5 + 0.5 * Math.sin(t * 9); }                                    // or the right fist punching the air as he goes
    else if (run) continue;
    else if (style === 0) { x = -0.15; z = 2.55 + 0.25 * pump; f = 0.3 + 0.5 * down * stand; }                    // standing: both arms thrown up
    else if (style === 1 && i) { x = -0.5; z = 2.3 + 0.3 * pump; f = 0.5 + 0.9 * (1 - Math.max(0, pump)); }       // the right fist pumping overhead
    else if (style === 1) { x = -0.25; z = 0.25; f = 1.5; lift = 0; }                                             // (the other clenched at his side)
    else { x = -1.15 - 0.35 * pump; z = 0.3; f = 1.7 - 0.9 * Math.max(0, pump); lift = 0.15; }                     // both fists shaken in front of him
    ua.quaternion.slerp(q.setFromEuler(eul.set(x, 0, sd * z)), k); fa.quaternion.slerp(q.setFromEuler(eul.set(-f, 0, 0)), k);
    bn['clavicle' + n].rotation.z += sd * lift * k;
  }
}
