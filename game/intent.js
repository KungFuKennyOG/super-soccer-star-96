// Turns the raw controls into the sim's intent each frame: running relative to where you look,
// room-scale steps, a raised hand to call for it, right-hand flicks for skill moves, your head for headers, the trigger for volleys and overhead kicks, and the two
// holds (shot charge, pass ring). The holds are read by the HUD too.
import * as THREE from 'three';
import { norm } from '../rules/vec.js';
import { pickTarget } from '../rules/pass.js';
import { PASS } from '../rules/tuning.js';
import { createGestures } from '../rules/gestures.js';

const SKILL_RANGE = 5;   // gestures only count with a defender this close (and you on the ball)

// fist height above your eyes that counts as a raised hand, and below which it counts as lowered again
const HAND_UP = 0.14, HAND_DOWN = -0.02;

// skillMode: () => 0 off, 1 gestures, 2 gestures only while the right grip is held
export function createIntents(camera, rig, skillMode = () => 1) {
  const gestures = createGestures();
  let clock = 0;
  const headW = new THREE.Vector3(), dirW = new THREE.Vector3(), headVel = { x: 0, y: 0, z: 0 };
  let handUp = false, shotHold = null, passHold = null, lastHead = null, armed = false, passHeldPrev = false, shootPrev = false, headPrev = null;
  const rigYaw = () => rig.rotation.y;
  return {
    get shotHold() { return shotHold; },
    get passHold() { return passHold; },
    // a new match: nothing held, and shoot/pass wait until both triggers have been let go
    reset() { gestures.reset(); handUp = false; lastHead = null; shotHold = passHold = null; armed = false; headPrev = null; },
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
      // a hand raised above your head calls for the ball (once per raise: lower it to call again)
      if (raw.hand) {
        if (!handUp && raw.hand.dy > HAND_UP) { handUp = true; intent.call = true; intent.callHand = raw.hand.side; }
        else if (handUp && raw.hand.dy < HAND_DOWN) handUp = false;
      } else handUp = false;
      // skills: a key in the browser, a sharp right-hand flick in the headset (relative to your head,
      // in your body's frame), only on the ball with a defender close and not while charging a shot
      clock += dt;
      const mode = skillMode();
      const near = world.players.some(p => p.role === 'def' && Math.hypot(p.x - world.you.x, p.z - world.you.z) < SKILL_RANGE);
      if (mode && onBall && raw.skill) intent.skill = raw.skill;
      if (raw.rightHand) {
        const d = { x: raw.rightHand.pos.x - headW.x, y: raw.rightHand.pos.y - headW.y, z: raw.rightHand.pos.z - headW.z };
        const rel = { x: d.x * right.x + d.z * right.z, y: d.y, z: d.x * facing.x + d.z * facing.z };
        const armed = mode > 0 && onBall && near && !raw.shoot && (mode === 1 || raw.rightHand.grip);
        const g = gestures.update(rel, clock, dt, armed);
        if (g) intent.skill = g;
      }
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
