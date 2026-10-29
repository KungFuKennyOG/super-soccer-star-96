// Dresses the players on the pitch for a match: your team's kit on you and your teammates, the
// opponent's kit (or their change kit on a clash) on the defenders, and a keeper kit that stands out.
import { buildPlayer, buildYou } from './actors.js';
import { matchKit, keeperKit } from '../rules/teams.js';

const seedOf = id => [...id].reduce((a, c) => a + c.charCodeAt(0), 0);

// One model per sim player. fullYou: you as a whole player (the replay camera sees you), not just boots.
// look: the locker's { boots, heads } (your boot color, big heads on everyone).
export function buildSet(world, home, away, { fullYou = false, look: lk = {} } = {}) {
  const awayK = matchKit(away, home), gkK = keeperKit(awayK), models = {};
  for (const p of world.players) {
    const look = p.num * 7 + seedOf(p.team === 'home' ? home.id : away.id);
    models[p.id] = p.role === 'you' ? (fullYou ? buildPlayer(home.kit, p.num, look, { boots: lk.boots || 0 }) : buildYou(home.kit, lk.boots || 0))
      : p.team === 'home' ? buildPlayer(home.kit, p.num, look)
      : buildPlayer(p.role === 'gk' ? gkK : awayK, p.num, look);
    models[p.id].bigHead = !!lk.heads;
  }
  return models;
}

export function createSquads(scene) {
  let models = {};
  return {
    get models() { return models; },
    // home, away: team objects from rules/teams.js
    dress(world, home, away, look = {}) {
      for (const m of Object.values(models)) scene.remove(m.root, m.shadow);
      models = buildSet(world, home, away, { look });
      for (const m of Object.values(models)) scene.add(m.root, m.shadow);
      return models;
    },
  };
}
