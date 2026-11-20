// A PS2-look player: the figure (figure.js) wearing its painted sheet (kit.js, face.js), a soft
// specular sheen, and two cheap shadows: a soft patch at the feet and the body's own shape projected
// flat onto the grass. Returns the same thing game/actors.js's buildPlayer does, so animate() and
// placeModel() pose it as they pose the PS1 players.
import * as THREE from 'three';
import { buildSkeleton } from '../body.js';
import { SKINS, HAIRS } from '../tex.js';
import { ATLAS, HEAD_SHEET, paintKit } from './kit.js';
import { paintHead } from './face.js';
import { HAIR2 } from './headgeo.js';
import { figureGeometry } from './figure.js';
import { canvas, hex, smoothTex } from './paint.js';

export const LIGHT_DIR = new THREE.Vector3(-0.45, 1, 0.35).normalize();   // toward the sun
const sheets = new Map();
// the game's skin tones, a little deeper and warmer for this look
const skinOf = i => hex(SKINS[i % SKINS.length]).map((v, k) => v * [0.95, 0.9, 0.87][k]);

// The kit sheet: one per kit, number, skin tone and boots.
export function kitSheet({ kit, num, skinI = 0, boots = 0 }) {
  const key = 'k' + JSON.stringify([kit, num, skinI, boots]);
  if (sheets.has(key)) return sheets.get(key);
  const c = canvas(ATLAS.w, ATLAS.h), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ATLAS.w, ATLAS.h);
  paintKit(ctx, { kit, num, skin: skinOf(skinI), boots });
  const m = new THREE.MeshPhongMaterial({ map: smoothTex(c), vertexColors: true, specular: 0x2b2a27, shininess: 10 });   // a low, broad highlight: the soft sheen
  sheets.set(key, m);
  return m;
}
// The head sheet: one per look (skin, hair color, hairstyle, face), shared by every player who has it.
export function headSheet({ look = 0, style = 0, skinI = look, hairI = look * 3 + 1 }) {
  const key = 'h' + JSON.stringify([look, style, skinI, hairI]);
  if (sheets.has(key)) return sheets.get(key);
  const c = canvas(HEAD_SHEET.w, HEAD_SHEET.h), ctx = c.getContext('2d', { willReadFrequently: true });
  paintHead(ctx, { skin: skinOf(skinI), hair: hex(HAIRS[hairI % HAIRS.length]), st: HAIR2[style % HAIR2.length], stubble: look % 3 !== 0, look });
  const m = new THREE.MeshPhongMaterial({ map: smoothTex(c), vertexColors: true, specular: 0x24221e, shininess: 16, alphaTest: 0.5 });   // alpha test: the hair's ragged tips
  sheets.set(key, m);
  return m;
}

// The body's shape thrown flat on the grass along the sun: one extra draw of the same skinned mesh,
// no shadow map. The stencil keeps overlapping limbs from darkening twice.
let shadowMat;
function flatShadow() {
  if (shadowMat) return shadowMat;
  shadowMat = new THREE.MeshBasicMaterial({ color: 0x06140a, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  shadowMat.onBeforeCompile = sh => {
    sh.uniforms.uSun = { value: LIGHT_DIR };
    sh.vertexShader = 'uniform vec3 uSun;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 wp = modelMatrix * vec4( transformed, 1.0 );
      wp.xz -= uSun.xz * ( max( wp.y, 0.0 ) / uSun.y );
      wp.y = 0.012;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return shadowMat;
}
let blobMat;
function blob() {
  if (!blobMat) {
    const c = canvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(4,16,8,0.55)'); gr.addColorStop(0.6, 'rgba(4,16,8,0.22)'); gr.addColorStop(1, 'rgba(4,16,8,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    blobMat = new THREE.MeshBasicMaterial({ map: smoothTex(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.75), blobMat);
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1;
  return m;
}

// kit: a kit spec from rules/teams.js. look picks skin, hair color and (unless given) the hairstyle.
export function buildPlayer2(kit, num, look = 0, { style = [0, 2, 1, 0, 4, 0, 3, 2][look % 8], boots = 0, skinI = look, hairI = look * 3 + 1 } = {}) {
  const mats = [kitSheet({ kit, num, skinI, boots }), headSheet({ look, style, skinI, hairI })];
  const { bones, by } = buildSkeleton(), geo = figureGeometry(style);
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.add(bones[0]); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones)); mesh.frustumCulled = false;
  const cast = new THREE.SkinnedMesh(geo, flatShadow());
  cast.bind(mesh.skeleton, mesh.bindMatrix); cast.frustumCulled = false; cast.renderOrder = 2;
  const root = new THREE.Group();
  root.add(mesh, cast);
  return { root, mesh, bone: by, shadow: blob(), phase: Math.random() * 6, strike: null };
}
