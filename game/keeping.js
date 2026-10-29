// The goalkeeping modes on the page: penalty shootouts (after a level cup knockout, or PENALTIES from
// the menu) and KEEPER RUSH. The rules are rules/penalties.js and rules/goalie.js; this builds their
// intent (your shot like any other, your big gloves), turns you round for each kick, draws the
// gloves and a little board, and gives the kicks their sound, banners and commentary.
//
// Gloves: in the headset each hand's glove sits further out from your chest than your hand
// (PENS.gain), so you can reach the corners. In the browser they go where you look.
import * as THREE from 'three';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText, textWidth } from './tex.js';
import { createShootout, stepShootout, tally, gloveSpot, PENS } from '../rules/penalties.js';
import { createRush, stepRush, RUSH } from '../rules/goalie.js';
import { sfx } from './audio.js';
import { buzz } from '../engine/input.js';

const GLOVES = [['#ecece4', '#2050c0'], ['#c8ff20', '#1a1a1a'], ['#f2c21a', '#8a5a10']];   // STANDARD, NEON, GOLD: [glove, cuff]

function buildGlove(side, [col, cuff]) {
  const g = new THREE.Group(), m = ps1({ color: col }), c = ps1({ color: cuff });
  const box = (w, h, d, x, y, z, mat = m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); g.add(b); };
  box(0.2, 0.2, 0.08, 0, 0, 0);                                         // palm
  for (let i = 0; i < 4; i++) box(0.045, 0.13, 0.07, -0.075 + i * 0.05, 0.16 - Math.abs(i - 1.5) * 0.015, 0);
  box(0.05, 0.11, 0.07, side * 0.13, 0.02, 0.01);                      // thumb
  box(0.21, 0.08, 0.1, 0, -0.14, 0, c);                                 // cuff
  g.scale.setScalar(1.5);
  return g;
}

export function createKeeping({ scene, camera, rig, hands, hud, commentary, juice, desk }) {
  const gloves = { left: new THREE.Group(), right: new THREE.Group() };
  for (const g of Object.values(gloves)) { g.visible = false; scene.add(g); }
  let gloveKind = -1;
  const setGloves = k => {
    if (k === gloveKind) return;
    gloveKind = k;
    for (const [s, g] of Object.entries(gloves)) { g.clear(); g.add(buildGlove(s === 'left' ? 1 : -1, GLOVES[k] || GLOVES[0])); }
  };

  // the board: shootout dots, or the rush's lives and saves, floating where you're looking
  const cv = canvasTex(128, 40, () => {}), ctx = cv.getContext('2d'), tex = pixelTex(cv);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), ps1({ map: tex, lit: false, transparent: true, fog: false }));
  board.visible = false; scene.add(board);

  let kind = null, so = null, rush = null, names = ['YOU', 'OPP'], keepingNow = false, vrNow = false;
  const head = new THREE.Vector3(), dir = new THREE.Vector3(), hl = new THREE.Vector3(), hr = new THREE.Vector3();

  function drawBoard() {
    ctx.clearRect(0, 0, 128, 40);
    ctx.fillStyle = 'rgba(5,8,40,.9)'; ctx.fillRect(0, 0, 128, 40);
    ctx.fillStyle = '#f2c21a'; ctx.fillRect(0, 0, 128, 1); ctx.fillRect(0, 39, 128, 1);
    if (so) {
      const tl = tally(so), n = tl.you.length, off = Math.max(0, n - 7);
      [[names[0], tl.you, 6], [names[1], tl.them, 22]].forEach(([id, dots, y]) => {
        drawText(ctx, id, 4, y, '#ffffff');
        dots.slice(off).forEach((d, i) => { ctx.fillStyle = d === null ? '#3a4070' : d ? '#40d060' : '#e03040'; ctx.fillRect(28 + i * 11, y, 8, 8); });
      });
      drawText(ctx, `${tl.score[0]}-${tl.score[1]}`, 128 - 4 - textWidth(`${tl.score[0]}-${tl.score[1]}`), 14, '#f2c21a');
      if (so.sudden) drawText(ctx, 'SD', 112, 30, '#ff8040');
    } else if (rush) {
      drawText(ctx, 'SAVES', 4, 5, '#9aa8e0'); drawText(ctx, String(rush.saves), 40, 5, '#ffffff', 1);
      drawText(ctx, String(rush.points), 124 - textWidth(String(rush.points)), 5, '#f2c21a');
      for (let i = 0; i < RUSH.lives; i++) { ctx.fillStyle = i < rush.lives ? '#40d060' : '#3a3a5a'; ctx.fillRect(4 + i * 12, 20, 9, 12); }
      if (rush.streak > 1) drawText(ctx, `STREAK x${rush.streak}`, 124 - textWidth(`STREAK x${rush.streak}`), 22, '#ff8040');
    }
    tex.needsUpdate = true;
  }

  // you face the goal for your kicks and out of it when you're keeping
  // in the headset the rig turns so that wherever you're physically facing becomes that way
  const fwd = new THREE.Vector3();
  function turnRig(yaw) {
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    rig.rotation.y = yaw - Math.atan2(-fwd.x, -fwd.z);
  }
  function face(out, world, vr) {
    keepingNow = out;
    if (vr) turnRig(out ? Math.PI : 0);
    else { desk.yaw = out ? Math.PI : 0; desk.pitch = 0; }
    // the board hangs over the goal for your kicks, over the edge of the box when you're in goal
    board.position.set(0, out ? 3.4 : 4.6, out ? world.you.z + 13 : world.you.z - 13);
    board.rotation.y = out ? Math.PI : 0;
    board.visible = true;
  }

  // your gloves' world positions this frame (and the meshes put there), or [] when you're not in goal
  function gloveSpots(raw, world) {
    const on = keepingNow && (rush || (so && so.turn === 'them'));
    gloves.left.visible = gloves.right.visible = on;
    hands.hide('left', on); hands.hide('right', on);
    if (!on) return [];
    camera.getWorldPosition(head); camera.getWorldDirection(dir);
    const chest = { x: head.x, y: head.y - 0.4, z: head.z }, out = [];
    if (raw.vr) {
      for (const [side, v] of [['left', hl], ['right', hr]]) {
        const h = hands.hand(side, v);
        if (!h) continue;
        const g = gloveSpot(chest, h.pos);
        gloves[side].position.set(g.x, g.y, g.z); out.push(g);
      }
    } else {
      // browser: they go where you look (a 34° glance reaches the post), on a line a metre in front of you
      const zp = world.you.z + 1.1, dz = Math.max(0.2, dir.z);
      const px = Math.max(world.you.x - 2.7, Math.min(world.you.x + 2.7, world.you.x + dir.x / dz * 4));
      const py = Math.max(0.15, Math.min(2.5, head.y + dir.y / dz * 4));
      gloves.left.position.set(px + 0.17, py, zp); gloves.right.position.set(px - 0.17, py, zp);
      out.push({ x: px + 0.17, y: py, z: zp }, { x: px - 0.17, y: py, z: zp });
    }
    for (const g of Object.values(gloves)) { g.lookAt(world.ball.x, world.ball.y, world.ball.z); g.rotateY(Math.PI); }
    return out;
  }

  function onEvents(ev, world, models, vr) {
    for (const e of ev) {
      if (e.type === 'penSetup') { face(e.turn === 'them', world, vr); drawBoard(); if (so.sudden && e.turn === so.kicks.order && so.kicks.you.length === PENS.kicks) { hud.banner({ text: 'SUDDEN DEATH', sub: '', tone: 'info', big: true }); commentary.event({ type: 'suddenDeath' }); } }
      if (e.type === 'rushSetup') { face(true, world, vr); drawBoard(); }
      if (e.type === 'kick') { const m = models[e.by]; if (m) m.kickT = 0; if (models.gk && e.by === 'you') models.gk.split = 0; sfx('kick', e.power); juice.event(e, world); }
      if (e.type === 'penResult') {
        drawBoard();
        const yours = e.by === 'you';
        if (e.scored) { sfx('net'); sfx(yours ? 'roar' : 'groan'); if (yours) buzz('both', 0.8, 120); }
        else if (e.how === 'saved') { sfx(yours ? 'ooh' : 'roar'); if (!yours) buzz('both', 1, 90); }
        else { sfx(e.how === 'post' ? 'post' : 'ooh'); }
        const txt = e.scored ? (yours ? (e.chip ? 'PANENKA!' : 'SCORED!') : 'THEY SCORE') : e.how === 'saved' ? (yours ? 'SAVED' : 'GREAT SAVE!') : e.how === 'post' ? 'OFF THE POST' : yours ? 'MISSED!' : 'THEY MISS!';
        const good = yours === e.scored;
        hud.banner({ text: txt, sub: tally(so).score.join(' - '), tone: good ? 'good' : 'bad' });
        commentary.event({ type: 'pen', by: e.by, scored: e.scored, how: e.how, chip: e.chip });
      }
      if (e.type === 'rushResult') {
        drawBoard();
        if (e.how === 'saved') {
          sfx('roar'); buzz('both', 1, 90);
          hud.banner({ text: e.catch ? 'HOLDS IT!' : e.tips ? 'FINGERTIPS!' : 'SAVED!', sub: `+${e.points}`, tone: 'good' });
          commentary.event({ type: 'rushSave', tips: e.tips, streak: e.streak });
        } else if (e.how === 'goal') {
          sfx('net'); sfx('groan');
          hud.banner({ text: 'GOAL', sub: e.lives ? `${e.lives} LEFT` : 'THAT\'S THE LOT', tone: 'bad' });
          commentary.event({ type: 'rushGoal', lives: e.lives });
        } else { sfx('ooh'); hud.banner({ text: e.how === 'post' ? 'OFF THE POST' : 'WIDE', sub: '', tone: 'info' }); }
      }
    }
  }

  return {
    get active() { return !!kind; },
    get kind() { return kind; },
    get shootout() { return so; },
    get rush() { return rush; },
    // what('pens' | 'rush'); opts: { level, oppStars, ids: [yours, theirs], gloves }
    start(what, world, opts = {}) {
      kind = what; setGloves(opts.gloves || 0);
      names = opts.ids || names;
      so = what === 'pens' ? createShootout({ level: opts.level || 0, oppStars: opts.oppStars || 3 }) : null;
      rush = what === 'rush' ? createRush() : null;
      world.dead = false;
      drawBoard();
    },
    stop() {
      if (!kind) return;
      kind = null; so = rush = null; keepingNow = false; board.visible = false;
      gloves.left.visible = gloves.right.visible = false;
      hands.hide('left', false); hands.hide('right', false);
      if (vrNow) turnRig(0); else rig.rotation.y = 0;     // back facing up the pitch
    },
    // one frame. intent from game/intent.js (your shot). Returns the step's events.
    update(dt, raw, intent, world, models, rnd = Math.random) {
      if (!kind) return [];
      vrNow = raw.vr;
      intent.gloves = gloveSpots(raw, world);
      const ev = so ? stepShootout(so, world, intent, dt, rnd) : stepRush(rush, world, intent, dt, rnd);
      onEvents(ev, world, models, raw.vr);
      // the ball's yours to strike on your kicks (game/intent.js charges the shot while you're on it)
      world.owner = so && so.turn === 'you' && so.phase === 'ready' ? 'you' : null;
      return ev;
    },
    // for the stadium scoreboard: { goals, clock, points, line }
    board() {
      if (so) { const s = tally(so).score; return { goals: s[0], clock: so.sudden ? 'SD' : 'PENS', points: 0, line: `${names[0]} ${s[0]}-${s[1]} ${names[1]}` }; }
      if (rush) return { goals: rush.saves, clock: 'RUSH', points: rush.points, line: `SAVES ${rush.saves}` };
      return null;
    },
  };
}
