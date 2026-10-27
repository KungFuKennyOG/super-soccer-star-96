// The arcade layer: a two-minute clock, points, and the banner every event shows. Pure.
import { MATCH, GOAL } from './tuning.js';
import { GRADES } from './pass.js';

export function createMatch(duration = MATCH.duration) {
  return { clock: duration, points: 0, goals: 0, shots: 0, phase: 'play', deadT: 0, over: false, best: null };
}

// A goal that hits the top corner.
export const isTopBins = e => e.y > 1.55 && Math.abs(e.x) > GOAL.halfW - 1.4;

// Scores one sim event. Returns a banner { text, sub, tone, big } or null. tone: 'good' | 'bad' | 'info'.
export function scoreEvent(m, e) {
  switch (e.type) {
    case 'kick': if (e.by === 'you') m.shots++; return null;
    case 'goal': {
      m.goals++;
      const bonus = [];
      let pts = 1000;
      if (isTopBins(e)) { pts += 750; bonus.push('TOP BINS +750'); }
      if (e.dist >= 24) { pts += 500; bonus.push('WORLDIE +500'); }
      if (e.assist && e.assist.from !== e.by) { pts += 300; bonus.push(e.by === 'you' ? 'ONE-TWO +300' : 'ASSIST +300'); }
      if (e.chain > 1) { pts += e.chain * 100; bonus.push(`PASS CHAIN x${e.chain} +${e.chain * 100}`); }
      m.points += pts;
      const text = isTopBins(e) ? 'TOP BINS!' : 'GOAL!';
      return { text, sub: bonus.join('\n') || `+${pts}`, tone: 'good', big: true };
    }
    case 'saved': return { text: 'SAVED', sub: 'keeper holds it', tone: 'bad' };
    case 'parried': return { text: 'PARRIED!', sub: 'loose ball', tone: 'info' };
    case 'blocked': return { text: 'BLOCKED', sub: 'loose ball', tone: 'info' };
    case 'post': return { text: e.bar ? 'OFF THE BAR!' : 'OFF THE POST!', sub: '', tone: 'info' };
    case 'out':
      if (e.where === 'byline') return { text: e.high ? 'OVER THE BAR' : 'WIDE', sub: '', tone: 'bad' };
      return { text: e.where === 'cleared' ? 'CLEARED' : 'OUT OF PLAY', sub: '', tone: 'bad' };
    case 'tackled': return { text: 'TACKLED', sub: 'they win it back', tone: 'bad' };
    case 'intercepted': return { text: 'INTERCEPTED', sub: 'read that pass', tone: 'bad' };
    case 'pass': {
      if (e.by !== 'you') return null;
      m.points += GRADES[e.grade].points;
      if (e.grade === 'perfect') return { text: 'PERFECT', sub: `+${GRADES.perfect.points}`, tone: 'good' };
      if (e.grade === 'miss') return { text: 'SCUFFED IT', sub: '', tone: 'bad' };
      return null;
    }
    default: return null;
  }
}

// Advances the clock while the ball is live. Returns 'reset' when a dead ball has waited long enough,
// 'over' once time is up, or null.
export function tickMatch(m, dt, worldDead, shotInFlight) {
  if (m.over) return null;
  if (worldDead) {
    m.deadT += dt;
    if (m.deadT >= MATCH.deadTime) {
      m.deadT = 0;
      if (m.clock <= 0) { m.over = true; return 'over'; }
      return 'reset';
    }
    return null;
  }
  m.deadT = 0;
  m.clock = Math.max(0, m.clock - dt);
  if (m.clock <= 0 && !shotInFlight) { m.over = true; return 'over'; }
  return null;
}

export const clockText = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
