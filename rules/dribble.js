// Dribbling touches and the run cycle they're timed to. Pure (no three, no DOM).
//
// Every player has a stride phase (p.stride, radians, always growing): the sim advances it and the page
// draws the legs from it, so a touch in the sim is a boot on the ball on screen. The carrier's right boot
// taps the ball on once a cycle; in between the ball runs ahead and he catches it up.
import { DRIBBLE, STRIKE, BALL } from './tuning.js';

const TAU = Math.PI * 2;

// How fast the run cycle turns over at a ground speed (rad/s).
export const strideRate = speed => DRIBBLE.rate[0] + speed * DRIBBLE.rate[1];

// How far through the gap between two touches the cycle is: 0 on the touch, toward 1 just before the next.
export function sinceTouch(stride) {
  const u = ((stride - DRIBBLE.touchAt) / TAU) % 1;
  return u < 0 ? u + 1 : u;
}

// How far ahead of the carrier the ball is (m): tapped on from `near`, out and back before the next touch.
// The push shrinks at low speed; standing still the ball rests at `near`.
export function dribbleLead(stride, speed) {
  const u = sinceTouch(stride), k = Math.min(1, speed / DRIBBLE.full);
  return DRIBBLE.near + DRIBBLE.push * k * 4 * u * (1 - u);
}

// Did the cycle pass a touch between two phases (a → b, b >= a)?
export function touched(a, b) {
  return Math.floor((b - DRIBBLE.touchAt) / TAU) > Math.floor((a - DRIBBLE.touchAt) / TAU);
}

// Every step: everyone's run cycle turns over with their speed. Yours reports each touch on the ball as a
// 'dribble' event (not while a strike is winding up: that boot is busy). w: the sim world (rules/sim.js).
export function strides(w, dt, ev) {
  for (const p of w.players) {
    const s = Math.hypot(p.vx, p.vz), was = p.stride;
    p.stride += dt * strideRate(s);
    if (p.role === 'you' && w.owner === 'you' && !w.dead && !w.wind && s > 1.5 && touched(was, p.stride)) ev.push({ type: 'dribble', by: 'you' });
  }
}

// Every step someone has the ball: it's at his feet. The way it points from him eases round when he turns
// or first takes it (w.carry remembers that); how far ahead it is follows his stride exactly, so the boot
// meets it. The keeper smothers it instead.
export function carry(w, dt) {
  const p = w.byId[w.owner], b = w.ball;
  if (p.role === 'gk') { b.x = p.x; b.z = p.z + 0.35; b.y = Math.max(BALL.r, b.y - 2 * dt); b.vx = b.vy = b.vz = 0; w.carry = null; return; } // settles to the grass
  const s = Math.hypot(p.vx, p.vz);
  const d = s > 0.6 ? { x: p.vx / s, z: p.vz / s } : { x: p.fx, z: p.fz };
  let lead = dribbleLead(p.stride, s);
  // winding up a strike (w.wind): you catch the ball up so it's there to be hit
  if (w.wind && p.role === 'you') lead = STRIKE.lead + (w.wind.lead0 - STRIKE.lead) * Math.max(0, w.wind.t / (w.wind.T || 1));
  let c = w.carry;
  if (!c || c.id !== p.id) c = w.carry = { id: p.id, ox: (b.x - p.x) / lead, oz: (b.z - p.z) / lead, lead };   // just taken: start from where the ball is
  const k = Math.min(1, 20 * dt), px = b.x, pz = b.z;
  c.ox += (d.x - c.ox) * k; c.oz += (d.z - c.oz) * k; c.lead = lead;
  b.x = p.x + c.ox * lead; b.z = p.z + c.oz * lead;
  b.y = BALL.r; b.vy = 0;
  if (dt > 0) { b.vx = (b.x - px) / dt; b.vz = (b.z - pz) / dt; }
  b.spin += s / BALL.r * dt;
}
