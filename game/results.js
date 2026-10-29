// What the full-time screens say: Score Attack, a cup match (and its shootout), a practice shootout
// and KEEPER RUSH. Returns lines for menus.open('message') and what happens next.
import { byId } from '../rules/teams.js';
import { STAGE_NAMES, playUser, needsPens, scenarioFor } from '../rules/cup.js';
import { tally } from '../rules/penalties.js';
import { sfx } from './audio.js';

const BEST_KEY = 'sss96.best';
export function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } }

const RED = '#ff4040', GREEN = '#40ff60', GOLD = '#f2c21a';

export function attackLines(match, best, newBest) {
  return [
    { text: `GOALS ${match.goals}`, big: true }, { text: `SHOTS ${match.shots}` },
    { text: `POINTS ${match.points}`, big: true, color: GOLD }, { text: newBest ? 'NEW BEST SCORE!' : `BEST ${best}`, color: newBest ? GREEN : '#9aa8e0' },
  ];
}

// res from playUser; pens: [yours, theirs] when it went to a shootout. Returns { lines, next } where
// next is 'ceremony' | 'retry' | 'hub'.
export function cupLines(cup, res, team, opp, us, them, fixtureStage, pens = null) {
  const score = { text: `${team.id} ${us} - ${them} ${opp.id}`, big: true };
  const lines = [score];
  if (pens) lines.push({ text: `${pens[0]}-${pens[1]} ON PENALTIES`, color: pens[0] > pens[1] ? GREEN : RED });
  if (res.champion) return { lines: [...lines, { text: 'YOU WIN THE CUP!', big: true, color: GOLD }, { text: `${team.name} ARE CHAMPIONS` }], next: 'ceremony' };
  if (res.retry) {
    const why = pens ? 'OUT ON PENALTIES!' : res.result === 'draw' ? 'NOT ENOUGH - YOU NEEDED THE WIN' : 'BEATEN!';
    return { lines: [...lines, { text: why, color: RED }, { text: 'CONTINUE?', big: true, color: GOLD }, { text: `${cup.continues} CONTINUE${cup.continues === 1 ? '' : 'S'} LEFT` }], next: 'retry' };
  }
  if (res.out) return { lines: [...lines, { text: 'KNOCKED OUT', big: true, color: RED }, { text: `CHAMPIONS: ${byId(cup.champion).name}` }], next: 'hub' };
  const what = fixtureStage === 'group'
    ? { win: 'WIN - 3 POINTS', draw: 'DRAW - 1 POINT', loss: 'DEFEAT - NO POINTS' }[res.result]
    : `THROUGH TO THE ${STAGE_NAMES[cup.stage]}`;
  lines.push({ text: what, big: true, color: res.result === 'loss' ? RED : GREEN });
  if (res.advanced && fixtureStage === 'group') lines.push({ text: `THROUGH TO THE ${STAGE_NAMES[cup.stage]}`, color: GOLD });
  return { lines, next: 'hub' };
}

export function shootoutLines(won, score, team, opp, saves) {
  return [
    { text: `${team.id} ${score[0]} - ${score[1]} ${opp.id}`, big: true },
    { text: won ? 'YOU WIN THE SHOOTOUT!' : 'THEY WIN THE SHOOTOUT', big: true, color: won ? GREEN : RED },
    { text: `SAVES ${saves}` },
  ];
}

export function rushLines(rush, best, newBest) {
  return [
    { text: `SAVES ${rush.saves}`, big: true }, { text: `POINTS ${rush.points}`, big: true, color: GOLD },
    { text: newBest ? 'NEW BEST!' : `BEST ${best}`, color: newBest ? GREEN : '#9aa8e0' },
  ];
}

// c: what main.js shares (see the call there)
export function createResults(c) {
  let best = loadBest();
  function keepingOver(e) {
    const so = c.keeping.shootout, rush = c.keeping.rush;
    c.setMenu();
    if (rush) {
      const top = c.tracker.rushBest(rush.points);
      c.commentary.event({ type: 'rushOver' });
      return setTimeout(() => c.message('KEEPER RUSH', rushLines(rush, c.tracker.progress.rushBest, top), () => c.openMenu('mode'), 'PRESS A FOR THE MENU'), 1200);
    }
    const score = tally(so).score, won = e.won;
    c.commentary.event({ type: won ? 'shootoutWon' : 'shootoutLost' });
    if (won) { c.stadium.cheer(true); sfx('roar'); }
    if (c.game.cupPens) { const [us, them] = c.game.cupPens; c.game.cupPens = null; return setTimeout(() => cupResult(us, them, score), 1800); }
    setTimeout(() => c.message('PENALTIES', shootoutLines(won, score, c.game.team, c.game.opp, so.saves), () => c.openMenu('mode'), 'PRESS A FOR THE MENU'), 1800);
  }

  function fullTime() {
    c.commentary.event({ type: 'fulltime' });
    c.replay.stop();
    sfx('whistle', 1); setTimeout(() => sfx('whistle', 1), 450); setTimeout(() => sfx('whistle', 2), 900);
    c.stadium.cheer(false);
    if (!c.game.cup) {
      const match = c.match(), newBest = match.points > best;
      if (newBest) { best = match.points; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} }
      c.showBest(best);
      c.tracker.set({ points: match.points });
      c.hud.banner({ text: 'FULL TIME', sub: newBest ? 'NEW BEST SCORE!' : '', tone: 'good', big: true });
      return setTimeout(() => c.message('FULL TIME', attackLines(match, best, newBest), () => c.openMenu('mode'), 'PRESS A FOR THE MENU'), 1800);
    }
    const match = c.match(), us = match.us, them = match.them;
    if (needsPens(c.game.cup, us, them)) {
      c.hud.banner({ text: 'FULL TIME', sub: `${us} - ${them}\nIT GOES TO PENALTIES!`, tone: 'info', big: true });
      c.game.cupPens = [us, them];
      return setTimeout(() => { if (c.mode() === 'menu' && c.game.cupPens) c.startKeeping('pens', false); }, 2600);
    }
    c.hud.banner({ text: 'FULL TIME', sub: `${us} - ${them}`, tone: us < them ? 'bad' : 'good', big: true });
    setTimeout(() => cupResult(us, them, null), 1800);
  }

  // pens: the shootout score when a level knockout went to penalties
  function cupResult(us, them, pens) {
    const cup = c.game.cup, stage = c.game.fixture.stage;
    const res = playUser(cup, us, them, Math.random, pens ? (pens[0] > pens[1] ? 'won' : 'lost') : null);
    if (res.champion) c.tracker.set({ cupWon: cup.kind });
    const r = cupLines(cup, res, c.game.team, c.game.opp, us, them, stage, pens);
    const next = r.next === 'ceremony' ? c.startCeremony
      : r.next === 'retry' ? () => { c.game.scenario = scenarioFor(cup, c.game.fixture, Math.random, c.lengthMul()); c.startMatch(); }
      : () => c.openMenu('hub', { cup });
    c.message('FULL TIME', r.lines, next, r.next === 'ceremony' ? 'PRESS A TO LIFT THE CUP' : r.next === 'retry' ? 'PRESS A TO TRY AGAIN' : 'PRESS A');
  }

  function finishTraining() {
    c.setMenu(); c.stadium.cheer(true); sfx('roar'); c.tracker.set({ training: true });
    setTimeout(() => c.message('TRAINING COMPLETE', [
      { text: 'EVERY MOVE DONE!', big: true, color: '#40ff60' }, { text: `GOALS ${c.match().goals}` },
      { text: 'NOW GO WIN SOMETHING', color: '#f2c21a' },
    ], () => c.openMenu('mode'), 'PRESS A FOR THE MENU'), 1200);
  }
  return { fullTime, keepingOver, finishTraining };
}
