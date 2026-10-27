// Input for both ways to play: Quest controllers in VR, mouse and keyboard (or touch) in the browser.

/* ---------- VR controllers ---------- */

// Gamepad button indices on Quest Touch controllers. On the left controller A and B are X and Y.
export const BTN = { TRIGGER: 0, GRIP: 1, STICK: 3, A: 4, B: 5 };

// Both controllers, once setupControllers has run. c.userData.hand is 'left' or 'right',
// c.userData.gamepad is the live Gamepad (null while disconnected).
export const controllers = [];

// Adds the two controllers to the rig. Handlers get the controller (and the event):
// connected, disconnected, selectstart, selectend (trigger), squeezestart (grip).
// hand and gamepad are already set on c.userData when connected runs.
/**
 * @param {any} renderer
 * @param {any} rig
 * @param {{ connected?: Function, disconnected?: Function, selectstart?: Function, selectend?: Function, squeezestart?: Function }} [on]
 */
export function setupControllers(renderer, rig, on = {}) {
  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    c.addEventListener('connected', ev => {
      c.userData.hand = ev.data.handedness === 'left' ? 'left' : 'right';
      c.userData.gamepad = ev.data.gamepad;
      if (on.connected) on.connected(c, ev);
    });
    c.addEventListener('disconnected', ev => {
      if (on.disconnected) on.disconnected(c, ev);
      c.userData.gamepad = null;
    });
    for (const type of ['selectstart', 'selectend', 'squeezestart']) {
      if (on[type]) c.addEventListener(type, ev => on[type](c, ev));
    }
    rig.add(c); controllers.push(c);
  }
  return controllers;
}

// true on the frame a button goes down. Call it once per button per frame:
// it remembers the last state it saw for that hand and button.
const btnPrev = {};
export function pressed(c, i) {
  const gp = c.userData.gamepad, b = gp && gp.buttons && gp.buttons[i], k = c.userData.hand + i;
  const on = !!(b && b.pressed), was = btnPrev[k];
  btnPrev[k] = on;
  return on && !was;
}

// Thumbstick into out.x / out.y (-1..1, y is down). False when the controller has no gamepad.
// Quest reports the stick on axes 2/3; older pads on 0/1.
export function readStick(c, out) {
  const gp = c.userData.gamepad;
  if (!gp || !gp.axes) return false;
  const ax = gp.axes;
  out.x = ax.length >= 4 ? ax[2] : (ax[0] || 0);
  out.y = ax.length >= 4 ? ax[3] : (ax[1] || 0);
  return true;
}

// Rumble: hand is 'left', 'right' or 'both'; v is strength 0..1.
export function buzz(hand, v, ms) {
  controllers.forEach(c => {
    if (hand !== 'both' && c.userData.hand !== hand) return;
    const gp = c.userData.gamepad, h = gp && gp.hapticActuators && gp.hapticActuators[0];
    if (h && h.pulse) { try { h.pulse(v, ms); } catch (e) {} }
  });
}

/* ---------- desktop: mouse look, keys, touch look ---------- */

// active(): whether desktop look applies right now (the game is in desktop mode).
// onUnlock(): the pointer lock was lost after having been on, e.g. Esc. Games pause here.
// touch: { onTap } turns on drag-to-look for phones and tablets; a tap that barely moves calls onTap.
// Returns { keys, yaw, pitch, locked, lock() }. keys[ev.code] is true while held. Write yaw and pitch to reset the view.
/**
 * @typedef {object} DesktopInputOptions
 * @property {() => boolean} [active]
 * @property {() => void} [onUnlock]
 * @property {{ blocked?: () => boolean, onTap?: () => void }} [touch]
 * @property {number} [sens]
 * @property {number} [touchSens]
 * @property {number} [pitchMax]
 */
/**
 * @param {HTMLCanvasElement} canvas
 * @param {DesktopInputOptions} [opts]
 */
export function createDesktopInput(canvas, { active = () => true, onUnlock, touch, sens = .0024, touchSens = .005, pitchMax = 1.3 } = {}) {
  const desk = { keys: {}, yaw: 0, pitch: 0, locked: false, lock };
  let wasLocked = false;
  const clampPitch = () => { desk.pitch = Math.max(-pitchMax, Math.min(pitchMax, desk.pitch)); };

  function lock() {
    try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  }
  document.addEventListener('pointerlockchange', () => {
    desk.locked = document.pointerLockElement === canvas;
    if (desk.locked) wasLocked = true;
    if (!desk.locked && wasLocked && onUnlock) onUnlock();
  });
  document.addEventListener('mousemove', ev => {
    if (!active() || !desk.locked) return;
    desk.yaw -= ev.movementX * sens; desk.pitch -= ev.movementY * sens; clampPitch();
  });

  document.addEventListener('keydown', ev => { desk.keys[ev.code] = true; });
  document.addEventListener('keyup', ev => { desk.keys[ev.code] = false; });
  addEventListener('blur', () => { for (const k in desk.keys) desk.keys[k] = false; });

  if (touch) {
    let t = null;
    canvas.addEventListener('pointerdown', ev => {
      if (!active() || ev.pointerType !== 'touch' || (touch.blocked && touch.blocked())) return;
      t = { x: ev.clientX, y: ev.clientY, moved: 0 };
    });
    canvas.addEventListener('pointermove', ev => {
      if (!active() || !t || ev.pointerType !== 'touch') return;
      const dx = ev.clientX - t.x, dy = ev.clientY - t.y;
      t.moved += Math.abs(dx) + Math.abs(dy); t.x = ev.clientX; t.y = ev.clientY;
      desk.yaw -= dx * touchSens; desk.pitch -= dy * touchSens; clampPitch();
    });
    canvas.addEventListener('pointerup', ev => {
      if (ev.pointerType !== 'touch' || !t) return;
      if (t.moved < 12 && touch.onTap) touch.onTap();
      t = null;
    });
  }
  return desk;
}
