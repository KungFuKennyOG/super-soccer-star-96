// Cup runs. World Cup '96: 8 groups of 4 (pots by strength), top two go through, then knockouts.
// Champions Cup: 16 clubs, straight knockouts. You play every one of your matches as a comeback
// scenario; everyone else's results are simulated from team strength. Knockout losses spend an
// arcade continue (3 per cup) and you replay the tie; out of continues, you're out. Pure.
import { teamsFor, byId } from './teams.js';

export const STAGE_NAMES = { group: 'GROUP STAGE', r16: 'ROUND OF 16', qf: 'QUARTER-FINAL', sf: 'SEMI-FINAL', final: 'FINAL' };
export const KO = ['r16', 'qf', 'sf', 'final'];
export const CONTINUES = 3;
const MATCHDAYS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];

function shuffle(a, rnd) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

export function createCup(kind, user, rnd = Math.random) {
  const ids = teamsFor(kind).map(t => t.id);
  if (!ids.includes(user)) throw new Error(`${user} is not in the ${kind} cup`);
  const cup = { kind, user, continues: CONTINUES, stage: 'r16', matchday: 0, groups: [], rounds: {}, done: false, out: false, champion: null };
  if (kind === 'world') {
    cup.stage = 'group';
    // four pots of eight by strength, one team from each pot per group
    const sorted = shuffle(ids, rnd).sort((a, b) => byId(b).s - byId(a).s);
    const pots = [0, 1, 2, 3].map(p => shuffle(sorted.slice(p * 8, p * 8 + 8), rnd));
    for (let g = 0; g < 8; g++) {
      const teams = pots.map(p => p[g]);
      cup.groups.push({
        id: 'ABCDEFGH'[g], teams,
        fixtures: MATCHDAYS.flatMap((md, m) => md.map(([a, b]) => ({ md: m, a: teams[a], b: teams[b], ga: null, gb: null }))),
      });
    }
  } else {
    const order = shuffle(ids, rnd);
    cup.rounds.r16 = [0, 1, 2, 3, 4, 5, 6, 7].map(i => tie(order[i * 2], order[i * 2 + 1]));
  }
  return cup;
}

const tie = (a, b) => ({ a, b, ga: null, gb: null, winner: null, pens: false });

// A plausible score between two teams of strength sa and sb.
export function simScore(sa, sb, rnd = Math.random) {
  const mean = d => Math.min(3.2, Math.max(0.25, 1.25 + 0.35 * d));
  const poisson = l => { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= rnd(); } while (p > L); return k - 1; };
  return [poisson(mean(sa - sb)), poisson(mean(sb - sa))];
}

// Your next match: { stage, label, opp, group?, md? } or null when the cup is over.
export function currentFixture(cup) {
  if (cup.done) return null;
  if (cup.stage === 'group') {
    const g = userGroup(cup), f = g.fixtures.find(x => x.md === cup.matchday && (x.a === cup.user || x.b === cup.user));
    return { stage: 'group', label: `GROUP ${g.id} - GAME ${cup.matchday + 1}`, opp: f.a === cup.user ? f.b : f.a, group: g.id, md: cup.matchday };
  }
  const t = cup.rounds[cup.stage].find(x => x.a === cup.user || x.b === cup.user);
  return { stage: cup.stage, label: STAGE_NAMES[cup.stage], opp: t.a === cup.user ? t.b : t.a };
}

export const userGroup = cup => cup.groups.find(g => g.teams.includes(cup.user));

// The comeback you're dropped into for a fixture: start score, clock, and what you need.
// lengthMul stretches the clock (the match-length setting); the minute on the banner follows it.
export function scenarioFor(cup, fx, rnd = Math.random, lengthMul = 1) {
  const us = byId(cup.user).s, them = byId(fx.opp).s;
  const depth = fx.stage === 'group' ? 0 : KO.indexOf(fx.stage) + 1;
  // later rounds are harder through how they defend (rules/brain.js), so the deficit barely grows with
  // the round, and every goal you need comes with plenty of clock (you're the superstar)
  let deficit = 1;
  if (rnd() < 0.25 + 0.05 * depth + 0.06 * (them - us)) deficit++;
  deficit = Math.min(2, deficit);
  const theirs = deficit + (rnd() < 0.35 ? 1 : 0), ours = theirs - deficit;
  const clock = Math.round((85 + 45 * deficit) * lengthMul);
  const need = fx.stage === 'group' ? 'any' : 'win';
  const text = need === 'win' ? `${deficit} DOWN - SCORE ${deficit + 1} TO WIN` : `${deficit} DOWN - WIN FOR 3 PTS, DRAW FOR 1`;
  return { us: ours, them: theirs, clock, minute: Math.max(1, 90 - Math.round(clock / 6)), need, text, oppStrength: them };
}

// Group table, best first: points, then goal difference, goals for, then strength.
export function table(g) {
  const rows = Object.fromEntries(g.teams.map(t => [t, { id: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const f of g.fixtures) {
    if (f.ga === null) continue;
    const A = rows[f.a], B = rows[f.b];
    A.p++; B.p++; A.gf += f.ga; A.ga += f.gb; B.gf += f.gb; B.ga += f.ga;
    if (f.ga > f.gb) { A.w++; B.l++; A.pts += 3; } else if (f.ga < f.gb) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; }
  }
  return Object.values(rows).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || byId(y.id).s - byId(x.id).s);
}

// Record your result (your goals, theirs) and move the cup on.
// Returns { result: 'win' | 'draw' | 'loss', retry, out, champion, advanced }.
export function playUser(cup, us, them, rnd = Math.random) {
  const result = us > them ? 'win' : us < them ? 'loss' : 'draw';
  if (cup.stage === 'group') {
    const md = cup.matchday;
    for (const g of cup.groups) for (const f of g.fixtures) {
      if (f.md !== md) continue;
      if (f.a === cup.user) { f.ga = us; f.gb = them; } else if (f.b === cup.user) { f.ga = them; f.gb = us; } else [f.ga, f.gb] = simScore(byId(f.a).s, byId(f.b).s, rnd);
    }
    cup.matchday++;
    if (cup.matchday < 3) return { result, retry: false, out: false, champion: false, advanced: false };
    const tables = cup.groups.map(table);
    const through = tables.flatMap(t => [t[0].id, t[1].id]);
    const w = i => tables[i][0].id, r = i => tables[i][1].id;
    cup.rounds.r16 = [[0, 1], [2, 3], [4, 5], [6, 7], [1, 0], [3, 2], [5, 4], [7, 6]].map(([x, y]) => tie(w(x), r(y)));
    cup.stage = 'r16';
    if (!through.includes(cup.user)) { finishWithoutUser(cup, rnd); cup.out = true; return { result, retry: false, out: true, champion: false, advanced: false }; }
    return { result, retry: false, out: false, champion: false, advanced: true };
  }

  if (result !== 'win') {
    if (cup.continues > 0) { cup.continues--; return { result, retry: true, out: false, champion: false, advanced: false }; }
    const t = cup.rounds[cup.stage].find(x => x.a === cup.user || x.b === cup.user);
    t.ga = t.a === cup.user ? us : them; t.gb = t.a === cup.user ? them : us;
    t.winner = t.a === cup.user ? t.b : t.a;
    cup.out = true;
    finishWithoutUser(cup, rnd);
    return { result, retry: false, out: true, champion: false, advanced: false };
  }
  const t = cup.rounds[cup.stage].find(x => x.a === cup.user || x.b === cup.user);
  t.ga = t.a === cup.user ? us : them; t.gb = t.a === cup.user ? them : us; t.winner = cup.user;
  simRound(cup.rounds[cup.stage], rnd);
  const champion = advance(cup);
  return { result, retry: false, out: false, champion, advanced: true };
}

function simRound(round, rnd) {
  for (const t of round) {
    if (t.winner) continue;
    const sa = byId(t.a).s, sb = byId(t.b).s;
    [t.ga, t.gb] = simScore(sa, sb, rnd);
    if (t.ga === t.gb) { t.pens = true; t.winner = rnd() < 0.5 + 0.08 * (sa - sb) ? t.a : t.b; }
    else t.winner = t.ga > t.gb ? t.a : t.b;
  }
}

// Builds the next round from winners. Returns true when the final has just been decided by you.
function advance(cup) {
  const i = KO.indexOf(cup.stage);
  if (i === KO.length - 1) { cup.done = true; cup.champion = cup.rounds.final[0].winner; return cup.champion === cup.user; }
  const w = cup.rounds[cup.stage].map(t => t.winner);
  const next = KO[i + 1];
  cup.rounds[next] = [];
  for (let j = 0; j < w.length; j += 2) cup.rounds[next].push(tie(w[j], w[j + 1]));
  cup.stage = next;
  return false;
}

// Plays the rest of the cup out once you're gone, so the bracket shows who won.
function finishWithoutUser(cup, rnd) {
  while (!cup.done) { simRound(cup.rounds[cup.stage], rnd); advance(cup); }
}
