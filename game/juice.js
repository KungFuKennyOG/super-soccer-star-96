// Contact juice (setting HIT EFFECTS OFF/ON): what makes a strike feel like a strike.
//   hit-stop      the match freezes for a few hundredths of a second when you hit the ball, longer the harder
//   haptics       buzz scaled by power in the hand that did it (both for a header), a heartbeat on a goal
//   ball pop      the ball swells for an instant on contact
//   grass puff    bits of turf kick up off the ball on a strike
//   streak        a short trail behind hard shots while they fly
//   crowd rise    the crowd draws breath as a shot flies on target
// Everything here is cosmetic: the only thing it changes in the match is the hit-stop pause.
import * as THREE from 'three';
import { ps1 } from './ps1.js';
import { buzz } from '../engine/input.js';
import { sfx } from './audio.js';

const TRAIL = 9, PUFFS = 14;

export function createJuice(scene) {
  let on = true, stopT = 0, popT = 9, trailT = 0;

  // the streak: one instanced mesh of small diamonds, newest biggest
  const trail = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1, 0), ps1({ color: '#fff3b0', lit: false, transparent: true, opacity: 0.55, depthWrite: false }), TRAIL);
  trail.frustumCulled = false; trail.visible = false; scene.add(trail);
  const hist = Array.from({ length: TRAIL }, () => new THREE.Vector3());
  let histN = 0;

  // turf bits: one instanced mesh of tiny cubes, green and brown
  const puff = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), ps1({ color: '#ffffff' }), PUFFS);
  puff.frustumCulled = false; puff.visible = false; scene.add(puff);
  const bits = Array.from({ length: PUFFS }, (_, i) => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
  const green = new THREE.Color('#3f8f2a'), brown = new THREE.Color('#6b4a22');
  for (let i = 0; i < PUFFS; i++) puff.setColorAt(i, i % 3 ? green : brown);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3();

  function kickPuff(b, power) {
    for (const k of bits) {
      k.p.set(b.x, Math.max(0.05, b.y - 0.08), b.z);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5 * (0.4 + power);
      k.v.set(Math.cos(a) * sp, 1.5 + Math.random() * 3 * (0.4 + power), Math.sin(a) * sp);
      k.life = 0.35 + Math.random() * 0.3;
    }
    puff.visible = true;
  }

  return {
    get on() { return on; },
    set(v) { on = !!v; if (!on) { trail.visible = puff.visible = false; stopT = 0; } },
    // the sim's time step this frame: zero during a hit-stop
    simScale(dt) { if (stopT > 0) { stopT -= dt; return 0; } return 1; },
    // world: the sim world after the step (for the ball and the shot's fate)
    event(e, world) {
      if (!on) return;
      const b = world.ball;
      if (e.type === 'kick' && e.by === 'you') {
        const p = Math.max(0.2, Math.min(1, e.power || 0.6));
        if (e.kind !== 'bicycle') stopT = 0.035 + 0.055 * p;       // the overhead kick has its slow motion instead
        popT = 0;
        if (e.kind !== 'header') kickPuff(b, p);
        buzz(e.kind === 'header' ? 'both' : 'right', 0.5 + 0.5 * p, 40 + 90 * p);
        if (p > 0.55 || e.kind) { trailT = 3; histN = 0; }
        const s = world.shot;
        if (s && s.decision && s.decision !== 'wide') setTimeout(() => sfx('rise'), 120);   // they've seen it's on target
      } else if (e.type === 'kick') { popT = 0; kickPuff(b, 0.5); }
      if (e.type === 'pass' && e.by === 'you') { popT = 0.06; buzz('left', e.grade === 'perfect' ? 0.9 : 0.5, e.grade === 'perfect' ? 70 : 40); }
      if (e.type === 'post') { buzz('both', 1, 140); popT = 0; }
      if (e.type === 'saved' || e.type === 'parried' || e.type === 'blocked') { buzz('both', 0.35, 60); trailT = 0; }
      if (e.type === 'goal') {
        trailT = 0;
        if (e.by === 'you') [0, 160, 320].forEach((t, i) => setTimeout(() => buzz('both', 1 - i * 0.25, 90), t));   // heartbeat
      }
      if (e.type === 'out' || e.type === 'tackled' || e.type === 'intercepted') trailT = 0;
    },
    // ballMesh: the drawn ball; b: the sim ball
    update(dt, ballMesh, b) {
      // pop: a quick swell then back
      popT += dt;
      ballMesh.scale.setScalar(on && popT < 0.12 ? 1 + 0.45 * (1 - popT / 0.12) : 1);
      // streak
      trailT = Math.max(0, trailT - dt);
      trail.visible = on && trailT > 0 && Math.hypot(b.vx, b.vy, b.vz) > 9;
      if (trail.visible) {
        for (let i = TRAIL - 1; i > 0; i--) hist[i].copy(hist[i - 1]);
        hist[0].set(b.x, b.y, b.z); histN = Math.min(TRAIL, histN + 1);
        for (let i = 0; i < TRAIL; i++) {
          const k = i < histN ? 1 - i / TRAIL : 0;
          m4.compose(hist[Math.min(i, histN - 1)], q, s3.setScalar(k * 1.1));
          trail.setMatrixAt(i, m4);
        }
        trail.instanceMatrix.needsUpdate = true;
      }
      // turf
      if (puff.visible) {
        let alive = 0;
        for (let i = 0; i < PUFFS; i++) {
          const k = bits[i];
          k.life -= dt;
          if (k.life > 0) { alive++; k.v.y -= 14 * dt; k.p.addScaledVector(k.v, dt); if (k.p.y < 0.03) { k.p.y = 0.03; k.v.set(0, 0, 0); } }
          m4.compose(k.p, q, s3.setScalar(k.life > 0 ? Math.min(1, k.life * 4) : 0));
          puff.setMatrixAt(i, m4);
        }
        puff.instanceMatrix.needsUpdate = true;
        if (!alive) puff.visible = false;
      }
    },
  };
}
