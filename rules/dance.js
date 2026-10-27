// The goal celebration dance: a short rhythm game. Moves come one per beat after a two-beat count-in.
// Strike the pose on the beat: it counts when you move into it inside the window, so holding a pose
// early doesn't. Pure: the page feeds in the time and the pose it reads from the
// controllers (or arrow keys) every frame.

export const MOVES = ['left', 'right', 'up', 'out'];   // left hand up, right hand up, both up, arms out wide
export const DANCE = { bpm: 88, count: 6, leadBeats: 2, window: 0.25, perfect: 0.11, points: { perfect: 150, good: 75 }, fullCombo: 300 };

export const beatLen = () => 60 / DANCE.bpm;

// A fresh dance: times are seconds from the start of the music.
export function createDance(rnd = Math.random) {
  const moves = [];
  let last = null;
  for (let i = 0; i < DANCE.count; i++) {
    let m;
    do { m = MOVES[Math.floor(rnd() * MOVES.length)]; } while (m === last);
    last = m;
    moves.push({ move: m, t: (DANCE.leadBeats + i) * beatLen(), grade: null });
  }
  return { moves, next: 0, score: 0, hits: 0, done: false, prev: null, end: (DANCE.leadBeats + DANCE.count) * beatLen() + 0.3 };
}

// Advance to time t with the pose currently held (a MOVES entry or null).
// Returns judgements made this call: [{ i, move, grade: 'perfect' | 'good' | 'miss' }].
export function stepDance(d, t, pose) {
  const out = [], struck = pose && pose !== d.prev;
  d.prev = pose;
  while (d.next < d.moves.length) {
    const m = d.moves[d.next], off = t - m.t;
    if (off > DANCE.window) { m.grade = 'miss'; out.push({ i: d.next, move: m.move, grade: 'miss' }); d.next++; continue; }
    if (off >= -DANCE.window && struck && pose === m.move) {
      m.grade = Math.abs(off) <= DANCE.perfect ? 'perfect' : 'good';
      d.score += DANCE.points[m.grade]; d.hits++;
      out.push({ i: d.next, move: m.move, grade: m.grade });
      d.next++;
    }
    break;
  }
  if (!d.done && t >= d.end && d.next >= d.moves.length) {
    d.done = true;
    if (d.hits === d.moves.length) d.score += DANCE.fullCombo;
  }
  return out;
}

// Reads a pose from where the hands are, relative to the head (metres, y up, x to the player's right).
// left/right: { x, y } offsets of each hand from the head, or null if that controller is missing.
export function poseFromHands(left, right) {
  if (!left || !right) return null;
  const lUp = left.y > 0.08, rUp = right.y > 0.08;
  if (lUp && rUp) return 'up';
  if (lUp && right.y < -0.15) return 'left';
  if (rUp && left.y < -0.15) return 'right';
  const wide = left.x < -0.5 && right.x > 0.5;
  if (wide && left.y > -0.5 && right.y > -0.5 && left.y < 0.08 && right.y < 0.08) return 'out';
  return null;
}
