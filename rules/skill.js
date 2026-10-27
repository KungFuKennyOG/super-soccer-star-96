// Team stars on the pitch. A match's tuning comes from both teams' strength (1..5): the opponent's
// stars set how hard their defenders press and tackle and how good their keeper is; yours set how
// quick your teammates are, how often their passes are perfect, and a little of your own pace and
// shooting. Everything moves at most ±SPREAD (10%) between 1 and 5 stars, so a giant is tougher, not unbeatable.
import { AI, MOVE } from './tuning.js';

export const SPREAD = 0.1;
const f = s => (Math.max(1, Math.min(5, s)) - 3) / 2;       // 1 star → -1, 3 → 0, 5 → +1

export function tuneFor(home = 3, away = 3) {
  const h = f(home), a = f(away), k = SPREAD;
  return {
    home, away,
    ai: {
      ...AI,
      // their defence
      press: AI.press * (1 + k * a), mark: AI.mark * (1 + k * a), chase: AI.chase * (1 + k * a),
      tackleTime: AI.tackleTime * (1 - k * a), tackleRange: AI.tackleRange * (1 + 0.5 * k * a),
      interceptSlow: AI.interceptSlow * (1 + k * a), interceptFast: AI.interceptFast * (1 + k * a),
      dragStun: AI.dragStun * (1 - 0.5 * k * a + 0.5 * k * h),
      // their keeper
      gkReact: AI.gkReact * (1 - k * a), gkDive: AI.gkDive * (1 + k * a), gkReach: AI.gkReach * (1 + 0.6 * k * a),
      // your teammates
      mateRun: AI.mateRun * (1 + k * h), mateDribble: AI.mateDribble * (1 + k * h),
    },
    // you: half the spread, so it's a nudge rather than a different player
    move: {
      ...MOVE,
      run: MOVE.run * (1 + 0.5 * k * h), sprint: MOVE.sprint * (1 + 0.5 * k * h),
      dribble: MOVE.dribble * (1 + 0.5 * k * h), dribbleSprint: MOVE.dribbleSprint * (1 + 0.5 * k * h),
    },
    matePerfect: 0.7 + 0.15 * h,        // chance a teammate's pass back to you is perfect
    shotErr: -0.008 * h,                // radians added to your shot spread (negative = tighter)
    shotPower: 1 + 0.5 * k * h,         // your shot speed multiplier
  };
}
