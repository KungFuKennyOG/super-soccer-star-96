// Super Soccer Star 96: boots the stage, turns controls into sim intents, and draws the match.
import * as THREE from 'three';
import { createStage } from '../engine/stage.js';
import { vrSupported, enterVR } from '../engine/xr.js';
import { buzz } from '../engine/input.js';
import { startLoop } from '../engine/loop.js';
import { createWorld, stepSim, resetPlay, startCelebration, defenders } from '../rules/sim.js';
import { createMatch, createScenarioMatch, counterAttack, scoreEvent, tickMatch, clockText, isHatTrick } from '../rules/match.js';
import { ALL, NATIONS, byId, teamsFor } from '../rules/teams.js';
import { createCup, currentFixture, scenarioFor, playUser, STAGE_NAMES } from '../rules/cup.js';
import { tuneFor } from '../rules/skill.js';
import { ringScale, gradePass, pickTarget, laneBlocked } from '../rules/pass.js';
import { aimPoint, assist, chargeOf, overcharge } from '../rules/shot.js';
import { PASS, GOAL, MATCH } from '../rules/tuning.js';
import { norm } from '../rules/vec.js';
import { PS1 } from './ps1.js';
import { buildStadium } from './stadium.js';
import { buildBall, buildArrow, animate, placeModel } from './actors.js';
import { createSquads } from './squad.js';
import { createMenus } from './menus.js';
import { createCeremony } from './trophy.js';
import { createHands } from './hands.js';
import { buildHud, buildRadar } from './hud.js';
import { createControls } from './controls.js';
import { startAudio, sfx } from './audio.js';
import { playMusic, stopMusic } from './music.js';
import { createCelebration } from './celebration.js';

const LINES = 480;          // browser render height: a little chunky, clearly readable
const VR_SCALE = 0.7;       // headset framebuffer scale: soft retro, still sharp
const BEST_KEY = 'sss96.best';

const $ = id => document.getElementById(id);
const canvas = $('c');
const { renderer, scene, camera, rig } = createStage({ canvas, far: 260, antialias: false });
renderer.xr.setFramebufferScaleFactor(VR_SCALE);

function lowRes() {
  if (renderer.xr.isPresenting) return;
  renderer.setPixelRatio(LINES / innerHeight);
  renderer.setSize(innerWidth, innerHeight, false);
  PS1.snap.value.set(Math.round(LINES * 1.5 * innerWidth / innerHeight), LINES * 1.5); // wobble finer than the pixels
}
lowRes(); addEventListener('resize', lowRes);

const stadium = buildStadium(scene);
const hud = buildHud(scene, camera);
const radar = buildRadar();
const celebration = createCelebration(scene, camera);
const menus = createMenus(scene, camera);
const ceremony = createCeremony(scene, camera);
const squads = createSquads(scene);
const hands = createHands(renderer, rig);
$('radar').appendChild(radar.canvas);

// what's being played: the mode, your team, the opponent, and the cup run if there is one
const game = { kind: 'attack', team: byId('MAD'), opp: byId('BAR'), cup: null, fixture: null, scenario: null };
let world = createWorld(), match = createMatch();
let models = squads.dress(world, game.team, game.opp);
const ball = buildBall(); scene.add(ball.mesh, ball.shadow);
const arrow = buildArrow(); scene.add(arrow);

let mode = 'title';   // 'title' (browser start page) | 'menu' | 'play' | 'ceremony' | 'paused'
let celebrateT = 0, flashT = 0, best = loadBest();
const controls = createControls({ renderer, rig, canvas, isPlaying: () => mode === 'play', onUnlock: () => { if (mode === 'play') showPause(); } });
const desk = controls.desk;

/* ---------- start page (browser) ---------- */

const overlay = $('overlay'), hudEl = $('hud');
$('best').textContent = best ? `SCORE ATTACK BEST ${best}` : '';
vrSupported().then(ok => { $('vr').disabled = !ok; if (!ok) $('vrnote').textContent = 'No headset found. Open this page in the Quest browser to play in VR.'; });
$('vr').onclick = async () => {
  startAudio(); playMusic('menu');
  try { await enterVR(renderer, { foveation: 1 }); } catch (e) { $('vrnote').textContent = 'The headset refused to start VR.'; return; }
  PS1.snap.value.set(8192, 8192); PS1.affine.value = 0; // no wobble or warp in the headset
  overlay.hidden = true;
  setTimeout(() => openMenu('mode'), 300); // let the headset pose settle before placing the menu
  renderer.xr.getSession().addEventListener('end', () => { PS1.affine.value = 1; lowRes(); menus.close(); ceremony.stop(); mode = 'title'; overlay.hidden = false; hudEl.hidden = true; });
};
$('play').onclick = () => { startAudio(); playMusic('menu'); overlay.hidden = true; desk.yaw = 0; desk.pitch = 0; openMenu('mode'); };
// menu music starts on the first click or key (browsers won't play sound before that)
const menuMusic = () => { startAudio(); if (mode !== 'play') playMusic('menu'); };
addEventListener('pointerdown', menuMusic, { once: true });
addEventListener('keydown', menuMusic, { once: true });
function showPause() {
  mode = 'paused'; overlay.hidden = false; $('play').textContent = 'RESUME';
  $('play').onclick = () => { overlay.hidden = true; desk.lock(); mode = 'play'; };
}

/* ---------- menus and the cup run ---------- */

function openMenu(screen, data) {
  mode = 'menu'; hudEl.hidden = true;
  if (!renderer.xr.isPresenting) { desk.pitch = 0; if (document.pointerLockElement) document.exitPointerLock(); }
  playMusic('menu');
  menus.open(screen, data);
}
const teamsForMode = kind => (kind === 'attack' ? ALL : teamsFor(kind));

function onMenu(act) {
  const scr = menus.screen;
  if (act.mode) { game.kind = act.mode; openMenu('team', { mode: act.mode, teams: teamsForMode(act.mode), start: teamsForMode(act.mode).some(t => t.id === game.team.id) ? game.team.id : null }); }
  else if (act.team) {
    game.team = act.team;
    if (game.kind === 'attack') {
      const rivals = ALL.filter(t => t.id !== act.team.id && t.s >= 4 && (t.id.length === 3) && teamsFor(NATIONS.includes(act.team) ? 'world' : 'club').includes(t));
      game.opp = rivals[Math.floor(Math.random() * rivals.length)];
      game.cup = null; game.scenario = null;
      startMatch();
    } else {
      game.cup = createCup(game.kind, act.team.id);
      openMenu('hub', { cup: game.cup });
    }
  } else if (act.back && scr === 'team') openMenu('mode');
  else if (act.play) {
    game.fixture = currentFixture(game.cup);
    game.opp = byId(game.fixture.opp);
    game.scenario = scenarioFor(game.cup, game.fixture);
    startMatch();
  } else if (act.quit) openMenu('mode');
  else if (act.ok && menuNext) { const n = menuNext; menuNext = null; n(); }
}
let menuNext = null;
function message(title, lines, next, ok) { menuNext = next; openMenu('message', { title, lines, ok }); }

function startMatch() {
  world = createWorld(Math.random, tuneFor(game.team.s, game.opp.s));
  match = game.scenario ? createScenarioMatch(game.scenario) : createMatch();
  models = squads.dress(world, game.team, game.opp);
  hands.setKit(game.team.kit);
  lastHead = null; shotHold = passHold = null; armed = false;
  menus.close(); stopMusic(0.4); celebration.cancel(); stadium.cheer(false);
  mode = 'play'; hudEl.hidden = renderer.xr.isPresenting;
  if (!renderer.xr.isPresenting) { desk.yaw = 0; desk.pitch = 0; desk.lock(); }
  sfx('whistle', 1.4);
  const s = game.scenario;
  if (s) hud.banner({ text: `${s.minute}' ${game.team.id} ${s.us}-${s.them} ${game.opp.id}`, sub: `${game.fixture.label}\n${s.text}`, tone: 'info', big: true });
  else hud.banner({ text: 'KICK OFF!', sub: `V ${game.opp.name}\nTWO MINUTES. SCORE ALL YOU CAN.`, tone: 'info', big: true });
}

function fullTime() {
  sfx('whistle', 1); setTimeout(() => sfx('whistle', 1), 450); setTimeout(() => sfx('whistle', 2), 900);
  stadium.cheer(false);
  if (!game.cup) {
    const newBest = match.points > best;
    if (newBest) { best = match.points; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} }
    $('best').textContent = `SCORE ATTACK BEST ${best}`;
    hud.banner({ text: 'FULL TIME', sub: newBest ? 'NEW BEST SCORE!' : '', tone: 'good', big: true });
    return setTimeout(() => message('FULL TIME', [
      { text: `GOALS ${match.goals}`, big: true }, { text: `SHOTS ${match.shots}` },
      { text: `POINTS ${match.points}`, big: true, color: '#f2c21a' }, { text: newBest ? 'NEW BEST SCORE!' : `BEST ${best}`, color: newBest ? '#40ff60' : '#9aa8e0' },
    ], () => openMenu('mode'), 'PRESS A FOR THE MENU'), 1800);
  }
  const cup = game.cup, us = match.us, them = match.them, team = game.team, opp = game.opp;
  const res = playUser(cup, us, them);
  const score = { text: `${team.id} ${us} - ${them} ${opp.id}`, big: true };
  hud.banner({ text: 'FULL TIME', sub: `${us} - ${them}`, tone: res.result === 'loss' ? 'bad' : 'good', big: true });
  let lines, next, ok;
  if (res.champion) {
    lines = [score, { text: 'YOU WIN THE CUP!', big: true, color: '#f2c21a' }, { text: `${team.name} ARE CHAMPIONS` }];
    next = startCeremony; ok = 'PRESS A TO LIFT THE CUP';
  } else if (res.retry) {
    lines = [score, { text: res.result === 'draw' ? 'NOT ENOUGH - YOU NEEDED THE WIN' : 'BEATEN!', color: '#ff4040' }, { text: 'CONTINUE?', big: true, color: '#f2c21a' }, { text: `${cup.continues} CONTINUE${cup.continues === 1 ? '' : 'S'} LEFT` }];
    next = () => { game.scenario = scenarioFor(cup, game.fixture); startMatch(); }; ok = 'PRESS A TO TRY AGAIN';
  } else if (res.out) {
    lines = [score, { text: 'KNOCKED OUT', big: true, color: '#ff4040' }, { text: `CHAMPIONS: ${byId(cup.champion).name}` }];
    next = () => openMenu('hub', { cup }); ok = 'PRESS A';
  } else {
    const what = cup.stage === 'group' || game.fixture.stage === 'group'
      ? { win: 'WIN - 3 POINTS', draw: 'DRAW - 1 POINT', loss: 'DEFEAT - NO POINTS' }[res.result]
      : `THROUGH TO THE ${STAGE_NAMES[cup.stage]}`;
    lines = [score, { text: what, big: true, color: res.result === 'loss' ? '#ff4040' : '#40ff60' }];
    if (res.advanced && game.fixture.stage === 'group') lines.push({ text: `THROUGH TO THE ${STAGE_NAMES[cup.stage]}`, color: '#f2c21a' });
    next = () => openMenu('hub', { cup }); ok = 'PRESS A';
  }
  setTimeout(() => message('FULL TIME', lines, next, ok), 1800);
}

function startCeremony() {
  menus.close(); mode = 'ceremony';
  for (const m of Object.values(models)) { m.root.visible = m.shadow.visible = false; }
  ball.mesh.visible = ball.shadow.visible = arrow.visible = false;
  stadium.cheer(true);
  hands.setKit(game.team.kit);
  ceremony.start(game.cup.kind, game.team);
}
function endCeremony() {
  ceremony.stop(); stadium.cheer(false);
  for (const m of Object.values(models)) { m.root.visible = m.shadow.visible = true; }
  ball.mesh.visible = ball.shadow.visible = true;
  openMenu('mode');
}

const headW = new THREE.Vector3(), dirW = new THREE.Vector3();
function headPosNow() { camera.getWorldPosition(headW); return headW; }

/* ---------- holds: shot charge and pass ring ---------- */

let shotHold = null, passHold = null, lastHead = null, armed = false;
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
  // after kick-off, shoot and pass only count once both have been let go
  if (!armed) { if (!raw.shoot && !raw.pass) armed = true; else { passHeldPrev = raw.pass; return intent; } }

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
    if (b && (e.type === 'tackled' || e.type === 'intercepted') && counterAttack(match)) {
      b.text = 'THEY SCORE!'; b.sub = `ON THE COUNTER  ${match.us}-${match.them}`; sfx('roar');
    }
    if (b) hud.banner(b);
    if (isHatTrick(match, e)) startDance();
  }
}

// The hat-trick dance: teammates come over, then the rhythm game starts.
function startDance(delay = 1.6) { startCelebration(world); celebration.start(delay); }

/* ---------- the frame ---------- */

const loop = startLoop(renderer, (dt, t) => {
  const raw = controls.read();

  // the button that starts a match (A) is also knock-on: don't let that same press reach the match
  const wasPlaying = mode === 'play';
  if (mode === 'menu') { const act = menus.update(dt, raw.nav); if (act) onMenu(act); }
  if (mode === 'ceremony' && ceremony.update(dt, t, raw, desk.keys) === 'done') endCeremony();

  if (raw.vr && mode === 'play') rig.rotation.y -= raw.turn * 2.4 * dt;
  else { if (mode === 'play') desk.yaw -= raw.turn * 2.2 * dt; camera.position.set(0, 1.7, 0); camera.rotation.set(desk.pitch - 0.22, desk.yaw, 0); }

  if (mode === 'play' && wasPlaying && !hooks.paused) {
    if (raw.restart) { resetPlay(world); match.deadT = 0; celebration.cancel(); stadium.cheer(false); sfx('whistle', 0.6); }
    const intent = buildIntent(raw, dt);
    const ev = stepSim(world, intent, dt);
    feedback(ev);
    if (celebration.active) {
      const d = celebration.update(dt, raw.vr, desk.keys);
      if (d) {
        match.points += d.score;
        hud.banner({ text: d.hits === d.count ? 'FULL COMBO!' : `DANCE ${d.hits}/${d.count}`, sub: `+${d.score}`, tone: d.hits ? 'good' : 'bad', big: true });
        match.deadT = MATCH.deadTime - 1.2;
      }
    }
    const r = celebration.active ? null : tickMatch(match, dt, world.dead, !!world.shot && !world.shot.done);
    if (r === 'reset') { resetPlay(world); stadium.cheer(false); sfx('whistle', 0.5); }
    if (r === 'over') { mode = 'menu'; fullTime(); }
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
    animate(m, p, dt, t, celebrateT > 0 && p.team === 'home' && p.role !== 'you', celebration.guide);
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
  radar.draw(world, match.goals, match.points);
  if (raw.vr) { placeOnHands(); hands.update(); }
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
    mate: target, lob: !!target && laneBlocked(world.ball, target, defenders(world)),
    pass: passHold ? { target: world.byId[passHold.target], scale: ringScale(passHold.t), grade: gradePass(passHold.t) } : null,
    aim, charge: shotHold ? chargeOf(shotHold.t) : null, over: shotHold ? overcharge(shotHold.t) : 0,
  });
  hud.scoreboard(match.goals, clockText(match.clock), match.points, flashT > 0 ? 'GOAL!' : '',
    match.scenario ? `${game.team.id} ${match.us}-${match.them} ${game.opp.id}` : '');
  // browser HUD
  $('hClock').textContent = clockText(match.clock);
  $('hScore').textContent = match.scenario ? `${game.team.id} ${match.us} - ${match.them} ${game.opp.id}` : `V ${game.opp.id}`;
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
  if (radar.mesh.parent !== L) { L.add(radar.mesh); radar.mesh.position.set(0.02, 0.06, 0.06); radar.mesh.rotation.set(-1.0, 0, 0); }
}

function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } }

// hooks for the smoke test and for poking at it from the console
const hooks = { paused: false, get world() { return world; }, get match() { return match; }, dance: celebration, startDance, desk, menus, game, startMatch, startCeremony, loop, renderer, GOAL, camera };
window.__sss = hooks;
window.__sssOK = true;
