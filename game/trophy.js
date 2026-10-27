// The trophy lift. The cup sits on a plinth in front of you with your squad around you. In the
// headset, grab it with your grips (one hand or both) and raise it above your head. In the browser,
// press E to pick it up and hold Up to raise it. Lifting it sets off confetti, fireworks and the crowd.
import * as THREE from 'three';
import { controllers, BTN } from '../engine/input.js';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText, textWidth } from './tex.js';
import { buildPlayer, animate } from './actors.js';
import { sfx } from './audio.js';
import { playMusic } from './music.js';

const GOLD = () => ps1({ color: '#e8b830', emissive: '#3a2600', flatShading: true });
const SILVER = () => ps1({ color: '#d8dce8', emissive: '#22242c', flatShading: true });

// Generic trophies, not real ones: a golden globe on a column, and a big-handled silver cup.
function buildTrophy(kind) {
  const g = new THREE.Group();
  const lathe = (pts, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14), mat);
  if (kind === 'world') {
    const gold = GOLD();
    g.add(lathe([[0.001, 0], [0.09, 0], [0.09, 0.03], [0.08, 0.035]], gold));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.081, 0.081, 0.03, 14), ps1({ color: '#1b7a3a' }));
    band.position.y = 0.05; g.add(band);
    g.add(lathe([[0.08, 0.065], [0.07, 0.09], [0.045, 0.16], [0.035, 0.24], [0.05, 0.31], [0.07, 0.35]], gold));
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), gold);
    globe.position.y = 0.43; g.add(globe);
  } else {
    const silver = SILVER();
    silver.side = THREE.DoubleSide;
    g.add(lathe([[0.001, 0], [0.1, 0], [0.1, 0.04], [0.06, 0.06], [0.04, 0.16], [0.05, 0.22], [0.12, 0.3], [0.17, 0.42], [0.17, 0.5], [0.155, 0.52]], silver));
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 6, 12, Math.PI * 1.35), silver);
      h.position.set(s * 0.19, 0.38, 0); h.rotation.set(0, s > 0 ? Math.PI : 0, -Math.PI * 0.68);
      g.add(h);
    }
  }
  return g;
}

export function createCeremony(scene, camera) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.0, 12), ps1({ color: '#20264a' }));
  plinth.position.set(0, 0.5, 0.9); root.add(plinth);
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 12), ps1({ color: '#c8102e' }));
  cloth.position.set(0, 1.0, 0.9); root.add(cloth);

  // the hint card over the plinth
  const cv = canvasTex(192, 40, () => {}), ctx = cv.getContext('2d'), tex = pixelTex(cv);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.31), ps1({ map: tex, lit: false, transparent: true, depthTest: false, fog: false }));
  card.renderOrder = 12; card.position.set(0, 2.25, 1.6); card.rotation.y = Math.PI; root.add(card);
  const say = (a, b, col = '#f2c21a') => {
    ctx.clearRect(0, 0, 192, 40); ctx.fillStyle = 'rgba(5,8,40,.85)'; ctx.fillRect(0, 0, 192, 40);
    drawText(ctx, a, Math.round((192 - textWidth(a, 2)) / 2), 6, col, 2, '#000');
    if (b) drawText(ctx, b, Math.round((192 - textWidth(b)) / 2), 26, '#ffffff', 1, '#000');
    tex.needsUpdate = true;
  };

  // confetti: one instanced mesh of little paper squares
  const N = 420, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.04), ps1({ lit: false, side: THREE.DoubleSide }), N);
  conf.frustumCulled = false; conf.visible = false; scene.add(conf);
  const bits = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: Math.random() * 6, w: 2 + Math.random() * 4 }));
  // fireworks: sparks in bursts over the stands
  const S = 240, sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), ps1({ lit: false }), S);
  sparks.frustumCulled = false; sparks.visible = false; scene.add(sparks);
  const sp = Array.from({ length: S }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();

  let trophy = null, squad = [], state = null, lifted = false, liftT = 0, palette = [], nextBurst = 0;
  const head = new THREE.Vector3(), dir = new THREE.Vector3(), hand = new THREE.Vector3(), tw = new THREE.Vector3();
  const rest = new THREE.Vector3(0, 1.02, 0.9);
  let held = { left: false, right: false }, deskHold = false, deskY = 1.25;

  function burst(at) {
    const c = palette[Math.floor(Math.random() * palette.length)];
    let n = 0;
    for (const s of sp) {
      if (s.life > 0 || n > 60) continue;
      s.p.copy(at); s.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(9 + Math.random() * 4);
      s.life = 1.4; s.c = c; n++;
    }
    sfx('kick', 0.4);
  }

  return {
    get active() { return !!state; },
    // kind: 'world' | 'club'; team: your team (for the squad's kit and the confetti colors)
    start(kind, team) {
      if (trophy) root.remove(trophy);
      trophy = buildTrophy(kind); trophy.position.copy(rest); root.add(trophy);
      for (const m of squad) root.remove(m.root);
      squad = [];
      for (let i = 0; i < 6; i++) {
        const m = buildPlayer(team.kit, [2, 4, 5, 8, 11, 14][i], i * 11 + 5);
        const a = -1.1 + i * 0.44, r = 2.0;
        m.root.position.set(Math.sin(a) * r, 0, Math.cos(a) * r * 0.6 + 0.9);
        m.root.rotation.y = Math.atan2(-m.root.position.x, -m.root.position.z + 0.2);
        m.phase = i; root.add(m.root); squad.push(m);
      }
      palette = [team.kit.shirt, team.kit.alt, team.kit.shorts, '#f2c21a', '#ffffff'];
      camera.getWorldPosition(head); camera.getWorldDirection(dir);
      root.position.set(head.x, 0, head.z); root.rotation.y = Math.atan2(dir.x, dir.z);
      root.visible = true; state = 'waiting'; lifted = false; held = { left: false, right: false }; deskHold = false; deskY = 1.25;
      say('CHAMPIONS!', 'GRAB THE CUP AND LIFT IT ABOVE YOUR HEAD');
    },
    stop() { state = null; root.visible = conf.visible = sparks.visible = false; },
    // raw: controls.read(); keys: desktop keys. Returns 'done' once you've lifted it and pressed on.
    update(dt, t, raw, keys) {
      if (!state) return null;

      camera.getWorldPosition(head);
      const local = v => root.worldToLocal(v);

      if (raw.vr) {
        for (const c of controllers) {
          const gp = c.userData.gamepad, h = c.userData.hand;
          const grip = !!(gp && gp.buttons[BTN.GRIP] && gp.buttons[BTN.GRIP].pressed);
          c.getWorldPosition(hand);
          trophy.getWorldPosition(tw); tw.y += 0.25;
          if (grip && !held[h] && hand.distanceTo(tw) < 0.35) held[h] = true;
          if (!grip) held[h] = false;
        }
        const hands = controllers.filter(c => held[c.userData.hand]);
        if (hands.length) {
          const p = new THREE.Vector3();
          for (const c of hands) { c.getWorldPosition(hand); p.add(hand); }
          p.multiplyScalar(1 / hands.length);
          local(p); p.y -= hands.length === 2 ? 0.2 : 0.3;
          trophy.position.lerp(p, Math.min(1, dt * 20));
        } else trophy.position.lerp(rest, Math.min(1, dt * 6));
      } else {
        if (keys.KeyE && !deskHold) deskHold = true;
        if (deskHold) {
          if (keys.ArrowUp || keys.KeyW) deskY = Math.min(head.y + 0.45, deskY + dt * 0.9);
          trophy.position.lerp(new THREE.Vector3(0, deskY, 0.55), Math.min(1, dt * 8));
        }
      }

      trophy.getWorldPosition(tw);
      if (!lifted && tw.y > head.y + 0.05 && (raw.vr ? (held.left || held.right) : deskHold)) {
        lifted = true; liftT = 0; state = 'lifted';
        sfx('roar'); sfx('net'); playMusic('champions');
        say('CHAMPIONS!', '', '#ffffff');
        conf.visible = sparks.visible = true;
        for (const b of bits) {
          b.p.set(head.x + (Math.random() - 0.5) * 8, head.y + 3 + Math.random() * 5, head.z + (Math.random() - 0.5) * 8);
          b.v.set((Math.random() - 0.5) * 0.6, -0.6 - Math.random() * 0.6, (Math.random() - 0.5) * 0.6);
          b.c = palette[Math.floor(Math.random() * palette.length)];
        }
      }
      if (lifted) {
        liftT += dt;
        // confetti flutters down and loops back to the top
        bits.forEach((b, i) => {
          b.p.addScaledVector(b.v, dt); b.p.x += Math.sin(t * b.w + b.r) * dt * 0.4;
          if (b.p.y < 0.05) b.p.y = head.y + 4;
          q.setFromEuler(e.set(t * b.w, b.r + t * 2, 0));
          conf.setMatrixAt(i, m4.compose(b.p, q, one)); conf.setColorAt(i, col.set(b.c));
        });
        conf.instanceMatrix.needsUpdate = true; if (conf.instanceColor) conf.instanceColor.needsUpdate = true;
        nextBurst -= dt;
        if (nextBurst <= 0) {
          nextBurst = 0.5 + Math.random() * 0.6;
          const a = Math.random() * Math.PI * 2;
          burst(new THREE.Vector3(head.x + Math.sin(a) * 40, 22 + Math.random() * 12, head.z + Math.cos(a) * 40));
        }
        sp.forEach((s, i) => {
          if (s.life > 0) { s.life -= dt; s.v.y -= 6 * dt; s.p.addScaledVector(s.v, dt); }
          const k = Math.max(0, s.life);
          sparks.setMatrixAt(i, m4.compose(s.p, q.identity(), one.clone().multiplyScalar(k)));
          sparks.setColorAt(i, col.set(s.c || '#ffffff'));
        });
        sparks.instanceMatrix.needsUpdate = true; if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
        if (liftT > 6 && state === 'lifted') { state = 'ready'; say('CHAMPIONS!', 'PRESS A TO CONTINUE', '#ffffff'); }
      }
      for (const m of squad) animate(m, { vx: 0, vz: 0, role: 'mate' }, dt, t, lifted);
      card.lookAt(head);
      if (state === 'ready' && raw.nav && raw.nav.ok) return 'done';
      return null;
    },
  };
}
