// Skill moves for beating your man. Pure (no three, no DOM).
//
// intent.skill = { move, side } on the frame it fires:
//   stepover  fake toward `side` (-1 left, 1 right of where you face) and burst off the other way
//   roulette  spin away from the man pressing you, ball shielded
//   nutmeg    knock it through the legs of a defender square in front of you and run round him
//   rainbow   flick it up over your head (and his) and run onto it
//
// A well-timed skill (a presser within reach) fools him: he stumbles or turns the wrong way and you
// get a moment free of tackles. Doing the same move again and again stops working: after SKILL.bite
// of one move within SKILL.memory seconds he reads it (other moves still fool him). Successful skills
// in one attack add up; score after two or more and it's JOGA BONITA.
import { dist, norm } from './vec.js';

export const SKILL = {
  reach: 4.2,               // a defender this close is the one you're beating
  bite: 2, memory: 4,       // the same move fools him this many times in a row (within memory s)
  points: { stepover: 150, roulette: 200, nutmeg: 400, rainbow: 300 },
  jogaPerSkill: 300,        // bonus per skill in an attack that ends in your goal (2+ skills)
  collect: 1.6, collectTime: 1.6,   // after a nutmeg or rainbow you gather it from a little further for a moment
  names: { stepover: 'STEP-OVER', roulette: 'ROULETTE', nutmeg: 'NUTMEG', rainbow: 'RAINBOW FLICK' },
};
export const MOVES = Object.keys(SKILL.points);

const defs = w => w.players.filter(p => p.role === 'def');
// a short forced burst of movement (the sim's moveYou applies it over your stick for t seconds)
const dash = (w, x, z, t) => { w.dash = { x, z, t }; };

// The defender you're taking on: the nearest one within reach, or null.
export function presserOf(w) {
  let best = null, bd = SKILL.reach;
  for (const d of defs(w)) { const dd = dist(d, w.you); if (dd < bd) { bd = dd; best = d; } }
  return best;
}

// Does he fall for it? Remembers your recent moves on w.brain.skillLog.
export function skillFools(w, move) {
  const log = (w.brain.skillLog = (w.brain.skillLog || []).filter(s => w.time - s.t < SKILL.memory));
  let same = 0;
  for (let i = log.length - 1; i >= 0 && log[i].move === move; i--) same++;
  log.push({ move, t: w.time });
  return same < SKILL.bite;
}

// Performs a skill. launch(w, player, velocity) kicks the ball loose (from the sim). Pushes a
// { type: 'skill', move, ok, read, by } event; ok means you beat your man.
export function performSkill(w, skill, ev, launch) {
  const you = w.you, b = w.ball, d = presserOf(w), move = skill.move;
  if (!MOVES.includes(move)) return;
  const f = norm(you.fx, you.fz), right = { x: -f.z, z: f.x };
  const fooled = skillFools(w, move);
  let ok = false;
  const beat = (stun, grace) => { if (d) d.stun = Math.max(d.stun, stun); w.dragGrace = Math.max(w.dragGrace, grace); ok = true; };

  if (move === 'stepover') {
    const side = skill.side || 1, go = { x: -side * right.x, z: -side * right.z };
    dash(w, go.x * 4.8 + f.x * 2.4, go.z * 4.8 + f.z * 2.4, 0.3);           // sell it, then cut the other way
    w.boostT = Math.max(w.boostT, 0.5);
    if (d && fooled) { d.x += side * right.x * 0.5; d.z += side * right.z * 0.5; beat(0.6, 0.55); }
  } else if (move === 'roulette') {
    const away = d ? norm(you.x - d.x, you.z - d.z) : { x: -f.x, z: -f.z };
    const dir = norm(away.x * 0.55 + f.x * 0.45, away.z * 0.55 + f.z * 0.45);
    dash(w, dir.x * 4.6, dir.z * 4.6, 0.38);
    if (d && fooled) beat(0.45, 0.85);
    else w.dragGrace = Math.max(w.dragGrace, 0.3);                           // you still shield it a moment
  } else if (move === 'nutmeg') {
    const square = d && dist(d, you) < 2.8 && ((d.x - you.x) * f.x + (d.z - you.z) * f.z) / Math.max(0.01, dist(d, you)) > 0.55;
    if (square && fooled) {
      const through = norm(d.x - b.x, d.z - b.z);
      launch(w, you, { vx: through.x * 7.5, vy: 0, vz: through.z * 7.5 });
      w.knockCD = 0.35; w.boostT = Math.max(w.boostT, 0.9); w.collectT = w.time;
      beat(1.1, 0);
    } else {
      // nobody square on, or he saw it coming: it's just a poke forward
      launch(w, you, { vx: f.x * 6, vy: 0, vz: f.z * 6 });
      w.knockCD = 0.3;
    }
  } else if (move === 'rainbow') {
    launch(w, you, { vx: f.x * 5.2, vy: 6.2, vz: f.z * 5.2 });
    w.knockCD = 0.55; w.boostT = Math.max(w.boostT, 1.0); w.collectT = w.time;
    if (d && fooled) beat(1.5, 0);                                         // he turns to watch it go over
  }
  if (ok) w.skills = (w.skills || 0) + 1;
  ev.push({ type: 'skill', move, ok, read: !!d && !fooled, by: 'you' });
}
