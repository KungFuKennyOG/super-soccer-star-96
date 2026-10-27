// Super Soccer Star 96: boots the stage, turns controls into sim intents, and draws the match.
import * as THREE from 'three';
import { createStage } from '../engine/stage.js';
import { vrSupported, enterVR } from '../engine/xr.js';
import { buzz } from '../engine/input.js';
import { startLoop } from '../engine/loop.js';
import { createWorld, stepSim, resetPlay } from '../rules/sim.js';
import { createMatch, scoreEvent, tickMatch, clockText } from '../rules/match.js';
import { ringScale, gradePass, pickTarget } from '../rules/pass.js';
import { aimPoint, assist, chargeOf, overcharge } from '../rules/shot.js';
import { PASS, GOAL } from '../rules/tuning.js';
import { norm } from '../rules/vec.js';
import { PS1 } from './ps1.js';
import { buildStadium } from './stadium.js';
import { buildPlayer, buildYou, buildBall, buildArrow, animate, placeModel } from './actors.js';
import { buildHud, buildPanel, buildRadar } from './hud.js';
import { createControls } from './controls.js';
import { startAudio, sfx } from './audio.js';
import { drawText, textWidth } from './tex.js';

const LINES = 360;          // browser render height: chunky like a 90s console, still readable
const VR_SCALE = 0.5;       // headset framebuffer scale: chunky but sharp enough to read
const BEST_KEY = 'sss96.best';

const $ = id => document.getElementById(id);
const canvas = $('c');
const { renderer, scene, camera, rig } = createStage({ canvas, far: 260, antialias: false });
renderer.xr.setFramebufferScaleFactor(VR_SCALE);

function lowRes() {
  if (renderer.xr.isPresenting) return;
  renderer.setPixelRatio(LINES / innerHeight);
  renderer.setSize(innerWidth, innerHeight, false);
  PS1.snap.value.set(Math.round(LINES * innerWidth / innerHeight), LINES);
}
lowRes(); addEventListener('resize', lowRes);

const stadium = buildStadium(scene);
const hud = buildHud(scene, camera);
const panel = buildPanel(scene);
const radar = buildRadar();
$('radar').appendChild(radar.canvas);

let world = createWorld(), match = createMatch();
const models = {};
for (const p of world.players) {
  const kit = p.team === 'home' ? 'white' : p.role === 'gk' ? 'keeper' : 'stripes';
  const m = p.role === 'you' ? buildYou(kit) : buildPlayer(kit, p.num, p.num * 7 + (p.team === 'home' ? 0 : 2));
  models[p.id] = m;
  scene.add(m.root, m.shadow);
}
const ball = buildBall(); scene.add(ball.mesh, ball.shadow);
const arrow = buildArrow(); scene.add(arrow);

let mode = 'title';   // 'title' | 'play' | 'over'
let celebrateT = 0, flashT = 0, best = loadBest();
const controls = createControls({ renderer, rig, canvas, isPlaying: () => mode === 'play', onUnlock: () => { if (mode === 'play') showPause(); } });
const desk = controls.desk;

/* ---------- menus ---------- */

const overlay = $('overlay'), hudEl = $('hud');
$('best').textContent = best ? `BEST ${best}` : '';
vrSupported().then(ok => { $('vr').disabled = !ok; if (!ok) $('vrnote').textContent = 'No headset found. Open this page in the Quest browser to play in VR.'; });
$('vr').onclick = async () => {
  startAudio();
  try { await enterVR(renderer, { foveation: 1 }); } catch (e) { $('vrnote').textContent = 'The headset refused to start VR.'; return; }
  PS1.snap.value.set(480, 480);
  overlay.hidden = true;
  mode = 'title'; vrTitle();
  renderer.xr.getSession().addEventListener('end', () => { lowRes(); mode = 'title'; panel.hide(); overlay.hidden = false; });
};
$('play').onclick = () => { startAudio(); overlay.hidden = true; desk.lock(); kickOff(); };
function showPause() { mode = 'title'; overlay.hidden = false; $('play').textContent = 'RESUME'; $('play').onclick = () => { overlay.hidden = true; desk.lock(); mode = 'play'; }; }

function kickOff() {
  world = createWorld(); match = createMatch();
  bindWorld();
  mode = 'play'; panel.hide(); hudEl.hidden = renderer.xr.isPresenting;
  sfx('whistle', 1.4);
  hud.banner({ text: 'KICK OFF!', sub: 'TWO MINUTES. SCORE ALL YOU CAN.', tone: 'info', big: true });
}
function bindWorld() { lastHead = null; }

const headW = new THREE.Vector3(), dirW = new THREE.Vector3();
function headYaw() { camera.getWorldDirection(dirW); return Math.atan2(dirW.x, dirW.z); }
function headPosNow() { camera.getWorldPosition(headW); return headW; }

function logo(c, y) {
  const chrome = r => ['#ffffff', '#ffffff', '#dfe8ff', '#7d8fd0', '#ffffff', '#c8d4ff', '#9aa8e0'][r];
  drawText(c, 'SUPER', Math.round((256 - textWidth('SUPER', 2)) / 2) - 30, y, '#f2c21a', 2, '#c8102e');
  drawText(c, 'SOCCER STAR', Math.round((256 - textWidth('SOCCER STAR', 3)) / 2), y + 18, chrome, 3, '#0a0a50');
  c.fillStyle = '#c8102e'; c.fillRect(186, y - 2, 40, 18);
  drawText(c, "'96", 190, y + 1, '#f2c21a', 2, '#000');
}
function vrTitle() {
  panel.show(c => {
    c.fillStyle = 'rgba(5,8,40,.88)'; c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#f2c21a'; c.fillRect(0, 0, 256, 3); c.fillRect(0, 157, 256, 3);
    logo(c, 18);
    const lines = ['LEFT STICK RUN  -  R STICK TURN', 'R TRIGGER SHOOT: LOOK TO AIM', 'L TRIGGER PASS: RELEASE ON RING', 'FLICK R STICK UP KNOCK, DOWN DRAG'];
    lines.forEach((l, i) => drawText(c, l, Math.round((256 - textWidth(l)) / 2), 72 + i * 11, '#c8d4ff'));
    if (Math.floor(performance.now() / 500) % 2) drawText(c, 'PULL TRIGGER TO KICK OFF', Math.round((256 - textWidth('PULL TRIGGER TO KICK OFF')) / 2), 130, '#ffffff', 1, '#c8102e');
    if (best) drawText(c, `BEST ${best}`, 4, 148, '#f2c21a');
  }, headPosNow(), headYaw());
}
function fullTime() {
  mode = 'over';
  const newBest = match.points > best;
  if (newBest) { best = match.points; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} }
  sfx('whistle', 1); setTimeout(() => sfx('whistle', 1), 450); setTimeout(() => sfx('whistle', 2), 900);
  hud.banner({ text: 'FULL TIME', sub: newBest ? 'NEW BEST SCORE!' : '', tone: 'good', big: true });
  const draw = c => {
    c.fillStyle = 'rgba(5,8,40,.9)'; c.fillRect(0, 0, 256, 160);
    logo(c, 10);
    const rows = [['GOALS', match.goals], ['SHOTS', match.shots], ['POINTS', match.points], ['BEST', best]];
    rows.forEach(([k, v], i) => { drawText(c, k, 50, 64 + i * 16, '#5ad0ff', 1); drawText(c, String(v), 206 - textWidth(String(v), 2), 61 + i * 16, '#ffffff', 2); });
    drawText(c, 'TRIGGER: PLAY AGAIN', Math.round((256 - textWidth('TRIGGER: PLAY AGAIN')) / 2), 140, '#f2c21a');
  };
  if (renderer.xr.isPresenting) panel.show(draw, headPosNow(), headYaw());
  else {
    desk.locked && document.exitPointerLock();
    overlay.hidden = false; hudEl.hidden = true;
    $('final').hidden = false;
    $('final').textContent = `FULL TIME — GOALS ${match.goals} · POINTS ${match.points}${newBest ? ' · NEW BEST!' : ''}`;
    $('play').textContent = 'PLAY AGAIN';
    $('play').onclick = () => { $('final').hidden = true; overlay.hidden = true; desk.lock(); kickOff(); };
  }
}

/* ---------- holds: shot charge and pass ring ---------- */

let shotHold = null, passHold = null, lastHead = null;
const rigYaw = () => rig.rotation.y;

function buildIntent(raw, dt) {
  camera.getWorldPosition(headW); camera.getWorldDirection(dirW);
  const facing = norm(dirW.x, dirW.z);
  const right = { x: -facing.z, z: facing.x };
  const intent = {
    move: { x: facing.x * raw.move.y + right.x * raw.move.x, z: facing.z * raw.move.y + right.z * raw.move.x },
    sprint: raw.sprint, facing, knock: raw.knock, drag: raw.drag, physical: { x: 0, z: 0 },
  };
  // room-scale steps in the headset move you on the pitch too
  if (raw.vr) {
    const c = Math.cos(rigYaw()), s = Math.sin(rigYaw());
    const hx = camera.position.x * c + camera.position.z * s, hz = -camera.position.x * s + camera.position.z * c;
    if (lastHead) intent.physical = { x: hx - lastHead.x, z: hz - lastHead.z };
    lastHead = { x: hx, z: hz };
  }
  const onBall = world.owner === 'you' && !world.dead;

  if (raw.shoot && onBall && !passHold) shotHold = shotHold || { t: 0 };
  if (shotHold) {
    shotHold.t += dt;
    if (!onBall) shotHold = null;
    else if (!raw.shoot || shotHold.t > 2) {
      intent.shot = { eye: { x: headW.x, y: headW.y, z: headW.z }, dir: { x: dirW.x, y: dirW.y, z: dirW.z }, holdT: shotHold.t };
      shotHold = null;
    }
  }

  const mates = world.players.filter(p => p.role === 'mate');
  if (raw.pass && !passHold && !shotHold) {
    if (onBall) passHold = { t: 0, target: pickTarget(world.you, facing, mates).id };
    else if (!passHeldPrev) intent.call = true;
  }
  passHeldPrev = raw.pass;
  if (passHold) {
    passHold.t += dt;
    if (!onBall) passHold = null;
    else if (!raw.pass || passHold.t > PASS.ringTime + 0.05) {
      intent.pass = { holdT: passHold.t, targetId: passHold.target };
      passHold = null;
    }
  }
  return intent;
}
let passHeldPrev = false;

/* ---------- events to sound, haptics, banners ---------- */

function feedback(ev) {
  for (const e of ev) {
    const m = e.by && models[e.by];
    if ((e.type === 'kick' || e.type === 'pass') && m) m.kickT = 0;
    if (e.type === 'kick') { sfx('kick', e.power); if (e.by === 'you') buzz('right', 0.9, 60); }
    if (e.type === 'pass') { sfx('pass', 0.5); if (e.by === 'you') buzz('left', 0.6, 40); if (e.grade === 'perfect' && e.by === 'you') sfx('perfect'); }
    if (e.type === 'received') { sfx('touch'); if (e.id === 'you') buzz('both', 0.3, 30); }
    if (e.type === 'knock' || e.type === 'drag') { sfx('touch'); buzz('right', 0.4, 30); }
    if (e.type === 'goal') { sfx('net'); sfx('roar'); setTimeout(() => sfx('whistle', 1), 300); stadium.netHit(e.x, e.y); stadium.cheer(true); celebrateT = 2.4; flashT = 2.4; buzz('both', 1, 200); }
    if (e.type === 'saved' || e.type === 'parried' || e.type === 'blocked') sfx('ooh');
    if (e.type === 'post') { sfx('post'); sfx('ooh'); }
    if (e.type === 'out' || e.type === 'tackled' || e.type === 'intercepted') { sfx('groan'); sfx('whistle', 0.6); }
    const b = scoreEvent(match, e);
    if (b) hud.banner(b);
  }
}

/* ---------- the frame ---------- */

const loop = startLoop(renderer, (dt, t) => {
  const raw = controls.read();

  if (mode !== 'play') {
    if (renderer.xr.isPresenting && mode === 'title') vrTitle();
    if (raw.start && renderer.xr.isPresenting) kickOff();
    else if (raw.start && mode === 'over') { $('play').onclick(); }
  }

  if (raw.vr) rig.rotation.y -= raw.turn * 2.4 * dt;
  else { desk.yaw -= raw.turn * 2.2 * dt; camera.position.set(0, 1.7, 0); camera.rotation.set(desk.pitch - 0.22, desk.yaw, 0); }

  if (mode === 'play' && !hooks.paused) {
    if (raw.restart) { resetPlay(world); match.deadT = 0; sfx('whistle', 0.6); }
    const intent = buildIntent(raw, dt);
    const ev = stepSim(world, intent, dt);
    feedback(ev);
    const r = tickMatch(match, dt, world.dead, !!world.shot && !world.shot.done);
    if (r === 'reset') { resetPlay(world); stadium.cheer(false); sfx('whistle', 0.5); }
    if (r === 'over') { stadium.cheer(false); fullTime(); }
  }

  // put the rig under the player's head
  const you = world.you;
  if (raw.vr) {
    const c = Math.cos(rigYaw()), s = Math.sin(rigYaw());
    const hx = camera.position.x * c + camera.position.z * s, hz = -camera.position.x * s + camera.position.z * c;
    rig.position.set(you.x - hx, 0, you.z - hz);
  } else rig.position.set(you.x, 0, you.z);

  celebrateT = Math.max(0, celebrateT - dt); flashT = Math.max(0, flashT - dt);
  for (const p of world.players) {
    const m = models[p.id];
    placeModel(m, p);
    animate(m, p, dt, t, celebrateT > 0 && p.team === 'home' && p.role !== 'you');
  }
  // your own legs face where you're running, else where you look
  const yo = models.you, ys = Math.hypot(you.vx, you.vz);
  yo.root.rotation.y = ys > 0.5 ? Math.atan2(you.vx, you.vz) : Math.atan2(you.fx, you.fz);
  ball.update(world.ball, dt);
  const carrier = world.owner && world.owner !== 'you' ? world.byId[world.owner] : null;
  arrow.visible = !!carrier;
  if (carrier) { arrow.position.set(carrier.x, 2.35 + Math.sin(t * 6) * 0.06, carrier.z); arrow.lookAt(headPosNow()); }

  stadium.update(dt, t);
  updateHud();
  radar.draw(world);
  if (raw.vr) placeOnHands();
  renderer.render(scene, camera);
}, { onFps: fps => { $('fps').textContent = `${fps} FPS`; } });

function updateHud() {
  const playing = mode === 'play' && world.owner === 'you' && !world.dead;
  const mates = world.players.filter(p => p.role === 'mate');
  camera.getWorldDirection(dirW); camera.getWorldPosition(headW);
  const facing = norm(dirW.x, dirW.z);
  const target = passHold ? world.byId[passHold.target] : playing ? pickTarget(world.you, facing, mates) : null;
  let aim = null;
  if (shotHold) aim = assist(aimPoint(headW, dirW));
  hud.update(1 / 72, {
    mate: target,
    pass: passHold ? { target: world.byId[passHold.target], scale: ringScale(passHold.t), grade: gradePass(passHold.t) } : null,
    aim, charge: shotHold ? chargeOf(shotHold.t) : null, over: shotHold ? overcharge(shotHold.t) : 0,
  });
  hud.scoreboard(match.goals, clockText(match.clock), match.points, flashT > 0 ? 'GOAL!' : '');
  // browser HUD
  $('hClock').textContent = clockText(match.clock);
  $('hGoals').textContent = match.goals;
  $('hPts').textContent = match.points;
  const pw = $('power');
  pw.hidden = !shotHold;
  if (shotHold) { $('powerFill').style.width = `${chargeOf(shotHold.t) * 100}%`; pw.classList.toggle('over', overcharge(shotHold.t) > 0); }
}

// the power bar rides on the right controller, the radar on the left wrist
function placeOnHands() {
  const a = renderer.xr.getController(0), b = renderer.xr.getController(1);
  const R = b.userData.hand === 'right' ? b : a, L = R === a ? b : a;
  if (hud.power.parent !== R) R.add(hud.power);
  hud.power.position.set(0, 0.03, -0.02);
  if (radar.mesh.parent !== L) { L.add(radar.mesh); radar.mesh.position.set(0.02, 0.05, 0.06); radar.mesh.rotation.set(-1.0, 0, 0); }
}

function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } }

// hooks for the smoke test and for poking at it from the console
const hooks = { paused: false, get world() { return world; }, get match() { return match; }, desk, kickOff, loop, renderer, GOAL, camera };
window.__sss = hooks;
window.__sssOK = true;
