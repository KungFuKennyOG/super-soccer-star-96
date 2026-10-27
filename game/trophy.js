// The trophy lift. The cup sits on a plinth in front of you with your squad around you. In the
// headset, grab it with your grips (one hand or both) and raise it above your head. In the browser,
// press E to pick it up and hold Up to raise it. Lifting it sets off confetti, fireworks and the crowd.
import * as THREE from 'three';
import { BTN } from '../engine/input.js';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText, textWidth } from './tex.js';
import { buildPlayer, animate } from './actors.js';
import { sfx } from './audio.js';
import { buildHand } from './hands.js';
import { playMusic } from './music.js';

// Trophies the PS1 way: few sides, flat shading, metal from a tiny dithered texture, and an engraved band.
function metalTex(base, hi, lo) {
  return pixelTex(canvasTex(16, 16, c => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const band = (x + (y >> 2)) % 8;                         // slanted streaks, like a cheap reflection
      c.fillStyle = band < 2 ? hi : band > 5 ? lo : base;
      if ((x * 7 + y * 3) % 11 === 0) c.fillStyle = hi;       // sparkle pixels
      c.fillRect(x, y, 1, 1);
    }
  }), [3, 2]);
}
const GOLD = () => ps1({ map: metalTex('#d8a428', '#fff1a0', '#8a5a10'), emissive: '#2a1a00', flatShading: true });
const SILVER = () => ps1({ map: metalTex('#c4c8d4', '#ffffff', '#6a6e7c'), emissive: '#16181e', flatShading: true });

function plate(text, color, bg) {
  const w = 128;
  return ps1({ map: pixelTex(canvasTex(w, 12, c => {
    c.fillStyle = bg; c.fillRect(0, 0, w, 12);
    drawText(c, text, Math.round((w - textWidth(text)) / 2), 3, color);
  })), flatShading: true });
}

// Where your hands go on each cup (trophy-local): the big ears of the club cup, or round the column
// under the globe of the world cup.
const GRIPS = { club: [[0.25, 0.39, 0], [-0.25, 0.39, 0]], world: [[0.065, 0.24, 0], [-0.065, 0.24, 0]] };

function buildTrophy(kind) {
  const g = new THREE.Group();
  const lathe = (pts, mat, seg) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
  const add = (m, y = 0) => { m.position.y = y; g.add(m); return m; };
  if (kind === 'world') {
    const gold = GOLD();
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.035, 6), gold));                       // foot
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.05, 6, 1, true), plate("WORLD CUP '96", '#f2c21a', '#1b6b3a')), 0.04);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.02, 6), gold), 0.075);
    g.add(lathe([[0.075, 0.085], [0.06, 0.12], [0.038, 0.19], [0.032, 0.25], [0.05, 0.3], [0.072, 0.34], [0.078, 0.375], [0.07, 0.385]], gold, 6));
    // the globe sits down in the cradle at the top of the column (an icosahedron's faces sit well
    // inside its corner radius, so it goes lower than the radius suggests)
    add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), gold), 0.425);
  } else {
    const silver = SILVER();
    silver.side = THREE.DoubleSide;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 8), silver));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8, 1, true), plate('CHAMPIONS CUP', '#ffffff', '#20264a')), 0.045);
    g.add(lathe([[0.1, 0.07], [0.06, 0.09], [0.035, 0.17], [0.045, 0.23], [0.11, 0.3], [0.165, 0.42], [0.175, 0.52], [0.16, 0.53]], silver, 8));
    // the big ears: a loop of chunky boxes on each side
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 6; i++) {
        const a = -0.4 + i / 6 * Math.PI * 1.2;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), silver);
        seg.position.set(side * (0.19 + Math.cos(a) * 0.1), 0.39 + Math.sin(a) * 0.13, 0);
        seg.rotation.z = side * a;
        g.add(seg);
      }
    }
  }
  return g;
}

// hands: from game/hands.js, so the cup is held by your real grips.
export function createCeremony(scene, camera, hands) {
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
  let held = { left: null, right: null }, deskHold = false, deskY = 1.25, deskHands = [], anchors = [];

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
      // in the browser your hands appear on the cup once you pick it up
      deskHands = [buildHand('left', 'fist', team.kit), buildHand('right', 'fist', team.kit)];
      // left hand on the viewer's left (+x here), fingers wrapping in toward the stem
      anchors = GRIPS[kind].map(a => new THREE.Vector3(...a));
      deskHands.forEach((h, i) => { const s = i ? -1 : 1; h.position.copy(anchors[i]).add(new THREE.Vector3(s * 0.035, 0, 0)); h.rotation.set(0, s * Math.PI / 2, 0); h.visible = false; trophy.add(h); });
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
      root.visible = true; state = 'waiting'; lifted = false; held = { left: null, right: null }; trophy.quaternion.identity(); deskHold = false; deskY = 1.25;
      say('CHAMPIONS!', 'GRAB THE CUP AND LIFT IT ABOVE YOUR HEAD');
    },
    stop() { state = null; root.visible = conf.visible = sparks.visible = false; },
    // raw: controls.read(); keys: desktop keys. Returns 'done' once you've lifted it and pressed on.
    update(dt, t, raw, keys) {
      if (!state) return null;

      camera.getWorldPosition(head);
      const local = v => root.worldToLocal(v);

      if (raw.vr) {
        // grab: squeeze a grip with your hand near one of the cup's hand-holds
        const grips = hands.grips(), aw = new THREE.Vector3();
        for (const g of grips) {
          const b = g.gamepad.buttons[BTN.GRIP], squeeze = !!(b && b.value > 0.45);
          if (!squeeze) { held[g.side] = null; continue; }
          if (held[g.side] !== null) continue;
          g.obj.getWorldPosition(hand);
          anchors.forEach((a, i) => { aw.copy(a); trophy.localToWorld(aw); if (hand.distanceTo(aw) < 0.25 && held[g.side] === null) held[g.side] = i; });
        }
        const holding = grips.filter(g => held[g.side] !== null).map(g => ({ p: local(g.obj.getWorldPosition(new THREE.Vector3())), a: anchors[held[g.side]] }));
        if (holding.length === 2 && holding[0].a !== holding[1].a) {
          // two hands: the cup turns with the line between your hands (tilt it, turn it)
          const [h0, h1] = holding, want = h1.p.clone().sub(h0.p).normalize(), have = h1.a.clone().sub(h0.a).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(have, want);
          trophy.quaternion.slerp(q, Math.min(1, dt * 15));
          const mid = h0.p.clone().add(h1.p).multiplyScalar(0.5), amid = h0.a.clone().add(h1.a).multiplyScalar(0.5).applyQuaternion(trophy.quaternion);
          trophy.position.lerp(mid.sub(amid), Math.min(1, dt * 25));
        } else if (holding.length) {
          const h0 = holding[0];
          trophy.position.lerp(h0.p.clone().sub(h0.a.clone().applyQuaternion(trophy.quaternion)), Math.min(1, dt * 25));
        } else {
          trophy.position.lerp(rest, Math.min(1, dt * 6));
          trophy.quaternion.slerp(new THREE.Quaternion(), Math.min(1, dt * 6));
        }
      } else {
        if (keys.KeyE && !deskHold) { deskHold = true; deskHands.forEach(h => { h.visible = true; }); }
        if (deskHold) {
          if (keys.ArrowUp || keys.KeyW) deskY = Math.min(head.y + 0.45, deskY + dt * 0.9);
          trophy.position.lerp(new THREE.Vector3(0, deskY, 0.55), Math.min(1, dt * 8));
        }
      }

      trophy.getWorldPosition(tw);
      if (!lifted && tw.y > head.y + 0.05 && (raw.vr ? (held.left !== null || held.right !== null) : deskHold)) {
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
