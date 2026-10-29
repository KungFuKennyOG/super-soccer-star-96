// Ball flight, rolling, bounces, the goal frame and the net. Pure: no three.
import { BALL, GOAL, PITCH } from './tuning.js';

export function makeBall(x = 0, z = 0) {
  return { x, y: BALL.r, z, vx: 0, vy: 0, vz: 0, curl: 0, inNet: false, spin: 0 };
}

const PLAIN = { fric: 1, drag: 1, bounce: 1 };
export const ballSpeed =b => Math.hypot(b.vx, b.vy, b.vz);
export const groundSpeed = b => Math.hypot(b.vx, b.vz);

// Advances a loose ball by dt. Pushes { type, ... } into events:
// goal {x, y, speed}, post {bar}, out {where: 'byline' | 'side' | 'cleared', high}.
// b.surface (rules/weather.js) scales rolling friction, drag and bounce: { fric, drag, bounce } or null.
export function stepBall(b, dt, events = []) {
  const r = BALL.r, px = b.x, py = b.y, pz = b.z, sf = b.surface || PLAIN;
  const airborne = b.y > r + 1e-3 || b.vy > 0;

  if (airborne) {
    b.vy -= BALL.g * dt;
    if (b.curl) {
      const h = groundSpeed(b);
      if (h > 0.5) { b.vx += -b.vz / h * b.curl * dt; b.vz += b.vx / h * b.curl * dt; }
      b.curl *= Math.exp(-BALL.curlDecay * dt);
    }
  } else {
    const h = groundSpeed(b);
    const nh = Math.max(0, h - (BALL.rollFric * sf.fric + BALL.rollDrag * sf.drag * h) * dt);
    if (h > 1e-6) { b.vx *= nh / h; b.vz *= nh / h; }
    b.curl = 0;
  }

  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.spin += groundSpeed(b) / r * dt;

  if (b.y < r) {
    b.y = r;
    if (b.vy < -1.2) { b.vy = -b.vy * BALL.bounce * sf.bounce; const k = sf.fric < 1 ? 0.94 : sf.fric > 1 ? 0.8 : 0.88; b.vx *= k; b.vz *= k; }
    else b.vy = 0;
  }

  if (b.inNet) { netStop(b); return events; }

  // crossing the goal line this step
  if (pz >= GOAL.z && b.z < GOAL.z) {
    const t = (pz - GOAL.z) / (pz - b.z);
    const cx = px + (b.x - px) * t, cy = py + (b.y - py) * t;
    const reach = r + GOAL.post;
    if (Math.abs(cy - GOAL.h) < reach && Math.abs(cx) < GOAL.halfW + GOAL.post) {
      bounceOffFrame(b, cy > GOAL.h ? 1 : -1, 0);
      events.push({ type: 'post', bar: true, x: cx, y: cy });
    } else if (cy < GOAL.h && Math.abs(Math.abs(cx) - GOAL.halfW) < reach) {
      bounceOffFrame(b, 0, Math.abs(cx) > GOAL.halfW ? Math.sign(cx) : -Math.sign(cx));
      events.push({ type: 'post', bar: false, x: cx, y: cy });
    } else if (cy < GOAL.h && Math.abs(cx) < GOAL.halfW) {
      b.inNet = true;
      events.push({ type: 'goal', x: cx, y: cy, speed: Math.hypot(b.vx, b.vy, b.vz) });
      netStop(b);
    } else {
      events.push({ type: 'out', where: 'byline', high: cy >= GOAL.h, x: cx, y: cy });
    }
    return events;
  }
  if (Math.abs(b.x) > PITCH.halfW) events.push({ type: 'out', where: 'side' });
  else if (b.z > PITCH.halfwayZ + 0.5) events.push({ type: 'out', where: 'cleared' });
  return events;
}

// ys: +1 / -1 pushes up or down off the bar; xs pushes sideways off a post
function bounceOffFrame(b, ys, xs) {
  b.z = GOAL.z + 0.02;
  b.vz = Math.abs(b.vz) * 0.55;
  if (ys) b.vy = ys * (Math.abs(b.vy) * 0.5 + 1.5);
  if (xs) b.vx = xs * (Math.abs(b.vx) * 0.5 + 1.2);
}

// keeps a scored ball inside the net, soaking up its speed
function netStop(b) {
  const back = GOAL.z - GOAL.depth + BALL.r, side = GOAL.halfW - BALL.r, top = GOAL.h - BALL.r;
  if (b.z < back) { b.z = back; b.vz = Math.abs(b.vz) * 0.12; b.vx *= 0.4; b.vy *= 0.4; }
  if (Math.abs(b.x) > side) { b.x = Math.sign(b.x) * side; b.vx *= -0.2; }
  if (b.y > top) { b.y = top; b.vy = -Math.abs(b.vy) * 0.2; }
  if (b.z > GOAL.z - BALL.r) { b.z = GOAL.z - BALL.r; b.vz = -Math.abs(b.vz) * 0.2; }
}

// Where a loose ball will pass the plane z = zp (heading toward goal), within maxT: { x, y, t } or null.
// Used for a keeper who has come off his line: what height is it when it reaches him?
export function predictPlane(b, zp, maxT = 2.5, dt = 1 / 120) {
  const c = { ...b, inNet: false };
  if (c.z <= zp) return null;
  for (let t = 0; t < maxT; t += dt) {
    const pz = c.z, py = c.y, px = c.x;
    stepBall(c, dt, []);
    if (c.z <= zp) { const k = (pz - zp) / ((pz - c.z) || 1); return { x: px + (c.x - px) * k, y: py + (c.y - py) * k, t: t + dt * k }; }
    if (groundSpeed(c) < 0.3 && c.y <= BALL.r + 1e-3) return null;
  }
  return null;
}

// Where a loose ball will cross the goal line, if it does within maxT seconds: { x, y, t } or null.
export function predictCross(b, maxT = 2.5, dt = 1 / 120) {
  const c = { ...b, inNet: false };
  for (let t = 0; t < maxT; t += dt) {
    const ev = stepBall(c, dt, []);
    for (const e of ev) {
      if (e.type === 'goal' || e.type === 'post') return { x: e.x, y: e.y, t: t + dt, onTarget: true };
      if (e.type === 'out') return e.where === 'byline' ? { x: e.x, y: e.y, t: t + dt, onTarget: false } : null;
    }
    if (groundSpeed(c) < 0.3 && c.y <= BALL.r + 1e-3) return null;
  }
  return null;
}
