// Raw controls for both ways to play. read() returns the same shape for the headset and the browser:
// { move: {x, y} (x right, y forward), turn, sprint, shoot, pass (held), knock, drag, restart, start (edges) }
//
// Quest:   left stick run · left grip or stick click sprint · right stick turn (it's only for turning)
//          right trigger shoot (aim with your head) · left trigger pass (timing ring) / call for it
//          A knock-on (standing still: flick it up) · B drag-back · Y restart · X skips a training drill
//          a dropping ball: trigger to volley it, look up and trigger for an overhead kick; headers are
//          your actual head (A or B also skip a goal replay)
// Browser: WASD run · mouse look · Shift sprint · left click shoot / volley · right click or E pass · Space knock-on / flick up
//          C drag-back · Q/Z turn without a mouse · R restart · N skip a training drill · Enter start
import { setupControllers, controllers, pressed, readStick, BTN, createDesktopInput } from '../engine/input.js';

export function createControls({ renderer, rig, canvas, isPlaying, onUnlock }) {
  setupControllers(renderer, rig, {});
  const desk = createDesktopInput(canvas, { active: () => !renderer.xr.isPresenting && isPlaying(), onUnlock });
  const mouse = { left: false, right: false };
  canvas.addEventListener('mousedown', e => { if (e.button === 0) mouse.left = true; if (e.button === 2) mouse.right = true; });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; });
  addEventListener('blur', () => { mouse.left = mouse.right = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  const prevKeys = {}, st = { x: 0, y: 0 };
  let navZone = null;
  // key presses are latched from the events, so a tap between two slow frames still counts
  const hits = new Set();
  addEventListener('keydown', e => { if (!e.repeat) hits.add(e.code); });
  const edgeKey = code => { const on = !!desk.keys[code], was = prevKeys[code]; prevKeys[code] = on; return (on && !was) || hits.has(code); };
  const btn = (c, i) => { const b = c && c.userData.gamepad && c.userData.gamepad.buttons[i]; return !!(b && b.pressed); };
  const hand = h => controllers.find(c => c.userData.hand === h && c.userData.gamepad);

  return {
    desk,
    read() {
      const out = { move: { x: 0, y: 0 }, turn: 0, sprint: false, shoot: false, pass: false, knock: false, drag: false, restart: false, skip: false, start: false, vr: renderer.xr.isPresenting,
        nav: { up: false, down: false, left: false, right: false, ok: false, back: false } };
      if (out.vr) {
        const L = hand('left'), R = hand('right');
        if (L && readStick(L, st)) { out.move.x = dead(st.x); out.move.y = -dead(st.y); }
        out.sprint = btn(L, BTN.GRIP) || btn(L, BTN.STICK);
        out.pass = btn(L, BTN.TRIGGER);
        out.shoot = btn(R, BTN.TRIGGER);
        if (R && readStick(R, st)) out.turn = Math.abs(st.x) > 0.2 ? st.x : 0;
        out.restart = L ? pressed(L, BTN.B) : false;
        const a = R ? pressed(R, BTN.A) : false;
        const x = L ? pressed(L, BTN.A) : false, b = R ? pressed(R, BTN.B) : false;
        out.knock = a; out.drag = b; out.skip = x;
        out.start = a;
        // menus: either stick flicks, A or X to pick, B to go back
        const sx = (L && readStick(L, st) ? st.x : 0), sy = (L ? st.y : 0);
        let rx = 0, ry = 0;
        if (R && readStick(R, st)) { rx = st.x; ry = st.y; }
        const nx = Math.abs(sx) > Math.abs(rx) ? sx : rx, ny = Math.abs(sy) > Math.abs(ry) ? sy : ry;
        const zone = Math.abs(nx) > 0.7 ? (nx > 0 ? 'right' : 'left') : Math.abs(ny) > 0.7 ? (ny > 0 ? 'down' : 'up') : Math.abs(nx) < 0.3 && Math.abs(ny) < 0.3 ? null : navZone;
        if (zone && zone !== navZone) out.nav[zone] = true;
        navZone = zone;
        // A or X picks (not the triggers: they'd still be held when the match starts and fire a shot)
        out.nav.ok = a || x; out.nav.back = b;
        hits.clear();
        return out;
      }
      const k = desk.keys;
      out.move.x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      out.move.y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      out.turn = (k.KeyZ ? 1 : 0) - (k.KeyQ ? 1 : 0);
      out.sprint = !!(k.ShiftLeft || k.ShiftRight);
      out.shoot = mouse.left || !!k.KeyF;
      out.pass = mouse.right || !!k.KeyE;
      const space = edgeKey('Space');
      out.knock = space;
      out.drag = edgeKey('KeyC');
      out.restart = edgeKey('KeyR');
      out.skip = edgeKey('KeyN');
      out.start = edgeKey('Enter');
      const nav = { up: edgeKey('ArrowUp') || edgeKey('KeyW'), down: edgeKey('ArrowDown') || edgeKey('KeyS'),
        left: edgeKey('ArrowLeft') || edgeKey('KeyA'), right: edgeKey('ArrowRight') || edgeKey('KeyD'),
        ok: out.start || space, back: edgeKey('Escape') || edgeKey('Backspace') };
      out.nav = nav;
      hits.clear();
      return out;
    },
  };
}

const dead = v => (Math.abs(v) < 0.15 ? 0 : v);
