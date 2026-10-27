// Raw controls for both ways to play. read() returns the same shape for the headset and the browser:
// { move: {x, y} (x right, y forward), turn, sprint, shoot, pass (held), knock, drag, restart, start (edges) }
//
// Quest:   left stick run · left grip or stick click sprint · right stick turn (it's only for turning)
//          right trigger shoot (aim with your head) · left trigger pass (timing ring) / call for it
//          A knock-on · B drag-back · Y restart
// Browser: WASD run · mouse look · Shift sprint · left click shoot · right click or E pass · Space knock-on
//          C drag-back · Q/Z turn without a mouse · R restart · Enter start
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
  const edgeKey = code => { const on = !!desk.keys[code], was = prevKeys[code]; prevKeys[code] = on; return on && !was; };
  const btn = (c, i) => { const b = c && c.userData.gamepad && c.userData.gamepad.buttons[i]; return !!(b && b.pressed); };
  const hand = h => controllers.find(c => c.userData.hand === h && c.userData.gamepad);

  return {
    desk,
    read() {
      const out = { move: { x: 0, y: 0 }, turn: 0, sprint: false, shoot: false, pass: false, knock: false, drag: false, restart: false, start: false, vr: renderer.xr.isPresenting };
      if (out.vr) {
        const L = hand('left'), R = hand('right');
        if (L && readStick(L, st)) { out.move.x = dead(st.x); out.move.y = -dead(st.y); }
        out.sprint = btn(L, BTN.GRIP) || btn(L, BTN.STICK);
        out.pass = btn(L, BTN.TRIGGER);
        out.shoot = btn(R, BTN.TRIGGER);
        if (R && readStick(R, st)) out.turn = Math.abs(st.x) > 0.2 ? st.x : 0;
        out.restart = L ? pressed(L, BTN.B) : false;
        const a = R ? pressed(R, BTN.A) : false, rt = R ? pressed(R, BTN.TRIGGER) : false;
        out.knock = a; out.drag = R ? pressed(R, BTN.B) : false;
        out.start = a || rt;
        return out;
      }
      const k = desk.keys;
      out.move.x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      out.move.y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      out.turn = (k.KeyZ ? 1 : 0) - (k.KeyQ ? 1 : 0);
      out.sprint = !!(k.ShiftLeft || k.ShiftRight);
      out.shoot = mouse.left || !!k.KeyF;
      out.pass = mouse.right || !!k.KeyE;
      out.knock = edgeKey('Space');
      out.drag = edgeKey('KeyC');
      out.restart = edgeKey('KeyR');
      out.start = edgeKey('Enter');
      return out;
    },
  };
}

const dead = v => (Math.abs(v) < 0.15 ? 0 : v);
