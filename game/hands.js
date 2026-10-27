// Your hands in the headset: chunky low-poly hands on the controller grips, open by default and
// a fist while you squeeze the grip. Skin tone matches your legs; a sweatband in your team colors.
// buildHand() is also used to show hands on the trophy in the browser.
import * as THREE from 'three';
import { ps1 } from './ps1.js';
import { SKINS } from './tex.js';

// One vertex-colored geometry from boxes: [size [x,y,z], position [x,y,z], rotation [x,y,z], color]
function boxes(parts) {
  const pos = [], nor = [], col = [], m = new THREE.Matrix4(), nm = new THREE.Matrix3(), c = new THREE.Color(), v = new THREE.Vector3();
  for (const [size, at, rot, color] of parts) {
    const g = new THREE.BoxGeometry(...size).toNonIndexed();
    m.compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));
    nm.getNormalMatrix(m); c.set(color);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      const k = 0.82 + 0.18 * (0.5 + 0.5 * v.y);
      col.push(c.r * k, c.g * k, c.b * k);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

// A right hand in grip space: fingers point along -Z, the palm faces -X (toward the other hand),
// the thumb is on top. The left hand is the same mirrored. pose: 'open' | 'fist'.
function handGeometry(pose, skin, band, bandTrim) {
  const sk = new THREE.Color(skin), dark = '#' + sk.clone().multiplyScalar(0.85).getHexString(), s = skin;
  const parts = [
    [[0.028, 0.085, 0.09], [0.004, 0, 0.015], [0, 0, 0], s],                // palm
    [[0.05, 0.06, 0.1], [0.004, -0.004, 0.12], [0, 0, 0], s],                // wrist and forearm
    [[0.056, 0.066, 0.035], [0.004, -0.004, 0.085], [0, 0, 0], band],        // sweatband
    [[0.057, 0.067, 0.006], [0.004, -0.004, 0.07], [0, 0, 0], bandTrim],
  ];
  const ys = [0.031, 0.011, -0.009, -0.029], lens = [0.075, 0.082, 0.077, 0.062];
  ys.forEach((y, i) => {
    if (pose === 'open') parts.push([[0.022, 0.018, lens[i]], [0.002, y, -0.03 - lens[i] / 2], [0, 0, 0], s]);
    else {
      parts.push([[0.024, 0.019, 0.032], [-0.002, y, -0.044], [0, 0, 0], s]);        // first knuckle, forward
      parts.push([[0.034, 0.018, 0.022], [-0.026, y, -0.052], [0, 0, 0], dark]);      // curled into the palm
    }
  });
  // thumb: along the top, angled forward; tucked over the fingers in a fist
  if (pose === 'open') parts.push([[0.02, 0.02, 0.06], [-0.012, 0.05, -0.02], [0.5, 0.35, 0], s]);
  else parts.push([[0.02, 0.02, 0.05], [-0.024, 0.036, -0.03], [0.2, 0.9, 0], s]);
  return boxes(parts);
}

const cache = new Map();
export function buildHand(side, pose, kit, skin = SKINS[1]) {
  const key = `${side}${pose}${kit.sleeve || kit.shirt}${kit.trim}${skin}`;
  if (!cache.has(key)) cache.set(key, handGeometry(pose, skin, kit.sleeve || kit.shirt, kit.trim));
  const mesh = new THREE.Mesh(cache.get(key), ps1({ vertexColors: true }));
  if (side === 'left') mesh.scale.x = -1;
  return mesh;
}

// Hands that follow the controllers. Call setKit when your team changes, update every frame.
export function createHands(renderer, rig) {
  const slots = [0, 1].map(i => {
    const grip = renderer.xr.getControllerGrip(i);
    const slot = { grip, side: null, gamepad: null, open: null, fist: null };
    grip.addEventListener('connected', e => { slot.side = e.data.handedness === 'left' ? 'left' : 'right'; slot.gamepad = e.data.gamepad; build(slot); });
    grip.addEventListener('disconnected', () => { slot.gamepad = null; if (slot.open) slot.open.visible = slot.fist.visible = false; });
    rig.add(grip);
    return slot;
  });
  let kit = { shirt: '#f2f1ea', trim: '#2b2f6b' };
  function build(slot) {
    if (!slot.side) return;
    if (slot.open) slot.grip.remove(slot.open, slot.fist);
    slot.open = buildHand(slot.side, 'open', kit); slot.fist = buildHand(slot.side, 'fist', kit);
    slot.grip.add(slot.open, slot.fist);
  }
  return {
    setKit(k) { kit = k; slots.forEach(build); },
    // squeeze: force a fist on both hands (e.g. while holding the trophy)
    update(squeeze = false) {
      for (const s of slots) {
        if (!s.open || !s.gamepad) continue;
        const g = s.gamepad.buttons[1], fist = squeeze || (g && g.value > 0.45);
        s.open.visible = !fist; s.fist.visible = !!fist;
      }
    },
  };
}
