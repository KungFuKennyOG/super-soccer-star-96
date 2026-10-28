// The arcade layer: a two-minute clock, points, and the banner every event shows. Pure.
import { MATCH, GOAL } from './tuning.js';
import { GRADES } from './pass.js';
import { SKILL } from './skills.js';

export function createMatch(duration = MATCH.duration) {
  return { clock: duration, points: 0, goals: 0, yourGoals: 0, shots: 0, phase: 'play', deadT: 0, over: false, best: null };
}

// A cup match: you start behind (scenario from rules/cup.js) and the clock is short. Your team's goals
// count toward `us`; the opponent can score on the counter when you give the ball away.
export function createScenarioMatch(scn) {
  return { ...createMatch(scn.clock), us: scn.us, them: scn.them, scenario: scn };
}

// Chance the opponent scores on the break after you lose the ball, by their strength (1..5).
export const counterChance = s => 0.06 + 0.035 * s;

// Call on a turnover in a cup match. Returns true when they score from it.
export function counterAttack(m, rnd = Math.random) {
  if (!m.scenario || rnd() >= counterChance(m.scenario.oppStrength)) return false;
  m.them++;
  return true;
}

// A goal that hits the top corner.
export const isTopBins = e => e.y > 1.55 && Math.abs(e.x) > GOAL.halfW - 1.4;

// Your third goal (and sixth, ninth...) is a hat trick. Call after scoreEvent has counted the goal.
export const isHatTrick = (m, e) => e.type === 'goal' && e.by === 'you' && m.yourGoals > 0 && m.yourGoals % 3 === 0;

// Goals from the air are worth more: headers, volleys, and the bicycle kick most of all.
export const KIND_BONUS = { header: { name: 'HEADER', pts: 500 }, volley: { name: 'VOLLEY', pts: 600 }, bicycle: { name: 'BICYCLE KICK', pts: 1500 }, chip: { name: 'CHIP', pts: 400 } };

// Scores one sim event. Returns a banner { text, sub, tone, big } or null. tone: 'good' | 'bad' | 'info'.
export function scoreEvent(m, e) {
  switch (e.type) {
    case 'kick': if (e.by === 'you') m.shots++; return null;
    case 'goal': {
      m.goals++;
      if (e.by === 'you') m.yourGoals++;
      if (m.scenario) m.us++;
      const bonus = [];
      let pts = 1000;
      if (isTopBins(e)) { pts += 750; bonus.push('TOP BINS +750'); }
      if (e.dist >= 24) { pts += 500; bonus.push('WORLDIE +500'); }
      if (e.assist && e.assist.from !== e.by) { pts += 300; bonus.push(e.by === 'you' ? 'ONE-TWO +300' : 'ASSIST +300'); }
      if (e.chain > 1) { pts += e.chain * 100; bonus.push(`PASS CHAIN x${e.chain} +${e.chain * 100}`); }
      if (e.skills >= 2) { const j = e.skills * SKILL.jogaPerSkill; pts += j; bonus.push(`JOGA BONITA x${e.skills} +${j}`); }
      const k = KIND_BONUS[e.kind];
      if (k) { pts += k.pts; bonus.push(`${k.name} +${k.pts}`); }
      m.points += pts;
      const text = isHatTrick(m, e) ? 'HAT TRICK!' : k ? `${k.name}!` : e.skills >= 2 ? 'JOGA BONITA!' : isTopBins(e) ? 'TOP BINS!' : 'GOAL!';
      const sub = (m.scenario ? `${m.us} - ${m.them}\n` : '') + (bonus.join('\n') || `+${pts}`);
      return { text, sub, tone: 'good', big: true };
    }
    case 'saved': return e.claim ? { text: 'CLAIMED', sub: 'keeper came out for it', tone: 'bad' } : { text: 'SAVED', sub: 'keeper holds it', tone: 'bad' };
    case 'parried': return { text: 'PARRIED!', sub: 'loose ball', tone: 'info' };
    case 'blocked': return { text: 'BLOCKED', sub: 'loose ball', tone: 'info' };
    case 'post': return { text: e.bar ? 'OFF THE BAR!' : 'OFF THE POST!', sub: '', tone: 'info' };
    case 'out':
      if (e.where === 'byline') return { text: e.high ? 'OVER THE BAR' : 'WIDE', sub: '', tone: 'bad' };
      return { text: e.where === 'cleared' ? 'CLEARED' : 'OUT OF PLAY', sub: '', tone: 'bad' };
    case 'tackled': return { text: 'TACKLED', sub: 'they win it back', tone: 'bad' };
    case 'intercepted': return { text: 'INTERCEPTED', sub: 'read that pass', tone: 'bad' };
    case 'drag': return e.read ? { text: 'NOT AGAIN', sub: 'he read the drag-back', tone: 'bad' } : null;
    case 'skill': {
      if (e.read) return { text: 'NOT AGAIN', sub: `he read the ${SKILL.names[e.move].toLowerCase()}`, tone: 'bad' };
      if (!e.ok) return null;
      m.points += SKILL.points[e.move];
      // the flashy ones get a banner; step-overs and roulettes just get the crowd's OLE
      return e.move === 'nutmeg' || e.move === 'rainbow' ? { text: `${SKILL.names[e.move]}!`, sub: `+${SKILL.points[e.move]}`, tone: 'good' } : null;
    }
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
