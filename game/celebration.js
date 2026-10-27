// The goal dance on screen: waits for the teammates to come over, starts the dance music, reads your
// pose (hands in the headset, arrow keys in the browser), and draws the rhythm lane in front of you.
import * as THREE from 'three';
import { createDance, stepDance, poseFromHands, DANCE, beatLen } from '../rules/dance.js';
import { controllers } from '../engine/input.js';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText, textWidth } from './tex.js';
import { playMusic, stopMusic, musicPlaying, musicTime } from './music.js';
import { sfx } from './audio.js';

const W = 256, H = 80, HIT_X = 44, PX_PER_S = 150;
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'out', Digit1: 'left', Digit2: 'right', Digit3: 'up', Digit4: 'out' };

export function createCelebration(scene, camera) {
  const c = canvasTex(W, H, () => {}), ctx = c.getContext('2d'), tex = pixelTex(c);
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), ps1({ map: tex, lit: false, transparent: true, depthTest: false, fog: false }));
  lane.renderOrder = 12; lane.visible = false; scene.add(lane);

  let wait = 0, dance = null, clock = 0, judge = null, judgeT = 9;
  const head = new THREE.Vector3(), dir = new THREE.Vector3(), hand = new THREE.Vector3();

  function readPose(vr, keys) {
    if (!vr) { for (const k in KEYS) if (keys[k]) return KEYS[k]; return null; }
    camera.getWorldPosition(head); camera.getWorldDirection(dir);
    const f = Math.hypot(dir.x, dir.z) || 1, rx = -dir.z / f, rz = dir.x / f;
    const rel = c => { c.getWorldPosition(hand); return { x: (hand.x - head.x) * rx + (hand.z - head.z) * rz, y: hand.y - head.y }; };
    const L = controllers.find(c => c.userData.hand === 'left'), R = controllers.find(c => c.userData.hand === 'right');
    return poseFromHands(L ? rel(L) : null, R ? rel(R) : null);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(5,8,40,.78)'; ctx.fillRect(0, 14, W, 54);
    ctx.fillStyle = '#f2c21a'; ctx.fillRect(0, 14, W, 2); ctx.fillRect(0, 66, W, 2);
    drawText(ctx, 'DANCE!', 4, 2, '#f2c21a', 1, '#c8102e');
    const sc = `+${dance.score}`;
    drawText(ctx, sc, W - 4 - textWidth(sc), 2, '#ffffff', 1, '#000');
    // hit zone, pulsing on the beat
    const beat = clock / beatLen(), pulse = 1 - (beat - Math.floor(beat));
    ctx.strokeStyle = pulse > 0.75 ? '#ffffff' : '#9aa8e0'; ctx.lineWidth = 2;
    ctx.strokeRect(HIT_X - 16, 24, 32, 34);
    for (const m of dance.moves) {
      const x = HIT_X + (m.t - clock) * PX_PER_S;
      if (x < -20 || x > W + 20) continue;
      if (m.grade && m.grade !== 'miss') continue;
      icon(ctx, m.move, Math.round(x), 41, m.grade === 'miss' ? '#ff4040' : '#ffffff');
    }
    if (judge && judgeT < 0.5) {
      const col = judge === 'perfect' ? '#40ff60' : judge === 'good' ? '#f2c21a' : '#ff4040', s = judge.toUpperCase();
      drawText(ctx, s, HIT_X + 26, 30, col, 2, '#000');
    }
    tex.needsUpdate = true;
  }

  return {
    get active() { return wait > 0 || !!dance; },
    // The move your teammates should be showing right now (a beat ahead of you), for their animation.
    get guide() {
      if (!dance) return null;
      const m = dance.moves.find(x => x.t > clock - 0.25);
      return { move: m ? m.move : null, beat: clock / beatLen() };
    },
    get state() { return dance ? { moves: dance.moves, clock, score: dance.score } : null; },
    start(delay = 1.4) { wait = delay; dance = null; },
    cancel() { wait = 0; if (dance) stopMusic(0.2); dance = null; lane.visible = false; },
    // Returns { score, hits, count } on the frame the dance ends, otherwise null.
    update(dt, vr, keys) {
      if (wait > 0) {
        wait -= dt;
        if (wait <= 0) { dance = createDance(); clock = 0; judge = null; playMusic('dance'); }
        return null;
      }
      if (!dance) return null;
      clock = musicPlaying() === 'dance' ? musicTime() : clock + dt;
      judgeT += dt;
      for (const j of stepDance(dance, clock, readPose(vr, keys))) {
        judge = j.grade; judgeT = 0;
        sfx(j.grade === 'miss' ? 'touch' : 'perfect');
      }
      // keep the lane in front of the face, under the banner
      camera.getWorldPosition(head); camera.getWorldDirection(dir);
      const yaw = Math.atan2(dir.x, dir.z);
      lane.position.set(head.x + Math.sin(yaw) * 2.6, head.y - 0.6, head.z + Math.cos(yaw) * 2.6);
      lane.lookAt(head.x, head.y - 0.6, head.z);
      lane.visible = true;
      draw();
      if (dance.done) {
        const r = { score: dance.score, hits: dance.hits, count: DANCE.count };
        dance = null; lane.visible = false; stopMusic(0.6);
        return r;
      }
      return null;
    },
  };
}

// A little stick figure seen from behind (your left is on the left) for each move.
function icon(ctx, move, cx, cy, col) {
  ctx.fillStyle = '#000'; ctx.fillRect(cx - 12, cy - 14, 24, 28);
  ctx.fillStyle = col;
  const line = (s, dx, dy, n) => { for (let i = 0; i < n; i++) ctx.fillRect(Math.round(cx + s * (1 + dx * i)) - (s < 0 ? 2 : 0), Math.round(cy - 6 + dy * i), 2, 2); };
  ctx.fillRect(cx - 2, cy - 12, 4, 4);                                   // head
  ctx.fillRect(cx - 1, cy - 7, 2, 9);                                    // body
  ctx.fillRect(cx - 3, cy + 2, 2, 9); ctx.fillRect(cx + 1, cy + 2, 2, 9); // legs
  const up = s => line(s, 0.9, -1.2, 6), down = s => line(s, 0.5, 1.4, 6), out = s => line(s, 1.5, 0, 6);
  if (move === 'left') { up(-1); down(1); }
  if (move === 'right') { up(1); down(-1); }
  if (move === 'up') { up(-1); up(1); }
  if (move === 'out') { out(-1); out(1); }
}
