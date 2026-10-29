// Your progress across sessions (localStorage): challenges done, and the KEEPER RUSH best. Tracks the
// current match's stats (rules/challenges.js) and pops a banner for each challenge you complete, a
// moment after whatever banner the event itself showed.
import { createProgress, createStats, noteEvents, checkChallenges } from '../rules/challenges.js';
import { sfx } from './audio.js';

const KEY = 'sss96.progress';

function load() {
  try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); return p && p.done ? p : { ...createProgress(), rushBest: 0 }; } catch (e) { return { ...createProgress(), rushBest: 0 }; }
}

export function createTracker(hud) {
  const progress = load();
  let stats = createStats(), queue = [], wait = 0;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) {} };
  function check() {
    const fresh = checkChallenges(progress, stats);
    if (!fresh.length) return;
    save();
    for (const c of fresh) queue.push(c);
    wait = Math.max(wait, 2.6);
  }
  return {
    progress,
    get stats() { return stats; },
    // a new match / shootout / rush: mode is game.kind, stars your team's
    begin(mode, stars) { stats = createStats(mode, stars); },
    note(ev) { if (ev.length) { noteEvents(stats, ev); check(); } },
    // end-of-match flags: { points, cupWon, combo, training }
    set(flags) { Object.assign(stats, flags); check(); },
    rushBest(points) { const best = points > (progress.rushBest || 0); if (best) { progress.rushBest = points; save(); } return best; },
    get pending() { return queue.length; },
    update(dt) {
      wait = Math.max(0, wait - dt);
      if (wait > 0 || !queue.length) return;
      const c = queue.shift();
      hud.banner({ text: 'CHALLENGE DONE!', sub: `${c.name}\n${c.unlock ? `UNLOCKED ${c.unlock}` : c.desc}`, tone: 'good', big: true });
      sfx('perfect');
      wait = 2.6;
    },
  };
}
