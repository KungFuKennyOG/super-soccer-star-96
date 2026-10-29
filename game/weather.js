// Rain and snow: a box of streaks or flakes that follows your head, wrapped so they stay put in the
// world as you move. One draw call each, animated in the vertex shader. The pitch, fog and light
// changes are stadium.setWeather (game/stadium.js); the ball's roll is rules/weather.js.
import * as THREE from 'three';
import { ps1 } from './ps1.js';

const KINDS = {
  // count, box size (m), fall (m/s), sway (m), streak width / length (m), color, opacity
  rain: { n: 2600, box: [24, 14, 24], fall: 11, sway: 0, w: 0.008, h: 0.32, color: '#b4c2dc', opacity: 0.45 },
  snow: { n: 1500, box: [22, 12, 22], fall: 1.1, sway: 0.45, w: 0.035, h: 0.035, color: '#ffffff', opacity: 0.9 },
};

function particles(k) {
  const pos = new Float32Array(k.n * 18), seed = new Float32Array(k.n * 18);
  const quad = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < k.n; i++) {
    const s = [Math.random(), Math.random(), Math.random()];
    quad.forEach(([x, y], j) => {
      const o = (i * 6 + j) * 3;
      pos[o] = x * k.w; pos[o + 1] = y * k.h; pos[o + 2] = 0;
      seed.set(s, o);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  const uniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...k.box) }, uFall: { value: k.fall }, uSway: { value: k.sway } };
  const m = ps1({ color: k.color, lit: false, transparent: true, opacity: k.opacity, depthWrite: false, fog: false });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    base(sh);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute vec3 aSeed;\nuniform float uTime, uFall, uSway;\nuniform vec3 uCenter, uBox;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec3 p = aSeed * uBox;
      p.y -= uTime * uFall * (0.85 + 0.3 * aSeed.x);
      p.x += sin(uTime * 0.8 + aSeed.z * 40.0) * uSway;
      p.z += cos(uTime * 0.6 + aSeed.x * 40.0) * uSway;
      vec3 rel = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
      if (length(rel.xz) < 1.6) rel.y -= 200.0;              // none right in your face: they'd be huge bars
      // streaks hang straight down in the world and face you side-on
      vec4 mvPosition = viewMatrix * vec4(uCenter + rel + vec3(0.0, transformed.y, 0.0), 1.0);
      mvPosition.x += transformed.x;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'ps1weather';
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5;
  return { mesh, uniforms };
}

export function createWeather(scene) {
  const fx = { rain: particles(KINDS.rain), snow: particles(KINDS.snow) };
  for (const f of Object.values(fx)) scene.add(f.mesh);
  let kind = 'clear';
  return {
    get kind() { return kind; },
    set(k) { kind = k; for (const [n, f] of Object.entries(fx)) f.mesh.visible = n === k; },
    // center: your head in world space
    update(t, center) {
      const f = fx[kind];
      if (!f) return;
      f.uniforms.uTime.value = t;
      f.uniforms.uCenter.value.copy(center);
    },
  };
}
