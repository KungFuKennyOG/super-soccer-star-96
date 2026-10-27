// The PS1 look on a modern renderer, dialled down from the real thing: vertices snap to a screen
// grid (a light wobble), textures warp a little across big polygons (affine mapping), and colors are
// cut to 18-bit with a soft 4x4 ordered dither. Use ps1() instead of new MeshLambertMaterial / MeshBasicMaterial.
import * as THREE from 'three';

// In the headset the wobble and texture warp swim as your head moves, so main.js turns both off
// there (snap grid out of reach, affine 0) and keeps only the color depth and dither.
// Shared by every PS1 material. snap = the virtual screen the vertices snap to (PS1 was 320x240).
// levels: color steps per channel (PS1 had 32; 64 is gentler). dither: how strong the pattern is (0..1).
export const PS1 = {
  snap: { value: new THREE.Vector2(640, 480) },
  levels: { value: 63 },
  affine: { value: 1 },     // 1 = PS1 texture warp, 0 = perspective-correct (used in the headset)
  dither: { value: 0.6 },
};

const VERT_PARS = 'varying float vAffW;\nuniform vec2 uSnap;\nuniform float uAffine;\n';
const VERT_SNAP = `
  {
    vec4 p = gl_Position;
    p.xy = floor(p.xy / p.w * uSnap * 0.5 + 0.5) / (uSnap * 0.5) * p.w;
    gl_Position = p;
  }
  vAffW = mix(1.0, gl_Position.w, uAffine);
  #ifdef USE_UV
    vUv *= vAffW;
  #endif
`;
const FRAG_PARS = `varying float vAffW;
uniform float uLevels;
uniform float uDither;
float bayer4(vec2 f) {
  int x = int(mod(f.x, 4.0)), y = int(mod(f.y, 4.0));
  int i = x + y * 4;
  ${'const float B[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);'}
  return B[i] / 16.0;
}
`;
const FRAG_MAP = `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vUv / vAffW );
  diffuseColor *= sampledDiffuseColor;
#endif`;
const FRAG_DITHER = `
  #ifdef PS1_POP
  {
    // the punchy lit-side / shadow-side look of the FIFA 98 and Virtua Striker players
    vec3 c = gl_FragColor.rgb;
    float l = dot(c, vec3(0.3, 0.59, 0.11));
    c = mix(vec3(l), c, 1.18) * mix(0.8, 1.22, smoothstep(0.08, 0.75, l));
    gl_FragColor.rgb = c;
  }
  #endif
  gl_FragColor.rgb = floor(clamp(gl_FragColor.rgb, 0.0, 1.0) * uLevels + 0.5 + (bayer4(gl_FragCoord.xy) - 0.5) * uDither) / uLevels;
`;

function patch(mat, pop = false) {
  if (pop) mat.defines = { ...(mat.defines || {}), PS1_POP: '' };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uSnap = PS1.snap; sh.uniforms.uLevels = PS1.levels; sh.uniforms.uDither = PS1.dither; sh.uniforms.uAffine = PS1.affine;
    sh.vertexShader = VERT_PARS + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_SNAP);
    sh.fragmentShader = FRAG_PARS + sh.fragmentShader
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + FRAG_DITHER);
  };
  mat.customProgramCacheKey = () => (pop ? 'ps1pop' : 'ps1');
  return mat;
}

// opts: { color, map, lit (default true), pop (extra contrast, for players), vertexColors, transparent, opacity, alphaTest, side, emissive, fog }
export function ps1(opts = {}) {
  const { lit = true, pop = false, ...o } = opts;
  if (o.map) o.map = pixelTex(o.map);
  const mat = lit ? new THREE.MeshLambertMaterial(o) : new THREE.MeshBasicMaterial(o);
  return patch(mat, pop);
}

// Hard pixels: no filtering, no mipmaps. Accepts a canvas or a texture.
export function pixelTex(src, repeat) {
  const t = src.isTexture ? src : new THREE.CanvasTexture(src);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true;
  return t;
}

// A small canvas to paint a texture on. draw(ctx, w, h).
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  return c;
}
