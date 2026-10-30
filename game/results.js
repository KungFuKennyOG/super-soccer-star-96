// What the full-time screens say (Score Attack, a cup match, training done) and what happens next.
import { byId } from '../rules/teams.js';
import { STAGE_NAMES, playUser, scenarioFor } from '../rules/cup.js';
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

// res from playUser. Returns { lines, next } where next is 'ceremony' | 'retry' | 'hub'.
export function cupLines(cup, res, team, opp, us, them, fixtureStage) {
  const lines = [{ text: `${team.id} ${us} - ${them} ${opp.id}`, big: true }];
  if (res.champion) return { lines: [...lines, { text: 'YOU WIN THE CUP!', big: true, color: GOLD }, { text: `${team.name} ARE CHAMPIONS` }], next: 'ceremony' };
  if (res.retry) {
    const why = res.result === 'draw' ? 'NOT ENOUGH - YOU NEEDED THE WIN' : 'BEATEN!';
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

// c: what main.js shares (see the call there)
export function createResults(c) {
  let best = loadBest();
  function fullTime() {
    c.commentary.event({ type: 'fulltime' });
    c.replay.stop();
    sfx('whistle', 1); setTimeout(() => sfx('whistle', 1), 450); setTimeout(() => sfx('whistle', 2), 900);
    c.stadium.cheer(false);
    if (!c.game.cup) {
      const match = c.match(), newBest = match.points > best;
      if (newBest) { best = match.points; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} }
      c.showBest(best);
      c.hud.banner({ text: 'FULL TIME', sub: newBest ? 'NEW BEST SCORE!' : '', tone: 'good', big: true });
      return setTimeout(() => c.message('FULL TIME', attackLines(match, best, newBest), () => c.openMenu('mode'), 'PRESS A FOR THE MENU'), 1800);
    }
    const match = c.match(), us = match.us, them = match.them;
    c.hud.banner({ text: 'FULL TIME', sub: `${us} - ${them}`, tone: us < them ? 'bad' : 'good', big: true });
    setTimeout(() => cupResult(us, them), 1800);
  }

  function cupResult(us, them) {
    const cup = c.game.cup, stage = c.game.fixture.stage;
    const res = playUser(cup, us, them);
    const r = cupLines(cup, res, c.game.team, c.game.opp, us, them, stage);
    const next = r.next === 'ceremony' ? c.startCeremony
      : r.next === 'retry' ? () => { c.game.scenario = scenarioFor(cup, c.game.fixture, Math.random, c.lengthMul()); c.startMatch(); }
      : () => c.openMenu('hub', { cup });
    c.message('FULL TIME', r.lines, next, r.next === 'ceremony' ? 'PRESS A TO LIFT THE CUP' : r.next === 'retry' ? 'PRESS A TO TRY AGAIN' : 'PRESS A');
  }

  function finishTraining() {
    c.setMenu(); c.stadium.cheer(true); sfx('roar');
    setTimeout(() => c.message('TRAINING COMPLETE', [
      { text: 'EVERY MOVE DONE!', big: true, color: '#40ff60' }, { text: `GOALS ${c.match().goals}` },
      { text: 'NOW GO WIN SOMETHING', color: '#f2c21a' },
    ], () => c.openMenu('mode'), 'PRESS A FOR THE MENU'), 1200);
  }
  return { fullTime, finishTraining };
}
