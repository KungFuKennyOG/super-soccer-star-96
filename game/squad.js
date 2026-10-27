// Dresses the players on the pitch for a match: your team's kit on you and your teammates, the
// opponent's kit (or their change kit on a clash) on the defenders, and a keeper kit that stands out.
import { buildPlayer, buildYou } from './actors.js';
import { matchKit, keeperKit } from '../rules/teams.js';

const seedOf = id => [...id].reduce((a, c) => a + c.charCodeAt(0), 0);

export function createSquads(scene) {
  let models = {};
  return {
    get models() { return models; },
    // home, away: team objects from rules/teams.js
    dress(world, home, away) {
      for (const m of Object.values(models)) scene.remove(m.root, m.shadow);
      models = {};
      const awayK = matchKit(away, home), gkK = keeperKit(awayK);
      for (const p of world.players) {
        const look = p.num * 7 + seedOf(p.team === 'home' ? home.id : away.id);
        const m = p.role === 'you' ? buildYou(home.kit)
          : p.team === 'home' ? buildPlayer(home.kit, p.num, look)
          : buildPlayer(p.role === 'gk' ? gkK : awayK, p.num, look);
        models[p.id] = m;
        scene.add(m.root, m.shadow);
      }
      return models;
    },
  };
}
