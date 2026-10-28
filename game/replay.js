// Goal replays. Every frame of play is recorded (ball and players) into a ring buffer; after a goal
// the last few seconds play back, slowing down for the finish, filmed by a TV camera on the gantry
// and shown on an old CRT that floats in front of you plus the stadium's big screen. The replay uses
// its own copies of the players (built per match) so the live ones are never disturbed.
import * as THREE from 'three';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText } from './tex.js';
import { buildBall, animate, placeModel } from './actors.js';
import { buildSet } from './squad.js';

const FPS = 72, KEEP = 8;                          // record rate and seconds kept
const SLOTS = FPS * KEEP;
const BEFORE = 4.2, AFTER = 0.9, SLOW_FROM = 1.3, SLOW = 0.45;   // seconds around the goal; slow-mo for the finish
const KINDS = ['', 'header', 'volley', 'bicycle'];

export function createReplay(scene, renderer) {
  let ids = [], stride = 0, buf = null, head = 0, count = 0, simT = 0;
  let ghosts = {}, clip = null, cursor = 0, active = false, pendingT = -1, goalAt = 0, frameSkip = 0;
  const ball = buildBall();
  ball.mesh.visible = ball.shadow.visible = false;
  scene.add(ball.mesh, ball.shadow);

  // the TV camera and what it films into
  const rt = new THREE.WebGLRenderTarget(256, 144);   // PS1-ish TV picture, cheap to fill
  const cam = new THREE.PerspectiveCamera(22, 16 / 9, 0.3, 200);
  const look = new THREE.Vector3();

  // a CRT on a stand in front of you
  const tv = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.64, 1.04, 0.62), ps1({ color: '#2a2a30' }));
  body.position.z = -0.32; tv.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.81), ps1({ map: rt.texture, lit: false, fog: false }));
  screen.position.z = 0.002; tv.add(screen);
  const tag = canvasTex(48, 10, () => {});
  const tagMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.07), ps1({ map: pixelTex(tag), lit: false, transparent: true, fog: false }));
  tagMesh.position.set(-0.52, 0.33, 0.004); tv.add(tagMesh);
  const tctx = tag.getContext('2d');
  tctx.fillStyle = '#c8102e'; tctx.fillRect(1, 2, 6, 6); drawText(tctx, 'REPLAY', 10, 2, '#ffffff');
  tv.visible = false; scene.add(tv);
  // and on the stadium's big screen, over the scoreboard
  const jumbo = new THREE.Mesh(new THREE.PlaneGeometry(12, 6.75), ps1({ map: rt.texture, lit: false, fog: false }));
  jumbo.visible = false; scene.add(jumbo);

  const headPos = new THREE.Vector3(), headDir = new THREE.Vector3();
  let tvYaw = null;

  function frameAt(i) { return buf.subarray(i * stride, i * stride + stride); }

  return {
    get active() { return active; },
    // per match: who's playing, and fresh replay copies of the players (you as a whole player)
    setup(world, home, away, board) {
      for (const m of Object.values(ghosts)) scene.remove(m.root, m.shadow);
      ghosts = buildSet(world, home, away, { fullYou: true });
      for (const m of Object.values(ghosts)) { m.root.visible = m.shadow.visible = false; scene.add(m.root, m.shadow); }
      ids = world.players.map(p => p.id);
      stride = 8 + ids.length * 7;
      buf = new Float32Array(SLOTS * stride);
      head = count = 0; simT = 0; active = false; pendingT = -1;
      jumbo.position.set(0, board.y, board.z + 0.5);
    },
    // every sim step: what happened, so it can be played back. ev: the step's events.
    record(world, ev, dt) {
      if (!buf) return;
      simT += dt;
      const f = frameAt(head), b = world.ball;
      f[0] = simT; f[1] = b.x; f[2] = b.y; f[3] = b.z; f[4] = b.vx; f[5] = b.vy; f[6] = b.vz; f[7] = 0;
      world.players.forEach((p, i) => {
        const o = 8 + i * 7;
        let flags = 0;
        for (const e of ev) if ((e.type === 'kick' || e.type === 'pass') && e.by === p.id) { flags |= 1; if (e.kind) f[7] = KINDS.indexOf(e.kind); }
        if (p.dive < 0) flags |= 2; if (p.dive > 0) flags |= 4; if (p.holding) flags |= 8;
        f[o] = p.x; f[o + 1] = p.z; f[o + 2] = p.vx; f[o + 3] = p.vz; f[o + 4] = p.fx; f[o + 5] = p.fz; f[o + 6] = flags;
      });
      head = (head + 1) % SLOTS; count = Math.min(SLOTS, count + 1);
      if (pendingT >= 0 && simT >= pendingT) this.start();
    },
    // a goal just went in: play it back once a moment after it has been recorded too
    goal() { if (buf) { goalAt = simT; pendingT = simT + AFTER; } },
    start() {
      pendingT = -1;
      const frames = [];
      for (let k = count - 1; k >= 0; k--) {
        const f = frameAt((head - 1 - k + SLOTS * 2) % SLOTS);
        if (f[0] >= goalAt - BEFORE) frames.push(Float32Array.from(f));
      }
      if (frames.length < 10) return;
      clip = frames; cursor = frames[0][0]; active = true; tvYaw = null;
      for (const m of Object.values(ghosts)) { m.kickT = 9; m.dive = null; m.special = null; }
    },
    stop() {
      active = false; pendingT = -1; tv.visible = jumbo.visible = false;
      for (const m of Object.values(ghosts)) m.root.visible = m.shadow.visible = false;
      ball.mesh.visible = ball.shadow.visible = false;
    },
    // advance the playback; slow motion over the finish. camera: your head, to place the TV.
    update(dt, t, camera) {
      if (!active) return;
      const speed = cursor > goalAt - SLOW_FROM ? SLOW : 1;
      const prev = cursor;
      cursor += dt * speed;
      if (cursor >= clip[clip.length - 1][0]) { this.stop(); return; }
      let i = 0;
      while (i < clip.length - 2 && clip[i + 1][0] <= cursor) i++;
      const a = clip[i], b = clip[i + 1], k = Math.min(1, Math.max(0, (cursor - a[0]) / ((b[0] - a[0]) || 1)));
      const L = (o) => a[o] + (b[o] - a[o]) * k;
      ball.update({ x: L(1), y: L(2), z: L(3), vx: L(4), vy: L(5), vz: L(6) }, dt * speed);
      ids.forEach((id, j) => {
        const o = 8 + j * 7, m = ghosts[id];
        // a kick between the last frame shown and this one
        for (const f of clip) if (f[0] > prev && f[0] <= cursor && (f[o + 6] & 1)) { m.kickT = 0; if (id === 'you' && f[7]) m.special = { kind: KINDS[f[7]], t: 0 }; }
        const flags = a[o + 6];
        const p = { x: L(o), z: L(o + 1), vx: L(o + 2), vz: L(o + 3), fx: L(o + 4), fz: L(o + 5), role: id === 'gk' ? 'gk' : id === 'you' ? 'mate' : id[0] === 'd' ? 'def' : 'mate',
          dive: flags & 2 ? -1 : flags & 4 ? 1 : 0, holding: !!(flags & 8) };
        placeModel(m, p);
        animate(m, p, dt * speed, t, false);
      });
      // the TV camera: up on the gantry along the near touchline, following the ball
      look.lerp(ball.mesh.position, look.lengthSq() ? Math.min(1, dt * 4) : 1);
      cam.position.set(19, 6.5, look.z + 5);
      cam.lookAt(look.x * 0.7, 0.9, look.z);
      // the CRT floats in front of you, easing round as you turn
      camera.getWorldPosition(headPos); camera.getWorldDirection(headDir);
      const yaw = Math.atan2(headDir.x, headDir.z);
      tvYaw = tvYaw === null ? yaw : tvYaw + Math.atan2(Math.sin(yaw - tvYaw), Math.cos(yaw - tvYaw)) * Math.min(1, dt * 2);
      tv.position.set(headPos.x + Math.sin(tvYaw) * 2.3, headPos.y - 0.15, headPos.z + Math.cos(tvYaw) * 2.3);
      tv.lookAt(headPos.x, headPos.y - 0.15, headPos.z);
      tv.visible = jumbo.visible = true;
      tagMesh.visible = Math.floor(t * 2) % 2 === 0;
    },
    // film the replay: swap the live players for the replay copies, render into the screen's texture,
    // swap back. live: objects to hide while filming (live players, ball, HUD).
    render(live) {
      if (!active) return;
      // a 24 fps TV picture in the headset (every third frame), every other frame in the browser
      frameSkip = (frameSkip + 1) % (renderer.xr.isPresenting ? 3 : 2);
      if (frameSkip) return;
      const was = live.map(o => o.visible);
      live.forEach(o => { o.visible = false; });
      tv.visible = jumbo.visible = false;
      for (const m of Object.values(ghosts)) m.root.visible = m.shadow.visible = true;
      ball.mesh.visible = ball.shadow.visible = true;
      // In the headset the frame's render target is the XR layer's framebuffer, set by three.js before
      // this frame: put that back afterwards (setting null here sent the next view to the canvas
      // instead of the headset, so frames were dropped and the picture juddered).
      const xrOn = renderer.xr.enabled, prevRT = renderer.getRenderTarget();
      renderer.xr.enabled = false;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.xr.enabled = xrOn;
      renderer.setRenderTarget(prevRT);
      for (const m of Object.values(ghosts)) m.root.visible = m.shadow.visible = false;
      ball.mesh.visible = ball.shadow.visible = false;
      live.forEach((o, i) => { o.visible = was[i]; });
      tv.visible = jumbo.visible = true;
    },
  };
}
