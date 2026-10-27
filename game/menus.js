// In-world menus that work the same in the headset and the browser: mode select, team select with a
// player on a turntable wearing the kit, the cup hub (group table or bracket), and message screens.
// Navigate with a stick or the arrow keys, confirm with the trigger / A / Enter, back with B / Esc.
import * as THREE from 'three';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText, textWidth } from './tex.js';
import { buildPlayer } from './actors.js';
import { byId, nationToward } from '../rules/teams.js';
import { drawWorldMap } from './worldmap.js';
import { table, userGroup, currentFixture, STAGE_NAMES, KO } from '../rules/cup.js';

const W = 256, H = 192;
const CUP_NAMES = { world: "WORLD CUP '96", club: 'CHAMPIONS CUP', attack: 'SCORE ATTACK' };
const MODES = [
  { id: 'attack', name: 'SCORE ATTACK', sub: 'BEAT YOUR HIGH SCORE' },
  { id: 'world', name: "WORLD CUP '96", sub: '32 NATIONS: GROUPS + KNOCKOUTS' },
  { id: 'club', name: 'CHAMPIONS CUP', sub: '16 CLUBS: STRAIGHT KNOCKOUTS' },
];

// Options on the mode screen, changed with left/right.
export const LENGTHS = [{ name: 'SHORT', mul: 0.6 }, { name: 'NORMAL', mul: 1 }, { name: 'LONG', mul: 1.5 }, { name: 'EPIC', mul: 2.5 }];
export const WOBBLES = ['OFF', 'LOW', 'FULL'];
const centre = (c, s, y, col, sc = 1, sh = '#000') => drawText(c, s, Math.round((W - textWidth(s, sc)) / 2), y, col, sc, sh);

export function logo(c, y) {
  const chrome = r => ['#ffffff', '#ffffff', '#dfe8ff', '#7d8fd0', '#ffffff', '#c8d4ff', '#9aa8e0'][r];
  drawText(c, 'SUPER', Math.round((W - textWidth('SUPER', 2)) / 2) - 30, y, '#f2c21a', 2, '#c8102e');
  drawText(c, 'SOCCER STAR', Math.round((W - textWidth('SOCCER STAR', 3)) / 2), y + 18, chrome, 3, '#0a0a50');
  c.fillStyle = '#c8102e'; c.fillRect(186, y - 2, 40, 18);
  drawText(c, "'96", 190, y + 1, '#f2c21a', 2, '#000');
}

export function createMenus(scene, camera) {
  const cv = canvasTex(W, H, () => {}), ctx = cv.getContext('2d'), tex = pixelTex(cv);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.65), ps1({ map: tex, lit: false, transparent: true, fog: false }));
  panel.renderOrder = 12; panel.visible = false;
  const root = new THREE.Group(); root.visible = false; scene.add(root); root.add(panel);

  // the turntable: a plinth with a spotlight disc and whoever's kit you're looking at
  const table3d = new THREE.Group(); root.add(table3d);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.18, 16), ps1({ color: '#2a2f5a' }));
  plinth.position.y = 0.09; table3d.add(plinth);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.04, 16), ps1({ color: '#f2c21a', lit: false }));
  ring.position.y = 0.02; table3d.add(ring);
  let model = null, modelFor = null;

  const head = new THREE.Vector3(), dir = new THREE.Vector3();
  let screen = null, sel = 0, data = {}, blink = 0;

  function place() {
    camera.getWorldPosition(head); camera.getWorldDirection(dir);
    const yaw = Math.atan2(dir.x, dir.z);
    root.position.set(head.x, 0, head.z); root.rotation.y = yaw;
    panel.position.set(screen === 'team' ? 0.75 : 0, head.y - 0.05, 2.6); panel.rotation.y = Math.PI;
    table3d.position.set(-1.05, 0, 2.4);
  }

  function showModel(team) {
    if (modelFor === team.id) return;
    if (model) table3d.remove(model.root);
    model = buildPlayer(team.kit, 10, 3 + team.id.charCodeAt(0));
    model.root.position.y = 0.18;
    table3d.add(model.root);
    modelFor = team.id;
  }

  /* ---------- drawing ---------- */

  function frame(title) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(5,8,40,.96)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f2c21a'; ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2);
    if (title) { ctx.fillStyle = '#c8102e'; ctx.fillRect(0, 2, W, 13); centre(ctx, title, 5, '#ffffff'); }
  }
  const hint = s => centre(ctx, s, H - 12, '#9aa8e0', 1, null);

  function drawMode() {
    frame(null);
    logo(ctx, 8);
    MODES.forEach((m, i) => {
      const y = 58 + i * 30, on = i === sel;
      ctx.fillStyle = on ? '#f2c21a' : '#1a2350'; ctx.fillRect(28, y, W - 56, 27);
      drawText(ctx, m.name, 38, y + 3, on ? '#05072a' : '#ffffff', 2, on ? null : '#000');
      let sub = m.sub;
      while (textWidth(sub) > W - 56 - 14 && sub.includes(' ')) sub = sub.slice(0, sub.lastIndexOf(' '));
      drawText(ctx, sub, 38, y + 18, on ? '#05072a' : '#9aa8e0');
    });
    // settings rows: < value > when selected
    const st = data.settings;
    const rows = [['MATCH LENGTH', LENGTHS[st.length].name], ['PS1 WOBBLE', WOBBLES[st.wobble]]];
    rows.forEach(([k, v], i) => {
      const y = 152 + i * 12, on = sel === MODES.length + i;
      if (on) { ctx.fillStyle = '#26306a'; ctx.fillRect(28, y - 2, W - 56, 11); }
      drawText(ctx, k, 38, y, on ? '#f2c21a' : '#9aa8e0');
      const val = on ? `< ${v} >` : v;
      drawText(ctx, val, W - 38 - textWidth(val), y, on ? '#ffffff' : '#c8d4ff');
    });
    hint(sel >= MODES.length ? 'LEFT/RIGHT TO CHANGE' : 'UP/DOWN CHOOSE - A OR ENTER TO PICK');
  }

  // World Cup: pick on a world map; the stick moves to the nearest nation in that direction.
  function drawNationMap() {
    const t = data.teams[sel];
    frame(`PICK YOUR NATION - ${CUP_NAMES[data.mode]}`);
    centre(ctx, t.name, 20, '#ffffff', textWidth(t.name, 2) > W - 12 ? 1 : 2, '#0a0a50');
    const stars = '*'.repeat(t.s) + '-'.repeat(5 - t.s), word = ['', 'UNDERDOG', 'DECENT', 'SOLID', 'STRONG', 'GIANT'][t.s];
    centre(ctx, `${stars}  ${word}`, 38, '#f2c21a', 1, null);
    drawWorldMap(ctx, 4, 50, W - 8, H - 66, t.id, blink);
    hint('STICK MOVES ON THE MAP - A PICK - B BACK');
    showModel(t);
  }

  function drawTeam() {
    if (data.mode === 'world') return drawNationMap();
    const t = data.teams[sel];
    frame(`PICK YOUR TEAM - ${CUP_NAMES[data.mode]}`);
    drawText(ctx, '<', 6, 70, '#f2c21a', 3, '#000'); drawText(ctx, '>', W - 21, 70, '#f2c21a', 3, '#000');
    const name = t.name, sc = textWidth(name, 3) > W - 50 ? 2 : 3;
    centre(ctx, name, 40, '#ffffff', sc, '#0a0a50');
    centre(ctx, t.id, 70, '#9aa8e0', 2, null);
    const stars = '*'.repeat(t.s) + '-'.repeat(5 - t.s);
    centre(ctx, stars, 96, '#f2c21a', 2, null);
    centre(ctx, ['', 'UNDERDOG', 'DECENT', 'SOLID', 'STRONG', 'GIANT'][t.s], 116, '#c8d4ff');
    // kit swatch
    const k = t.kit, sx = W / 2 - 30;
    ctx.fillStyle = k.shirt; ctx.fillRect(sx, 132, 60, 18);
    if (k.pattern !== 'solid') { ctx.fillStyle = k.pattern === 'sleeves' ? k.shirt : k.alt; for (let x = 4; x < 60; x += 12) ctx.fillRect(sx + x, 132, 5, 18); }
    ctx.fillStyle = k.shorts; ctx.fillRect(sx + 6, 150, 48, 8);
    ctx.fillStyle = k.socks; ctx.fillRect(sx + 10, 158, 12, 8); ctx.fillRect(sx + 38, 158, 12, 8);
    centre(ctx, `${sel + 1}/${data.teams.length}`, 170, '#9aa8e0', 1, null);
    hint('< > BROWSE - A PICK - B BACK');
    showModel(t);
  }

  function drawHub() {
    const cup = data.cup, fx = currentFixture(cup);
    frame(`${CUP_NAMES[cup.kind]} - ${byId(cup.user).name}`);
    drawText(ctx, 'CONTINUES', 6, 20, '#9aa8e0');
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < cup.continues ? '#ff4060' : '#3a3a5a'; ctx.fillRect(66 + i * 9, 20, 7, 7); }
    drawText(ctx, cup.stage === 'group' ? `GROUP STAGE - GAME ${cup.matchday + 1}/3` : STAGE_NAMES[cup.stage] || '', W - 6 - textWidth(cup.stage === 'group' ? `GROUP STAGE - GAME ${cup.matchday + 1}/3` : STAGE_NAMES[cup.stage] || ''), 20, '#f2c21a');
    if (cup.stage === 'group') drawGroup(cup); else drawBracket(cup, 36);
    if (fx) {
      const opp = byId(fx.opp);
      ctx.fillStyle = '#c8102e'; ctx.fillRect(0, H - 34, W, 20);
      centre(ctx, `NEXT: ${byId(cup.user).id} V ${opp.id}  ${opp.name}`, H - 30, '#ffffff');
      if (Math.floor(blink * 2) % 2) centre(ctx, 'PRESS A TO PLAY', H - 21, '#f2c21a', 1, null);
    }
    hint('B: QUIT TO MENU');
  }

  function drawGroup(cup) {
    const g = userGroup(cup), rows = table(g);
    drawText(ctx, `GROUP ${g.id}`, 10, 36, '#ffffff', 2, '#000');
    const cols = [['P', 120], ['W', 138], ['D', 156], ['L', 174], ['GD', 194], ['PTS', 220]];
    for (const [h, x] of cols) drawText(ctx, h, x, 56, '#9aa8e0');
    rows.forEach((r, i) => {
      const y = 68 + i * 16, me = r.id === cup.user;
      if (me) { ctx.fillStyle = '#26306a'; ctx.fillRect(6, y - 3, W - 12, 13); }
      if (i < 2) { ctx.fillStyle = '#40c060'; ctx.fillRect(6, y - 3, 3, 13); }
      drawText(ctx, `${i + 1} ${byId(r.id).name}`, 14, y, me ? '#f2c21a' : '#ffffff');
      const vals = [r.p, r.w, r.d, r.l, (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga), r.pts];
      vals.forEach((v, j) => drawText(ctx, String(v), cols[j][1], y, me ? '#f2c21a' : '#ffffff'));
    });
    // this matchday's other results in the group
    const done = g.fixtures.filter(f => f.ga !== null);
    done.slice(-4).forEach((f, i) => drawText(ctx, `${f.a} ${f.ga}-${f.gb} ${f.b}`, 14 + (i % 2) * 120, 136 + Math.floor(i / 2) * 10, '#9aa8e0'));
  }

  // A classic two-sided bracket: the left half of the draw runs in from the left edge, the right half
  // from the right edge, and they meet in the final in the middle.
  function drawBracket(cup, top) {
    const ROW = 15, L = [2, 31, 60, 92], R = [228, 199, 170, 140];
    const slot = (t, which, x, y) => {
      const id = t ? (which ? t.b : t.a) : null;
      if (!id) { drawText(ctx, '---', x, y, '#3a4070'); return; }
      const me = id === cup.user, won = t.winner === id, lost = t.winner && !won;
      const col = me ? '#f2c21a' : lost ? '#5a6090' : '#ffffff';
      drawText(ctx, id, x, y, col);
      const g = which ? t.gb : t.ga;
      if (g !== null) drawText(ctx, String(g) + (t.pens && won ? 'P' : ''), x + 19, y, col);
    };
    KO.forEach((r, ri) => {
      const ties = cup.rounds[r] || [], half = (8 >> ri) / 2;           // ties per side
      for (let i = 0; i < Math.max(1, half) * 2; i++) {
        const side = ri === 3 ? i : i < half ? 0 : 1;                    // 0 left, 1 right
        const k = ri === 3 ? 0 : i % half;
        const t = ties[ri === 3 ? 0 : side * half + k];
        for (const which of [0, 1]) {
          if (ri === 3 && which !== i) continue;
          const n = ri === 3 ? 0 : k * 2 + which;                       // slot index down this side
          const span = 1 << ri;
          const y = Math.round(ri === 3 ? top + 3.5 * ROW : top + (n * span + (span - 1) / 2) * ROW);
          slot(t, which, side ? R[ri] : L[ri], y);
        }
      }
    });
    drawText(ctx, 'FINAL', 115, top - 2, '#f2c21a');
    if (cup.done && cup.champion) centre(ctx, `WINNER ${byId(cup.champion).name}`, top + 8 * ROW, '#f2c21a', 1, null);
  }

  // Lines shrink to fit, and wrap onto a second line if they still don't.
  function fitted(lines) {
    const out = [];
    for (const l of lines) {
      let sc = l.big ? 2 : 1;
      if (textWidth(l.text, sc) > W - 12) sc = 1;
      if (textWidth(l.text, sc) <= W - 12) { out.push({ ...l, sc }); continue; }
      const words = l.text.split(' '), a = [];
      while (words.length && textWidth([...a, words[0]].join(' '), 1) <= W - 12) a.push(words.shift());
      out.push({ ...l, text: a.join(' '), sc: 1 }, { ...l, text: words.join(' '), sc: 1 });
    }
    return out;
  }

  function drawMessage() {
    frame(data.title);
    let y = 36;
    for (const l of fitted(data.lines)) { centre(ctx, l.text, y, l.color || '#ffffff', l.sc, '#000'); y += l.sc === 2 ? 24 : 14; }
    if (Math.floor(blink * 2) % 2) centre(ctx, data.ok || 'PRESS A', H - 26, '#f2c21a', 1, null);
  }

  function draw() {
    if (screen === 'mode') drawMode();
    else if (screen === 'team') drawTeam();
    else if (screen === 'hub') drawHub();
    else drawMessage();
    tex.needsUpdate = true;
  }

  return {
    get screen() { return screen; },
    // screen: 'mode' | 'team' | 'hub' | 'message'. data depends on the screen:
    // team { mode, teams, start? }, hub { cup }, message { title, lines: [{ text, big?, color? }], ok? }
    open(s, d = {}) {
      screen = s; data = d; sel = 0;
      if (s === 'team' && d.start) sel = Math.max(0, d.teams.findIndex(t => t.id === d.start));
      root.visible = panel.visible = true;
      table3d.visible = s === 'team';
      place(); draw();
    },
    close() { screen = null; root.visible = false; },
    // nav: { up, down, left, right, ok, back } edges. Returns an action or null:
    // { mode } | { team } | { play: true } | { quit: true } | { ok: true } | { back: true }
    update(dt, nav) {
      if (!screen) return null;
      blink += dt;
      if (model && table3d.visible) model.root.rotation.y += dt * 0.9;
      let act = null;
      if (screen === 'mode') {
        const n = MODES.length + 2, st = data.settings;
        if (nav.up) sel = (sel + n - 1) % n;
        if (nav.down) sel = (sel + 1) % n;
        if (sel < MODES.length && nav.ok) act = { mode: MODES[sel].id };
        const dir = nav.right ? 1 : nav.left ? -1 : 0;
        if (dir && sel === MODES.length) { st.length = Math.max(0, Math.min(LENGTHS.length - 1, st.length + dir)); act = { settings: st }; }
        if (dir && sel === MODES.length + 1) { st.wobble = Math.max(0, Math.min(WOBBLES.length - 1, st.wobble + dir)); act = { settings: st }; }
      } else if (screen === 'team' && data.mode === 'world') {
        for (const d of ['left', 'right', 'up', 'down']) {
          if (!nav[d]) continue;
          const to = nationToward(data.teams[sel].id, d);
          if (to) sel = data.teams.findIndex(t => t.id === to);
        }
        if (nav.ok) act = { team: data.teams[sel] };
        if (nav.back) act = { back: true };
      } else if (screen === 'team') {
        const n = data.teams.length;
        if (nav.left || nav.up) sel = (sel + n - 1) % n;
        if (nav.right || nav.down) sel = (sel + 1) % n;
        if (nav.ok) act = { team: data.teams[sel] };
        if (nav.back) act = { back: true };
      } else if (screen === 'hub') {
        if (nav.ok && currentFixture(data.cup)) act = { play: true };
        if (nav.back) act = { quit: true };
      } else if (nav.ok) act = { ok: true };
      draw();
      return act;
    },
  };
}
