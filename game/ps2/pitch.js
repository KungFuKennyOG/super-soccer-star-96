// The PS2-look pitch and ball. The pitch is one quad: a fine grass texture up close, wide mown
// stripes worked out from where the pixel is on the pitch, and a sheen that lightens the grass
// toward the horizon. Lines are thin quads just above it.
import * as THREE from 'three';
import { BALL } from '../../rules/tuning.js';
import { canvas, hash, vnoise, eachPixel, smoothTex, gauss } from './paint.js';

function grassTex() {
  const c = canvas(256, 256), ctx = c.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 256, 256);
  eachPixel(ctx, { x: 0, y: 0, w: 256, h: 256 }, (u, v, col, px, py) => {
    // blades: short streaks, stretched up the texture; kept near mid grey (the shader multiplies it in)
    const blade = vnoise(px * 0.8, py * 0.3, 1, 0) * 0.6 + vnoise(px * 0.4 + 40, py * 0.16, 2, 0) * 0.4;
    const clump = (vnoise(px / 32 * 4, py / 32 * 4, 3, 32) + vnoise(px / 64 * 4, py / 64 * 4, 4, 16)) * 0.5;
    const g = 128 + 104 * (blade - 0.5) + 44 * (clump - 0.5) + 22 * (hash(px, py, 5) - 0.5);
    col[0] = col[1] = col[2] = g;
  });
  return smoothTex(c, { repeat: [1, 1], aniso: 8 });
}

// size: [length along x, width along z]. stripe: width of one mown band (m).
export function buildPitch({ size = [140, 100], stripe = 5.5 } = {}) {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uGrass: { value: null }, uStripe: { value: stripe }, uLight: { value: new THREE.Color('#486b2a') }, uDark: { value: new THREE.Color('#3d5d26') }, uWet: { value: 0 } }]),
    vertexShader: `varying vec3 vW; varying vec3 vV;
${THREE.ShaderChunk.fog_pars_vertex}
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vV = cameraPosition - w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
${THREE.ShaderChunk.fog_vertex}
}`,
    fragmentShader: `uniform sampler2D uGrass; uniform float uStripe; uniform vec3 uLight; uniform vec3 uDark; uniform float uWet; varying vec3 vW; varying vec3 vV;
${THREE.ShaderChunk.fog_pars_fragment}
      void main() {
        float band = vW.x / uStripe, edge = fwidth(band) * 1.5 + 0.02;
        float s = abs(fract(band * 0.5) - 0.5) * 2.0;                       // a triangle wave: 0..1..0 every two bands
        float k = smoothstep(0.5 - edge, 0.5 + edge, s);
        vec3 col = mix(uDark, uLight, k);
        float d = length(vV), near = 0.5 * (texture2D(uGrass, vW.xz * 0.45).r + texture2D(uGrass, vW.zx * 0.39 + 0.3).r), far = texture2D(uGrass, vW.zx * 0.06).r;
        col *= 0.36 + 0.9 * mix(near, 0.5, smoothstep(5.0, 28.0, d)) + 0.36 * far;
        float graze = 1.0 - abs(normalize(vV).y);
        col = mix(col, vec3(0.5, 0.63, 0.4), (0.34 + 0.25 * uWet) * pow(graze, 5.0));   // the sheen toward the horizon
        gl_FragColor = vec4(col, 1.0);
        ${THREE.ShaderChunk.fog_fragment}
      }`,
  });
  mat.extensions = { derivatives: true };
  mat.uniforms.uGrass.value = grassTex();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// White lines: [[x1, z1, x2, z2]], each 12 cm wide. One draw call.
export function buildLines(segs, w = 0.12) {
  const pos = [], idx = [];
  for (const [x1, z1, x2, z2] of segs) {
    const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2, ex = dx / l * w / 2, ez = dz / l * w / 2, b = pos.length / 3;
    pos.push(x1 - ex + nx, 0.006, z1 - ez + nz, x1 - ex - nx, 0.006, z1 - ez - nz, x2 + ex + nx, 0.006, z2 + ez + nz, x2 + ex - nx, 0.006, z2 + ez - nz);
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe9efe2, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide }));
}

// The ball: white with dark star-shaped panels (an invented design), a little gloss.
export function buildBall2() {
  const ico = new THREE.IcosahedronGeometry(1, 0), corners = [], ip = ico.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < ip.count; i++) { v.fromBufferAttribute(ip, i).normalize(); if (!corners.some(c => c.distanceTo(v) < 1e-3)) corners.push(v.clone()); }
  const c = canvas(512, 256), ctx = c.getContext('2d'), up = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  eachPixel(ctx, { x: 0, y: 0, w: 512, h: 256 }, (u, t, col) => {
    const th = t * Math.PI, ph = u * Math.PI * 2;
    v.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
    let best = corners[0], d = -1;
    for (const k of corners) { const q = k.dot(v); if (q > d) { d = q; best = k; } }
    // a five-pointed star round each of the ball's twelve corners
    up.set(0.3, 1, 0.2).cross(best).normalize(); a.copy(best).cross(up); b.copy(v).sub(best);
    const ang = Math.atan2(b.dot(a), b.dot(up)), r = Math.acos(Math.min(1, d)), star = 0.17 + 0.3 * Math.max(0, Math.cos(ang * 5)) ** 1.5 * (1 - 0);
    const k = 1 - Math.min(1, Math.max(0, (r - star) / 0.012 + 0.5)), rim = gauss(r, star + 0.035, 0.012) * 0.5;
    const seam = 1 - 0.18 * gauss(r, 0.56, 0.01);
    col[0] = (236 * (1 - k) + 26 * k) * seam * (1 - rim * 0.5); col[1] = (236 * (1 - k) + 34 * k) * seam * (1 - rim * 0.45); col[2] = (232 * (1 - k) + 74 * k) * seam * (1 - rim * 0.2);
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.r, 20, 14), new THREE.MeshPhongMaterial({ map: smoothTex(c), specular: 0x555555, shininess: 40 }));
  return mesh;
}
