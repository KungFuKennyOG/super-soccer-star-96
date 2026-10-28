// Skill gestures with your right hand. Pure: feed it the hand's position relative to your head, in
// your body's frame (x right, y up, z forward), and it says when a sharp flick or a quick circle
// happened. Only sharp, deliberate moves count (much faster than raising a hand to call for the ball
// or your arm moving as you play), and only while the game arms it (you on the ball, a defender near).
//
//   flick sideways        stepover (side = which way you flicked)
//   quick circle          roulette
//   jab forward and down  nutmeg
//   flick upward          rainbow
export const GESTURE = {
  window: 0.09,          // seconds the flick speed is measured over
  speed: 1.9,            // m/s the hand must move to count as a flick
  travel: 0.11,          // and at least this far within FLICK_SPAN
  span: 0.16,
  circleSpan: 0.6,       // a circle must close within this long
  circleTurn: 1.6 * Math.PI, circleRadius: 0.05, circleSpeed: 0.9,
  cooldown: 0.6,
  keep: 0.7,             // seconds of history kept
};

export function createGestures() {
  const hist = [];
  let cool = 0;
  const at = (t0, now) => { for (let i = hist.length - 1; i >= 0; i--) if (now - hist[i].t >= t0) return hist[i]; return null; };

  function circle(now) {
    const pts = hist.filter(h => now - h.t <= GESTURE.circleSpan);
    if (pts.length < 8) return false;
    const len = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y, p.z - pts[i].z), 0);
    if (len / Math.max(0.05, pts[pts.length - 1].t - pts[0].t) < GESTURE.circleSpeed) return false;
    // look for a full turn in the plane in front of you (x, y) or flat (x, z)
    for (const [a, b] of [['x', 'y'], ['x', 'z']]) {
      const ca = pts.reduce((s, p) => s + p[a], 0) / pts.length, cb = pts.reduce((s, p) => s + p[b], 0) / pts.length;
      let turn = 0, r = 0;
      for (let i = 1; i < pts.length; i++) {
        const a0 = Math.atan2(pts[i - 1][b] - cb, pts[i - 1][a] - ca), a1 = Math.atan2(pts[i][b] - cb, pts[i][a] - ca);
        turn += Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
        r += Math.hypot(pts[i][a] - ca, pts[i][b] - cb);
      }
      if (Math.abs(turn) > GESTURE.circleTurn && r / (pts.length - 1) > GESTURE.circleRadius) return true;
    }
    return false;
  }

  return {
    reset() { hist.length = 0; cool = 0; },
    // p: { x, y, z } hand relative to head in your body's frame; armed: is a skill possible right now.
    // Returns { move, side } on the frame a gesture completes, else null.
    update(p, now, dt, armed) {
      cool = Math.max(0, cool - dt);
      hist.push({ x: p.x, y: p.y, z: p.z, t: now });
      while (hist.length && now - hist[0].t > GESTURE.keep) hist.shift();
      if (!armed || cool > 0) return null;
      if (circle(now)) { cool = GESTURE.cooldown; hist.length = 0; return { move: 'roulette', side: 0 }; }
      const a = at(GESTURE.window, now), b = at(GESTURE.span, now);
      if (!a || !b) return null;
      const dtw = now - a.t, vx = (p.x - a.x) / dtw, vy = (p.y - a.y) / dtw, vz = (p.z - a.z) / dtw;
      const speed = Math.hypot(vx, vy, vz);
      if (speed < GESTURE.speed || Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) < GESTURE.travel) return null;
      let move = null, side = 0;
      if (vy > 0.7 * speed) move = 'rainbow';
      else if (Math.abs(vx) > 0.7 * speed) { move = 'stepover'; side = Math.sign(vx); }
      else if (vz > 0.45 * speed && vy < -0.25 * speed) move = 'nutmeg';
      else if (vy < -0.8 * speed) move = 'nutmeg';               // a straight jab down at the ball works too
      if (!move) return null;
      cool = GESTURE.cooldown; hist.length = 0;
      return { move, side };
    },
  };
}
