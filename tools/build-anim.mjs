// Bakes motion-capture clips for the players (game/assets/anim/clips.js) from BVH files of the CMU
// Graphics Lab Motion Capture Database (mocap.cs.cmu.edu; free for any use, see the credit in the output).
// The BVH files themselves are not in the repo. Get the ones listed in CLIPS from the mirror:
//   git clone --filter=blob:none --no-checkout --depth 1 https://github.com/una-dinosauria/cmu-mocap
//   git -C cmu-mocap show HEAD:data/035/35_01.bvh > bvh/35_01.bvh      (and so on)
// then:  node tools/build-anim.mjs path/to/bvh [--report]
//
// What it does to a clip: reads the capture's skeleton and frames, works out every joint's rotation in
// the world, and gives each of the game's 22 bones (game/body.js) the rotation that points it the way
// the matching captured bone points (the two skeletons rest differently: the capture stands in a T with
// its legs apart, ours with arms down, so limbs are matched by direction and the trunk, head and feet by
// rotation). Heights are scaled by leg length. Walks and runs are cut to one stride, turned to face +z,
// kept on the spot, timed so the right foot is planted at phase 0 and the left at half way (the sim's
// stride, rules/dribble.js), and made to loop by fading two successive strides into each other.
import * as THREE from 'three';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildSkeleton } from '../game/body.js';

const [dir = 'bvh', ...flags] = process.argv.slice(2), REPORT = flags.includes('--report');
const OUT = fileURLToPath(new URL('../game/assets/anim/clips.js', import.meta.url));

// name: [file, kind, options]. Strides are sampled N times round the cycle.
const N = 36;
export const CLIPS = {
  walk: ['35_02', 'stride'], walkB: ['35_28', 'stride'], walkC: ['141_25', 'stride'],
  jog: ['16_36', 'stride'], jogB: ['35_20', 'stride'], jogC: ['143_01', 'stride'],
  run: ['09_06', 'stride'], runB: ['16_46', 'stride'], runC: ['127_07', 'stride'],
  // a 'loop' is [from, to] seconds of a capture played round and round, e.g. stand: ['137_28', 'loop', { from: 2, to: 12 }].
  // None is baked: the library's standing takes (113_21, 77_02, 141_20, 137_28) have a tilted or bowed head, fidgeting or hands on hips.
};

// game bone ← captured joint, and whether it is matched by direction (to the joint's first child)
const MAP = {
  hips: ['Hips', false], spine: ['Spine', false], chest: ['Spine1', false], neck: ['Neck1', false], head: ['Head', false],
  clavicleL: ['LeftShoulder', true], upperArmL: ['LeftArm', true], foreArmL: ['LeftForeArm', true], handL: ['LeftHand', true],
  clavicleR: ['RightShoulder', true], upperArmR: ['RightArm', true], foreArmR: ['RightForeArm', true], handR: ['RightHand', true],
  upperLegL: ['LeftUpLeg', true], lowerLegL: ['LeftLeg', true], footL: ['LeftFoot', false], toeL: ['LeftToeBase', false],
  upperLegR: ['RightUpLeg', true], lowerLegR: ['RightLeg', true], footR: ['RightFoot', false], toeR: ['RightToeBase', false],
};

/* ---------- reading a capture ---------- */

function parseBVH(text, fps) {
  const tok = text.split(/\s+/).filter(Boolean), joints = [];
  let i = 0, stack = [];
  const next = () => tok[i++];
  while (tok[i] !== 'MOTION') {
    const t = next();
    if (t === 'ROOT' || t === 'JOINT') { const j = { name: next(), parent: stack[stack.length - 1] ?? -1, offset: [0, 0, 0], channels: [], children: [] }; joints.push(j); if (j.parent >= 0) joints[j.parent].children.push(joints.length - 1); stack.push(joints.length - 1); }
    else if (t === 'End') { next(); next(); next(); const o = [+next(), +next(), +next()]; joints[stack[stack.length - 1]].end = o; next(); }   // End Site { OFFSET x y z }
    else if (t === 'OFFSET') joints[stack[stack.length - 1]].offset = [+next(), +next(), +next()];
    else if (t === 'CHANNELS') { const n = +next(); for (let k = 0; k < n; k++) joints[stack[stack.length - 1]].channels.push(next()); }
    else if (t === '}') stack.pop();
  }
  i++; if (next() !== 'Frames:') throw new Error('no frame count'); const frames = +next(); next(); next(); const dt = +next();
  const width = joints.reduce((s, j) => s + j.channels.length, 0), data = new Float64Array(frames * width);
  for (let k = 0; k < frames * width; k++) data[k] = +next();
  return { joints, frames, dt: fps ? 1 / fps : dt, width, data };
}

// Every joint's place and rotation in the world on frame f: { p: Vector3[], q: Quaternion[] }
const eul = new THREE.Euler(), D = Math.PI / 180;
function pose(bvh, f, out) {
  let c = f * bvh.width;
  bvh.joints.forEach((j, k) => {
    const p = out.p[k].fromArray(j.offset), q = out.q[k].identity();
    let rx = 0, ry = 0, rz = 0, order = '';
    for (const ch of j.channels) {
      const v = bvh.data[c++];
      if (ch === 'Xposition') p.x = v; else if (ch === 'Yposition') p.y = v; else if (ch === 'Zposition') p.z = v;
      else { order += ch[0]; if (ch[0] === 'X') rx = v * D; else if (ch[0] === 'Y') ry = v * D; else rz = v * D; }
    }
    if (order) q.setFromEuler(eul.set(rx, ry, rz, order));       // 'ZYX': about z, then y, then x, as the file lists them
    if (j.parent >= 0) { p.applyQuaternion(out.q[j.parent]).add(out.p[j.parent]); q.premultiply(out.q[j.parent]); }
  });
  return out;
}
const newPose = bvh => ({ p: bvh.joints.map(() => new THREE.Vector3()), q: bvh.joints.map(() => new THREE.Quaternion()) });

/* ---------- onto the game's skeleton ---------- */

const { bones } = buildSkeleton(), NAMES = bones.map(b => b.name).filter(n => n !== 'root'), byName = Object.fromEntries(bones.map(b => [b.name, b]));
const restOf = b => b.getWorldPosition(new THREE.Vector3());
bones[0].updateMatrixWorld(true);
const LEG = restOf(byName.upperLegL).distanceTo(restOf(byName.lowerLegL)) + restOf(byName.lowerLegL).distanceTo(restOf(byName.footL));
const HIP_UP = restOf(byName.hips).y - restOf(byName.upperLegL).y, ANKLE = restOf(byName.footL).y;

function rig(bvh) {
  const id = Object.fromEntries(bvh.joints.map((j, k) => [j.name, k])), J = n => bvh.joints[id[n]];
  const len = n => Math.hypot(...J(n).offset);
  const scale = LEG / ((len('LeftLeg') + len('LeftFoot') + len('RightLeg') + len('RightFoot')) / 2);
  // per bone: the captured joint, and the turn that lines our rest direction up with the capture's
  const align = {};
  for (const n of NAMES) {
    const [src, byDir] = MAP[n], a = new THREE.Quaternion();
    if (byDir) {
      const kid = bones.find(b => b.parent === byName[n]), ours = kid ? restOf(kid).sub(restOf(byName[n])).normalize() : new THREE.Vector3(0, -1, 0);   // (a hand has no bone below it: it hangs straight down)
      const theirs = new THREE.Vector3().fromArray(bvh.joints[J(src).children[0]]?.offset ?? J(src).end).normalize();
      a.setFromUnitVectors(ours, theirs);
    }
    align[n] = { k: id[src], a };
  }
  return { id, scale, align };
}

// The game pose for a captured pose: local rotations by bone name, hips' place (m), ankles (m, for timing).
const qw = {}, tmpQ = new THREE.Quaternion(), IDENT = new THREE.Quaternion();
for (const n of NAMES) qw[n] = new THREE.Quaternion();
function retarget(bvh, R, src, yaw, origin, out) {
  const turn = tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw).clone();
  for (const n of NAMES) qw[n].copy(turn).multiply(src.q[R.align[n].k]).multiply(R.align[n].a);
  for (const n of NAMES) { const par = byName[n].parent.name; out.q[n].copy(qw[n]); if (par !== 'root') out.q[n].premultiply(tmpQ.copy(qw[par]).invert()); }
  const hipJoint = src.p[R.id.LeftUpLeg].clone().add(src.p[R.id.RightUpLeg]).multiplyScalar(0.5);
  out.hips.copy(hipJoint).sub(origin).multiplyScalar(R.scale).applyQuaternion(turn); out.hips.y = (hipJoint.y - R.floor) * R.scale + ANKLE + HIP_UP;
  for (const s of ['Left', 'Right']) out['ankle' + s[0]].copy(src.p[R.id[s + 'Foot']]).sub(origin).multiplyScalar(R.scale).applyQuaternion(turn).setY((src.p[R.id[s + 'Foot']].y - R.floor) * R.scale + ANKLE);
  return out;
}
const newOut = () => ({ q: Object.fromEntries(NAMES.map(n => [n, new THREE.Quaternion()])), hips: new THREE.Vector3(), ankleL: new THREE.Vector3(), ankleR: new THREE.Vector3() });

/* ---------- a stride ---------- */

const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];
// When each foot is planted: runs of frames where the ankle is low and barely moving over the ground. Returns their mid times (frames).
function plants(pos, floor, dt, speed) {
  const out = [], still = 0.3 + speed * 0.35;
  let from = -1;
  for (let f = 1; f < pos.length - 1; f++) {
    const v = Math.hypot(pos[f + 1].x - pos[f - 1].x, pos[f + 1].z - pos[f - 1].z) / (2 * dt), down = pos[f].y - floor < 0.17 && v < still;
    if (down && from < 0) from = f;
    if (!down && from >= 0) { if (f - from > 0.035 / dt) out.push({ mid: (from + f - 1) / 2, from, to: f - 1 }); from = -1; }
  }
  return out;
}

function stride(name, bvh, want, flip = false) {
  const R = rig(bvh), src = newPose(bvh), all = [];
  for (let f = 0; f < bvh.frames; f++) { pose(bvh, f, src); all.push({ hip: src.p[R.id.Hips].clone(), l: src.p[R.id.LeftFoot].clone(), r: src.p[R.id.RightFoot].clone() }); }
  R.floor = median(all.flatMap(a => [a.l.y, a.r.y]).sort((x, y) => x - y).slice(0, all.length >> 1));     // ankle height with the foot down (capture units)
  const m = a => a.clone().multiplyScalar(R.scale), floor = R.floor * R.scale;
  const path = all.map(a => m(a.hip)), total = path[path.length - 1].clone().sub(path[0]), speed = Math.hypot(total.x, total.z) / ((bvh.frames - 1) * bvh.dt);
  let pr = plants(all.map(a => m(a.r)), floor, bvh.dt, speed), pl = plants(all.map(a => m(a.l)), floor, bvh.dt, speed);
  if (flip) [pr, pl] = [pl, pr];
  // the steadiest two successive strides: right plant to right plant to right plant, a left plant inside each
  // (a short capture may only hold one: then that one, eased shut at its end)
  const dist = (t0, t1) => path[Math.round(t1)].distanceTo(path[Math.round(t0)]) / ((t1 - t0) * bvh.dt);
  let best = null;
  for (let k = 0; k + 1 < pr.length; k++) {
    const a = pr[k].mid, b = pr[k + 1].mid, c = pr[k + 2]?.mid, la = pl.find(p => p.mid > a && p.mid < b), lb = c && pl.find(p => p.mid > b && p.mid < c);
    if (!la) continue;
    const va = dist(a, b), vb = lb ? dist(b, c) : va;
    const score = (lb ? Math.abs(va - vb) / (va + vb) + Math.abs((b - a) - (c - b)) / (c - a) : 1) - (want ? -Math.abs((va + vb) / 2 - want) : 0);
    if (!best || score < best.score) best = { score, a, b, c: lb ? c : null, la: la.mid, lb: lb?.mid, v: (va + vb) / 2, duty: (pr[k + 1].to - pr[k + 1].from) / (b - a) };
  }
  if (!best && !flip) return stride(name, bvh, want, true);      // no stride between two right plants: take one between two left plants and start it half way round
  if (!best) throw new Error(`${name}: no clean stride (right plants ${pr.length}, left ${pl.length})`);
  const { a, b } = best, c = best.c ?? b, go = path[Math.round(c)].clone().sub(path[Math.round(a)]), yaw = Math.atan2(go.x, go.z);
  // phase → frame within a stride [t0, t1] whose left plant is at tl: the left plant lands on half way
  const frameAt = (ph, t0, tl, t1) => (ph < 0.5 ? t0 + (tl - t0) * ph * 2 : tl + (t1 - tl) * (ph - 0.5) * 2);
  const A = newOut(), B = newOut(), E = newOut(), s0 = newPose(bvh), s1 = newPose(bvh), o0 = newOut(), o1 = newOut();
  const hipAt = t => { const f = Math.floor(t); return all[f].hip.clone().lerp(all[Math.min(bvh.frames - 1, f + 1)].hip, t - f); };
  const at = (t, out, t0, t1) => {    // the retargeted pose at a fractional frame, kept on the spot: his steady travel over the stride is taken out, his sway is kept
    const f = Math.floor(t), k = t - f, org = hipAt(t0).lerp(hipAt(t1), (t - t0) / (t1 - t0)).setY(0);
    retarget(bvh, R, pose(bvh, f, s0), yaw, org, o0); retarget(bvh, R, pose(bvh, Math.min(bvh.frames - 1, f + 1), s1), yaw, org, o1);
    for (const n of NAMES) out.q[n].copy(o0.q[n]).slerp(o1.q[n], k);
    out.hips.copy(o0.hips).lerp(o1.hips, k); out.ankleL.copy(o0.ankleL).lerp(o1.ankleL, k); out.ankleR.copy(o0.ankleR).lerp(o1.ankleR, k);
    return out;
  };
  const q = [], h = [];
  let lo = 9, hi = 0;
  if (!best.c) at(b - 1e-6, E, a, b);                     // one stride only: where it ends, to ease the end onto the start
  const first = newOut(); at(a, first, a, b);
  for (let i = 0; i < N; i++) {
    const ph = flip ? (i / N + 0.5) % 1 : i / N;
    at(frameAt(ph, a, best.la, b), A, a, b);
    if (best.c) {
      // the second stride fades into the first: the loop closes on the very same pose
      at(frameAt(ph, b, best.lb, c), B, b, c);
      for (const n of NAMES) B.q[n].slerp(A.q[n], ph);
      B.hips.lerp(A.hips, ph);
    } else {
      const w = Math.max(0, (ph - 0.6) / 0.4) ** 2;
      for (const n of NAMES) B.q[n].copy(A.q[n]).multiply(tmpQ.copy(E.q[n]).invert().multiply(first.q[n]).slerp(IDENT, 1 - w).clone());
      B.hips.copy(A.hips).add(first.hips.clone().sub(E.hips).multiplyScalar(w));
    }
    for (const n of NAMES) { const r = B.q[n]; q.push(r.x, r.y, r.z, r.w); }
    h.push(B.hips.x, B.hips.y, B.hips.z);
    lo = Math.min(lo, B.hips.y); hi = Math.max(hi, B.hips.y);
  }
  const period = (c - a) / (best.c ? 2 : 1) * bvh.dt;
  if (REPORT) console.log(`${name.padEnd(8)} ${best.v.toFixed(2)} m/s  stride ${period.toFixed(3)} s (${(best.v * period).toFixed(2)} m)  planted ${(best.duty * 100).toFixed(0)}%  ${best.c ? 'two strides' : 'ONE stride'}  hips ${lo.toFixed(3)}..${hi.toFixed(3)}  scale ${R.scale.toFixed(4)}  plants R${pr.length} L${pl.length}`);
  return { kind: 'stride', speed: +best.v.toFixed(3), period: +period.toFixed(4), n: N, q, h };
}

/* ---------- a loop: a stretch of someone standing ---------- */

const HZ = 12;
function loop(name, bvh, { from, to }) {
  const R = rig(bvh), src = newPose(bvh), f0 = Math.round(from / bvh.dt), f1 = Math.min(bvh.frames - 1, Math.round(to / bvh.dt)), feet = [], org = new THREE.Vector3(), fwd = new THREE.Vector3();
  for (let f = f0; f <= f1; f++) { pose(bvh, f, src); feet.push(src.p[R.id.LeftFoot].y, src.p[R.id.RightFoot].y); org.add(src.p[R.id.Hips]); fwd.add(new THREE.Vector3(0, 0, 1).applyQuaternion(src.q[R.id.Hips])); }
  R.floor = median(feet); org.multiplyScalar(1 / (f1 - f0 + 1)).setY(0);
  const yaw = Math.atan2(fwd.x, fwd.z), n = Math.round((f1 - f0) * bvh.dt * HZ), A = newOut(), first = newOut(), last = newOut(), q = [], h = [];
  retarget(bvh, R, pose(bvh, f0, src), yaw, org, first); retarget(bvh, R, pose(bvh, f1, src), yaw, org, last);
  for (let i = 0; i < n; i++) {
    const ph = i / n, w = Math.max(0, (ph - 0.75) / 0.25), e = w * w * (3 - 2 * w);       // the last quarter eases onto the first pose
    retarget(bvh, R, pose(bvh, Math.round(f0 + (f1 - f0) * ph), src), yaw, org, A);
    for (const nm of NAMES) { const r = A.q[nm].multiply(tmpQ.copy(last.q[nm]).invert().multiply(first.q[nm]).slerp(IDENT, 1 - e).clone()); q.push(r.x, r.y, r.z, r.w); }
    A.hips.add(first.hips.clone().sub(last.hips).multiplyScalar(e)); h.push(A.hips.x, A.hips.y, A.hips.z);
  }
  if (REPORT) console.log(`${name.padEnd(8)} loop ${((f1 - f0) * bvh.dt).toFixed(1)} s, ${n} poses, hips ${Math.min(...h.filter((_, i) => i % 3 === 1)).toFixed(3)}..${Math.max(...h.filter((_, i) => i % 3 === 1)).toFixed(3)}`);
  return { kind: 'loop', speed: 0, period: +((f1 - f0) * bvh.dt).toFixed(3), n, q, h };
}

/* ---------- write ---------- */

const clips = {};
for (const [name, [file, kind, opt]] of Object.entries(CLIPS)) {
  // (subjects 141 and 143 were captured at 60 Hz though their files say 120: checked against gravity in their runs' flight)
  const bvh = parseBVH(await readFile(`${dir}/${file}.bvh`, 'utf8'), /^14[13]_/.test(file) ? 60 : 0);
  try { clips[name] = kind === 'loop' ? loop(name, bvh, opt) : stride(name, bvh, opt?.want); } catch (e) { console.log(String(e.message)); }
}
const r = v => +v.toFixed(4);
const body = Object.entries(clips).map(([name, c]) => `  ${name}: { kind: '${c.kind}', speed: ${c.speed}, period: ${c.period}, n: ${c.n},\n    q: [${c.q.map(r).join(',')}],\n    h: [${c.h.map(r).join(',')}] },`).join('\n');
await mkdir(fileURLToPath(new URL('../game/assets/anim/', import.meta.url)), { recursive: true });
await writeFile(OUT, `// Motion-capture clips for the players, baked by tools/build-anim.mjs. Do not edit by hand.\n// The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding\n// from NSF EIA-0196217.\n// q: one quaternion (x, y, z, w) per bone per sample, bones in BONES order; h: the hips' place per sample (m).\nexport const BONES = ${JSON.stringify(NAMES)};\nexport const CLIPS = {\n${body}\n};\n`);
console.log(`wrote ${Object.keys(clips).length} clips, ${(body.length / 1024).toFixed(0)} KB`);
