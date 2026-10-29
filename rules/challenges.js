// Challenges and the locker. Pure. Each match (or shootout, or keeper rush) keeps a stats object;
// sim events go in through noteEvents and the page sets the end-of-match flags. checkChallenges
// marks newly met challenges done and returns them; some unlock a cosmetic in the locker.
import { isTopBins } from './match.js';

// The locker: what you can change in SETTINGS once it's unlocked. Option 0 is always yours.
export const LOCKER = {
  ball: { name: 'BALL', options: ['CLASSIC', 'STAR', 'RETRO', 'GOLD'] },
  boots: { name: 'BOOTS', options: ['BLACK', 'WHITE', 'RED', 'GOLD'] },
  gloves: { name: 'GLOVES', options: ['STANDARD', 'NEON', 'GOLD'] },
  heads: { name: 'BIG HEADS', options: ['OFF', 'ON'] },
};

// test(s): s is the stats object. reward: [locker slot, option index].
export const CHALLENGES = [
  { id: 'goal', name: 'OFF THE MARK', desc: 'SCORE A GOAL', test: s => s.yourGoals >= 1 },
  { id: 'header', name: 'HEADS UP', desc: 'SCORE A HEADER', test: s => s.kinds.header >= 1, reward: ['heads', 1] },
  { id: 'volley', name: 'SWEET SPOT', desc: 'SCORE A VOLLEY', test: s => s.kinds.volley >= 1 },
  { id: 'bicycle', name: 'OVERHEAD', desc: 'SCORE A BICYCLE KICK', test: s => s.kinds.bicycle >= 1 },
  { id: 'chip', name: 'DINK', desc: 'CHIP THE KEEPER', test: s => s.kinds.chip >= 1 },
  { id: 'megs', name: 'MEGS', desc: '3 NUTMEGS IN ONE MATCH', test: s => s.nutmegs >= 3, reward: ['boots', 2] },
  { id: 'joga', name: 'JOGA BONITA', desc: 'SCORE AFTER 3 SKILL MOVES', test: s => s.maxSkills >= 3, reward: ['ball', 1] },
  { id: 'tiki', name: 'TIKI-TAKA', desc: 'SCORE AFTER 4 PERFECT PASSES', test: s => s.maxChain >= 4, reward: ['ball', 2] },
  { id: 'sniper', name: 'SNIPER', desc: '3 TOP BINS GOALS IN ONE MATCH', test: s => s.topBins >= 3 },
  { id: 'hat', name: 'HAT TRICK', desc: 'SCORE 3 IN ONE MATCH', test: s => s.yourGoals >= 3 },
  { id: 'combo', name: 'DANCE KING', desc: 'FULL COMBO ON THE DANCE', test: s => s.combo, reward: ['boots', 1] },
  { id: 'score', name: 'HIGH SCORER', desc: '15000 POINTS IN SCORE ATTACK', test: s => s.mode === 'attack' && s.points >= 15000 },
  { id: 'world', name: 'WORLD CHAMPIONS', desc: "WIN WORLD CUP '96", test: s => s.cupWon === 'world', reward: ['ball', 3] },
  { id: 'club', name: 'KINGS OF EUROPE', desc: 'WIN THE CHAMPIONS CUP', test: s => s.cupWon === 'club', reward: ['boots', 3] },
  { id: 'giant', name: 'GIANT KILLER', desc: 'WIN A CUP WITH A 1-2 STAR TEAM', test: s => !!s.cupWon && s.stars <= 2 },
  { id: 'icecold', name: 'ICE COLD', desc: 'SCORE ALL 5 PENALTIES', test: s => s.penFirst5 >= 5 },
  { id: 'safe', name: 'SAFE HANDS', desc: 'SAVE 2 IN ONE SHOOTOUT', test: s => s.penSaves >= 2, reward: ['gloves', 2] },
  { id: 'wall', name: 'THE WALL', desc: '10 SAVES IN KEEPER RUSH', test: s => s.rushSaves >= 10, reward: ['gloves', 1] },
  { id: 'graduate', name: 'GRADUATE', desc: 'FINISH TRAINING', test: s => s.training },
];

export function createStats(mode = 'attack', stars = 3) {
  return { mode, stars, yourGoals: 0, kinds: {}, nutmegs: 0, topBins: 0, maxSkills: 0, maxChain: 0,
    combo: false, points: 0, cupWon: null, penFirst5: 0, penTaken: 0, penSaves: 0, rushSaves: 0, training: false };
}

// Sim events (rules/sim.js) and shootout / rush events into the stats.
export function noteEvents(s, events) {
  for (const e of events) {
    if (e.type === 'goal' && e.by === 'you') {
      s.yourGoals++;
      if (e.kind) s.kinds[e.kind] = (s.kinds[e.kind] || 0) + 1;
      if (isTopBins(e)) s.topBins++;
      s.maxSkills = Math.max(s.maxSkills, e.skills || 0);
      s.maxChain = Math.max(s.maxChain, e.chain || 0);
    }
    if (e.type === 'skill' && e.ok && e.move === 'nutmeg') s.nutmegs++;
    if (e.type === 'penResult' && e.by === 'you' && e.scored && s.penTaken < 5) s.penFirst5++;
    if (e.type === 'penResult' && e.by === 'you') s.penTaken++;
    if (e.type === 'penResult' && e.by === 'them' && e.how === 'saved') s.penSaves++;
    if (e.type === 'rushResult' && e.how === 'saved') s.rushSaves++;
  }
  return s;
}

export const createProgress = () => ({ done: {} });

// Marks newly met challenges done in progress. Returns them (with what they unlocked, if anything).
export function checkChallenges(progress, s) {
  const fresh = [];
  for (const c of CHALLENGES) {
    if (progress.done[c.id] || !c.test(s)) continue;
    progress.done[c.id] = true;
    fresh.push({ ...c, unlock: c.reward ? `${LOCKER[c.reward[0]].name}: ${LOCKER[c.reward[0]].options[c.reward[1]]}` : null });
  }
  return fresh;
}

// The options of a locker slot you can pick (indices), given what you've done.
export function unlocked(progress, slot) {
  const out = [0];
  for (const c of CHALLENGES) if (c.reward && c.reward[0] === slot && progress.done[c.id]) out.push(c.reward[1]);
  return out.sort((a, b) => a - b);
}

// The challenge that unlocks a locker option, for the settings hint.
export const unlockedBy = (slot, i) => CHALLENGES.find(c => c.reward && c.reward[0] === slot && c.reward[1] === i) || null;

export const doneCount = progress => CHALLENGES.filter(c => progress.done[c.id]).length;
