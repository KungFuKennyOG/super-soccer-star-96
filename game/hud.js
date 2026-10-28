// Everything drawn on top of the match, all in-world so it works in the headset:
// the stadium scoreboard, the event banner, the pass timing rings, the shot reticle and power bar.
import * as THREE from 'three';
import { GOAL } from '../rules/tuning.js';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText, textWidth, ringTex, reticleTex } from './tex.js';

const TONES = { good: '#f2c21a', bad: '#ff4040', info: '#5ad0ff' };

function canvasPlane(w, h, mw, mh) {
  const c = canvasTex(w, h, () => {});
  const t = pixelTex(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), ps1({ map: t, lit: false, transparent: true, depthTest: true, fog: false }));
  return { c, ctx: c.getContext('2d'), t, m };
}

export function buildHud(scene, camera) {
  /* scoreboard over the stand behind the goal */
  const sb = canvasPlane(128, 48, 18, 6.75);
  sb.m.material.transparent = false;
  sb.m.position.set(0, 29, GOAL.z - 22);
  scene.add(sb.m);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(19, 7.6, 0.6), ps1({ color: '#22222a' }));
  frame.position.set(0, 29, GOAL.z - 22.35); scene.add(frame);
  // hung from two cables, high enough to clear any stand's roof (placeScoreboard)
  const cables = [-1, 1].map(s => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, 40, 0.12), ps1({ color: '#22222a' }));
    c.position.set(s * 7, 29 + 3.8 + 20, GOAL.z - 22.4); scene.add(c); return c;
  });
  function placeScoreboard(y, z) {
    sb.m.position.y = frame.position.y = y;
    sb.m.position.z = z; frame.position.z = z - 0.35;
    for (const c of cables) { c.position.y = y + 3.8 + 20; c.position.z = z - 0.4; }
  }
  let sbKey = '';
  // score: 'MAD 1-2 BAR' in a cup match (shown instead of the goal count), or ''
  function scoreboard(goals, clock, points, flash, score = '') {
    const key = `${goals}|${clock}|${points}|${flash}|${score}`;
    if (key === sbKey) return; sbKey = key;
    const c = sb.ctx;
    c.fillStyle = '#05050a'; c.fillRect(0, 0, 128, 48);
    c.fillStyle = '#c8102e'; c.fillRect(0, 0, 128, 11);
    drawText(c, 'SUPER SOCCER STAR', 13, 2, '#ffffff', 1, '#000');
    if (flash) {
      drawText(c, flash, Math.round((128 - textWidth(flash, 2)) / 2), 17, Math.floor(performance.now() / 150) % 2 ? '#f2c21a' : '#ffffff', 2);
    } else if (score) {
      drawText(c, score, Math.round((128 - textWidth(score)) / 2), 15, '#f2c21a');
      drawText(c, clock, Math.round((128 - textWidth(clock, 2)) / 2), 24, '#ffffff', 2);
    } else {
      drawText(c, 'GOALS', 4, 15, '#5ad0ff'); drawText(c, String(goals).padStart(2, '0'), 4, 24, '#f2c21a', 2);
      drawText(c, clock, 128 - 4 - textWidth(clock, 2), 24, '#ffffff', 2); drawText(c, 'TIME', 128 - 4 - textWidth('TIME'), 15, '#5ad0ff');
    }
    const pts = `PTS ${points}`;
    drawText(c, pts, Math.round((128 - textWidth(pts)) / 2), 39, '#e8e8e8');
    sb.t.needsUpdate = true;
  }

  /* banner: floats in front of your face */
  const bn = canvasPlane(192, 64, 2.4, 0.8);
  bn.m.material.depthTest = false; bn.m.renderOrder = 10; bn.m.visible = false;
  scene.add(bn.m);
  let bnT = 9, bnLife = 1.8;
  function banner(b) {
    const c = bn.ctx, W = 192;
    c.clearRect(0, 0, W, 64);
    const s = b.text.length > 15 ? 1 : 2, col = TONES[b.tone] || '#fff';
    const w = textWidth(b.text, s), x = Math.round((W - w) / 2);
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - 5, 4, w + 10, 7 * s + 8);
    drawText(c, b.text, x, 8, col, s, '#000');
    (b.sub ? b.sub.split('\n') : []).slice(0, 3).forEach((line, i) => {
      const sub = line.slice(0, 31), sw = textWidth(sub), sx = Math.round((W - sw) / 2), sy = 7 * s + 16 + i * 11;
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(sx - 3, sy - 2, sw + 6, 11);
      drawText(c, sub, sx, sy, '#ffffff');
    });
    bn.t.needsUpdate = true;
    bnT = 0; bnLife = b.big ? 2.4 : 1.4;
    bn.m.visible = true;
  }

  /* pass timing: a fixed white circle and a shrinking ring over your target */
  const ringMat = () => ps1({ map: ringTex(), alphaTest: 0.5, lit: false, depthTest: false, fog: false });
  const ringTarget = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat());
  const ringLive = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat());
  for (const r of [ringTarget, ringLive]) { r.renderOrder = 11; r.visible = false; scene.add(r); }
  // ground ring under who you'd pass to
  const groundRing = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), ps1({ map: ringTex(), alphaTest: 0.5, lit: false, color: '#f2c21a' }));
  groundRing.rotation.x = -Math.PI / 2; groundRing.visible = false; scene.add(groundRing);
  // "LOB" over the target when a defender is in the lane (the pass will go over the top)
  const lobC = canvasTex(24, 9, c => { drawText(c, 'LOB', 2, 1, '#5ad0ff', 1, '#000'); });
  const lobTag = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.27), ps1({ map: pixelTex(lobC), alphaTest: 0.5, lit: false, depthTest: false, fog: false }));
  lobTag.renderOrder = 11; lobTag.visible = false; scene.add(lobTag);
  // "READ!" over a teammate you've been staring at too long: his marker has stepped in to cut it out
  const readC = canvasTex(32, 9, c => { drawText(c, 'READ!', 2, 1, '#ff4040', 1, '#000'); });
  const readTag = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.27), ps1({ map: pixelTex(readC), alphaTest: 0.5, lit: false, depthTest: false, fog: false }));
  readTag.renderOrder = 11; readTag.visible = false; scene.add(readTag);

  /* shot: a reticle on the goal mouth and a power bar */
  const reticle = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), ps1({ map: reticleTex(), alphaTest: 0.5, lit: false, depthTest: false, fog: false }));
  reticle.renderOrder = 11; reticle.visible = false; scene.add(reticle);
  // Shot power, where you're looking while you aim: a bar floating just below the middle of your view
  // (headset; the browser has its own bar), and a ring round the reticle on the goal that fills up.
  const hudMat = color => ps1({ color, lit: false, depthTest: false, depthWrite: false, fog: false });
  const power = new THREE.Group();
  const bar = (w, h, color, z, order) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), hudMat(color)); m.position.z = z; m.renderOrder = order; power.add(m); return m; };
  bar(0.29, 0.046, '#f2c21a', 0, 20);                            // gold frame
  bar(0.28, 0.036, '#10122a', 0.001, 21);                        // dark well
  const pFill = bar(0.27, 0.026, '#f2c21a', 0.002, 22);
  pFill.geometry.translate(0.135, 0, 0); pFill.position.x = -0.135;
  const lbl = canvasPlane(40, 8, 0.1, 0.02);
  drawText(lbl.ctx, 'POWER', 5, 0, '#f2c21a'); lbl.t.needsUpdate = true;
  lbl.m.material.depthTest = false; lbl.m.renderOrder = 23; lbl.m.position.set(-0.09, 0.036, 0.002); power.add(lbl.m);
  power.position.set(0, -0.2, -0.7); power.rotation.x = 0.28;
  power.visible = false;
  camera.add(power);
  const ringSegs = [];
  for (let i = 0; i < 28; i++) {
    const a0 = Math.PI / 2 - (i / 28) * Math.PI * 2;                 // clockwise from the top
    const seg = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.98, 2, 1, a0 - Math.PI * 2 / 28 * 0.85, Math.PI * 2 / 28 * 0.85), hudMat('#f2c21a'));
    seg.renderOrder = 12; reticle.add(seg); ringSegs.push(seg);
  }

  const headPos = new THREE.Vector3(), headDir = new THREE.Vector3(), tmp = new THREE.Vector3();
  let bnYaw = null;

  return {
    scoreboard, banner, power, placeScoreboard,
    // everything the HUD floats in the world, hidden while the replay camera films
    overlays: [bn.m, ringTarget, ringLive, groundRing, lobTag, readTag, reticle],
    // per frame. pass: { target: {x,z}, scale (live ring), grade window color } or null.
    update(dt, { pass, aim, charge, over, mate, lob, read }) {
      camera.getWorldPosition(headPos); camera.getWorldDirection(headDir);
      // banner pops in, then holds level in front of the face
      bnT += dt;
      if (bn.m.visible) {
        const yaw = Math.atan2(headDir.x, headDir.z);
        bnYaw = bnYaw === null || bnT < dt * 2 ? yaw : lerpAngle(bnYaw, yaw, Math.min(1, dt * 4));
        bn.m.position.set(headPos.x + Math.sin(bnYaw) * 3, headPos.y + 0.35, headPos.z + Math.cos(bnYaw) * 3);
        bn.m.lookAt(headPos.x, headPos.y + 0.35, headPos.z);
        const pop = Math.min(1, bnT / 0.12);
        bn.m.scale.setScalar(pop * (1 + 0.15 * Math.max(0, 1 - bnT / 0.3)));
        if (bnT > bnLife) bn.m.visible = false;
      } else bnYaw = null;

      groundRing.visible = !!mate;
      if (mate) { groundRing.position.set(mate.x, 0.03, mate.z); groundRing.material.color.set(read ? '#ff4040' : lob ? '#5ad0ff' : '#f2c21a'); }
      lobTag.visible = !!(mate && lob && !read);
      if (lobTag.visible) { lobTag.position.set(mate.x, pass ? 3.15 : 2.3, mate.z); lobTag.lookAt(headPos); }
      readTag.visible = !!(mate && read);
      if (readTag.visible) { readTag.position.set(mate.x, pass ? 3.15 : 2.3, mate.z); readTag.lookAt(headPos); }

      ringTarget.visible = ringLive.visible = !!pass;
      if (pass) {
        for (const r of [ringTarget, ringLive]) { r.position.set(pass.target.x, 2.5, pass.target.z); r.lookAt(headPos); }
        ringTarget.scale.setScalar(0.9);
        ringLive.scale.setScalar(Math.max(0.01, pass.scale * 0.9));
        ringLive.material.color.set(pass.grade === 'perfect' ? '#40ff60' : pass.grade === 'good' ? '#f2c21a' : '#ff5040');
      }

      reticle.visible = !!aim;
      if (aim) { reticle.position.set(aim.x, aim.y, GOAL.z + 0.08); reticle.lookAt(tmp.set(aim.x, aim.y, 0)); }

      power.visible = charge != null;
      if (charge != null) {
        const col = over > 0 ? (Math.floor(performance.now() / 80) % 2 ? '#ff2020' : '#ffffff') : charge >= 1 ? '#ff8020' : '#f2c21a';
        pFill.scale.x = Math.max(0.02, charge);
        pFill.material.color.set(col);
        const lit = Math.round(charge * ringSegs.length);
        ringSegs.forEach((sg, i) => { sg.visible = i < lit; sg.material.color.set(col); });
      }
    },
  };
}

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// A panel for the headset: title screen and full-time. lines: [{ text, color, scale }].
export function buildPanel(scene) {
  const p = canvasPlane(256, 160, 2.56, 1.6);
  p.m.material.depthTest = false; p.m.renderOrder = 12; p.m.visible = false;
  scene.add(p.m);
  return {
    mesh: p.m,
    show(draw, headPos, yaw) {
      p.ctx.clearRect(0, 0, 256, 160);
      draw(p.ctx);
      p.t.needsUpdate = true;
      p.m.position.set(headPos.x + Math.sin(yaw) * 2.6, headPos.y, headPos.z + Math.cos(yaw) * 2.6);
      p.m.lookAt(headPos);
      p.m.visible = true;
    },
    hide() { p.m.visible = false; },
  };
}

// The 90s radar: a little map of the half pitch with your goals and points along the bottom.
// One canvas, shown on your left wrist in VR and in the corner in the browser.
export function buildRadar() {
  const W = 64, MAP = 46, H = 60, c = canvasTex(W, H, () => {}), ctx = c.getContext('2d');
  const t = pixelTex(c);
  // drawn after everything and without a depth test, so your own hand can never poke through it
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.15), ps1({ map: t, lit: false, transparent: true, fog: false, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 30;
  // world x -22..22 → 3..61, z goal line → 2, halfway → 44
  const px = x => Math.round(W / 2 + x / 22 * (W / 2 - 3)), pz = z => Math.round(2 + (z - GOAL.z) / -GOAL.z * (MAP - 4));
  return {
    canvas: c, mesh,
    draw(world, goals = 0, points = 0) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(16,60,20,.88)'; ctx.fillRect(0, 0, W, MAP);
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1;
      ctx.strokeRect(1.5, 1.5, W - 3, MAP - 3);
      ctx.strokeRect(px(-16) + 0.5, 1.5, px(16) - px(-16), pz(GOAL.z + 16.5) - 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px(-3.66), 0, px(3.66) - px(-3.66), 2);
      for (const p of world.players) {
        ctx.fillStyle = p.role === 'you' ? '#f2c21a' : p.team === 'home' ? '#f2f1ea' : p.role === 'gk' ? '#29d06a' : '#5a8aff';
        ctx.fillRect(px(p.x) - 1, pz(p.z) - 1, 3, 3);
        if (p.role === 'def') { ctx.fillStyle = '#c8102e'; ctx.fillRect(px(p.x), pz(p.z), 1, 1); }
      }
      ctx.fillStyle = '#ff40ff'; ctx.fillRect(px(world.ball.x), pz(world.ball.z), 1, 1);
      // score strip
      ctx.fillStyle = '#05072a'; ctx.fillRect(0, MAP, W, H - MAP);
      ctx.fillStyle = '#c8102e'; ctx.fillRect(0, MAP, W, 1);
      drawText(ctx, `G${goals}`, 2, MAP + 4, '#f2c21a');
      const pts = String(points);
      drawText(ctx, pts, W - 2 - textWidth(pts), MAP + 4, '#ffffff');
      t.needsUpdate = true;
    },
  };
}
