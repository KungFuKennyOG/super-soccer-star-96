// Turns the raw controls into the sim's intent each frame: running relative to where you look,
// room-scale steps, your head for headers, the trigger for volleys and overhead kicks, and the two
// holds (shot charge, pass ring). The holds are read by the HUD too.
import * as THREE from 'three';
import { norm } from '../rules/vec.js';
import { pickTarget } from '../rules/pass.js';
import { PASS } from '../rules/tuning.js';

export function createIntents(camera, rig) {
  const headW = new THREE.Vector3(), dirW = new THREE.Vector3(), headVel = { x: 0, y: 0, z: 0 };
  let shotHold = null, passHold = null, lastHead = null, armed = false, passHeldPrev = false, shootPrev = false, headPrev = null;
  const rigYaw = () => rig.rotation.y;
  return {
    get shotHold() { return shotHold; },
    get passHold() { return passHold; },
    // a new match: nothing held, and shoot/pass wait until both triggers have been let go
    reset() { lastHead = null; shotHold = passHold = null; armed = false; headPrev = null; },
    build(raw, dt, world) {
      camera.getWorldPosition(headW); camera.getWorldDirection(dirW);
      const facing = norm(dirW.x, dirW.z);
      const right = { x: -facing.z, z: facing.x };
      const intent = {
        move: { x: facing.x * raw.move.y + right.x * raw.move.x, z: facing.z * raw.move.y + right.z * raw.move.x },
        sprint: raw.sprint, facing, knock: raw.knock, drag: raw.drag, physical: { x: 0, z: 0 },
      };
      // room-scale steps in the headset move you on the pitch too
      if (raw.vr) {
        const c = Math.cos(rigYaw()), s = Math.sin(rigYaw());
        const hx = camera.position.x * c + camera.position.z * s, hz = -camera.position.x * s + camera.position.z * c;
        if (lastHead) intent.physical = { x: hx - lastHead.x, z: hz - lastHead.z };
        lastHead = { x: hx, z: hz };
      }
      const onBall = world.owner === 'you' && !world.dead;
      // your head, for headers: its centre a little behind and below the eyes, and how fast it's moving
      const hc = { x: headW.x - dirW.x * 0.06, y: headW.y - 0.06, z: headW.z - dirW.z * 0.06 };
      const hv = headPrev && dt > 0 ? { x: (hc.x - headPrev.x) / dt, y: (hc.y - headPrev.y) / dt, z: (hc.z - headPrev.z) / dt } : { x: 0, y: 0, z: 0 };
      headVel.x += (hv.x - headVel.x) * 0.5; headVel.y += (hv.y - headVel.y) * 0.5; headVel.z += (hv.z - headVel.z) * 0.5;
      headPrev = hc;
      intent.head = { ...hc, vx: headVel.x, vy: headVel.y, vz: headVel.z };
      intent.gaze = { x: dirW.x, y: dirW.y, z: dirW.z };
      // after kick-off, shoot and pass only count once both have been let go
      if (!armed) { if (!raw.shoot && !raw.pass) armed = true; else { passHeldPrev = raw.pass; shootPrev = raw.shoot; return intent; } }
      // the trigger going down with the ball loose: a volley or an overhead kick, if it's there to hit
      if (raw.shoot && !shootPrev && !onBall && !world.dead) intent.strike = { eye: { x: headW.x, y: headW.y, z: headW.z }, dir: intent.gaze };
      shootPrev = raw.shoot;

      if (raw.shoot && onBall && !passHold) shotHold = shotHold || { t: 0 };
      if (shotHold) {
        shotHold.t += dt;
        if (!onBall) shotHold = null;
        else if (!raw.shoot || shotHold.t > 2) {
          intent.shot = { eye: { x: headW.x, y: headW.y, z: headW.z }, dir: { x: dirW.x, y: dirW.y, z: dirW.z }, holdT: shotHold.t };
          shotHold = null;
        }
      }

      const mates = world.players.filter(p => p.role === 'mate');
      if (raw.pass && !passHold && !shotHold) {
        if (onBall) passHold = { t: 0, target: pickTarget(world.you, facing, mates).id };
        else if (!passHeldPrev) intent.call = true;
      }
      passHeldPrev = raw.pass;
      if (passHold) {
        passHold.t += dt;
        if (!onBall) passHold = null;
        else if (!raw.pass || passHold.t > PASS.ringTime + 0.05) {
          intent.pass = { holdT: passHold.t, targetId: passHold.target };
          passHold = null;
        }
      }
      return intent;
    }
  };
}
