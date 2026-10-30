// What the commentator says about each moment of the match. Pure: picks a line id from
// game/assets/voice/lines.json for a sim event; game/commentary.js plays it and shows the words.
//
// pickLine(e, state, rnd, recent) → { id, priority } or null
//   e:      a sim event (rules/sim.js), or { type: 'kickoff' (weather) | 'last10' | 'fulltime' | 'combo' | 'counterGoal' }
//   state:  { us, them, scenario, hatTrick } for the match after the event was scored
//   recent: ids said lately, avoided when there's a choice
// Priority: a new line only cuts in over one of lower priority.

const POOLS = {
  kickoff: ['kickoff1', 'kickoff2', 'kickoff3'],
  rain: ['rain1', 'rain2'],
  snow: ['snow1', 'snow2'],
  goal: ['goal1', 'goal2', 'goal3', 'goal4', 'goal5', 'goal6', 'goal7', 'goal8'],
  topbins: ['topbins1', 'topbins2'],
  worldie: ['worldie1', 'worldie2'],
  header: ['header1', 'header2', 'header3'],
  volley: ['volley1', 'volley2'],
  bicycle: ['bicycle1', 'bicycle2'],
  chip: ['chip1', 'chip2'],
  claim: ['claim1', 'claim2'],
  dragread: ['dragread1', 'dragread2'],
  nutmeg: ['nutmeg1', 'nutmeg2'],
  rainbow: ['rainbow1', 'rainbow2'],
  joga: ['joga1', 'joga2'],
  hattrick: ['hattrick1', 'hattrick2'],
  shot: ['shot1', 'shot2', 'shot3', 'shot4'],
  saved: ['saved1', 'saved2', 'saved3', 'saved4', 'saved5'],
  parried: ['parried1', 'parried2'],
  post: ['post1', 'post2'],
  bar: ['bar1', 'post2'],
  wide: ['wide1', 'wide2', 'miss1'],
  over: ['over1', 'over2', 'miss1'],
  blocked: ['blocked1'],
  tackled: ['tackled1', 'tackled2', 'tackled3'],
  intercepted: ['intercepted1', 'tackled2'],
  pass: ['pass1', 'pass2', 'pass3', 'pass4'],
  cross: ['cross1', 'cross2'],
  counter: ['counter1', 'counter2'],
  comeback: ['comeback1', 'comeback2', 'comeback3'],
  level: ['level1'],
  last10: ['last10'],
  fulltime: ['fulltime1', 'fulltime2', 'fulltime3'],
  skill: ['skill1', 'skill2', 'skill3'],
  drag: ['drag1'],
  combo: ['dance1'],
};
export const LINE_IDS = [...new Set(Object.values(POOLS).flat())];

function pick(pool, rnd, recent) {
  const ids = POOLS[pool], fresh = ids.filter(id => !recent.includes(id));
  const from = fresh.length ? fresh : ids;
  return from[Math.floor(rnd() * from.length)];
}

const TOP_BINS = e => e.y > 1.55 && Math.abs(e.x) > 3.66 - 1.4;

export function pickLine(e, state = {}, rnd = Math.random, recent = []) {
  const say = (pool, priority = 1, chance = 1) => (rnd() < chance ? { id: pick(pool, rnd, recent), priority } : null);
  switch (e.type) {
    case 'kickoff': return say(e.weather === 'rain' || e.weather === 'snow' ? e.weather : 'kickoff', 2);
    case 'goal': {
      if (state.hatTrick) return say('hattrick', 5);
      if (e.kind) return say(e.kind, 4);
      if (e.skills >= 2) return say('joga', 4);
      if (state.scenario && state.us > state.them && state.us - state.them === 1 && e.by) return say('comeback', 4, 0.6) || say('goal', 3);
      if (state.scenario && state.us === state.them) return say('level', 4, 0.5) || say('goal', 3);
      if (TOP_BINS(e)) return say('topbins', 3);
      if (e.dist >= 24) return say('worldie', 3);
      return say('goal', 3);
    }
    case 'counterGoal': return say('counter', 4);
    case 'kick':
      if (e.by !== 'you') return say('shot', 1, 0.5);
      if (e.kind === 'bicycle') return { id: 'try_bicycle', priority: 2 };
      if (e.kind === 'header') return { id: 'try_header', priority: 2 };
      if (e.kind === 'volley') return { id: 'try_volley', priority: 2 };
      return say('shot', 1, 0.45);
    case 'saved': return say(e.claim ? 'claim' : 'saved', 2);
    case 'parried': return say('parried', 2);
    case 'post': return say(e.bar ? 'bar' : 'post', 2);
    case 'out': return e.where === 'byline' ? say(e.high ? 'over' : 'wide', 2) : null;
    case 'blocked': return say('blocked', 2);
    case 'tackled': return say('tackled', 1);
    case 'intercepted': return say('intercepted', 1);
    case 'pass':
      if (e.cross) return say('cross', 2);
      return e.by === 'you' && e.grade === 'perfect' ? say('pass', 1, 0.5) : null;
    case 'flick': return say('skill', 1, 0.35);
    case 'drag': return e.read ? say('dragread', 2, 0.8) : say('drag', 1, 0.4);
    case 'skill':
      if (e.read) return say('dragread', 2, 0.8);
      if (!e.ok) return null;
      if (e.move === 'nutmeg' || e.move === 'rainbow') return say(e.move, 2);
      return say(e.move === 'roulette' ? 'drag' : 'skill', 1, 0.5);
    case 'last10': return say('last10', 3);
    case 'fulltime': return say('fulltime', 5);
    case 'combo': return say('combo', 3);
    default: return null;
  }
}
