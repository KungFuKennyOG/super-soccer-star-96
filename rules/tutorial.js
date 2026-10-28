// Training: a run of drills that teaches every move, one at a time. Pure (no three, no DOM).
//
// Each step sets up the pitch (setupDrill), says what to do (lines for the headset and for the
// browser, 36 characters max each) and counts progress from the sim's events and your intent.
// Defenders are parked out of the way unless a drill needs one; the keeper is always in goal.
//
// stepTutorial returns, per frame:
//   'done'      the step was just completed (show it, the next one starts in a moment)
//   'next'      a new step starts now: set it up with setupDrill
//   'reset'     the same drill again (the cross missed, the pass arrived): set it up again
//   'finished'  that was the last step
//   null        nothing to do
import { MOVE, BRAIN } from './tuning.js';
import { makeBall } from './ball.js';
import { resetPlay } from './sim.js';

const PARK = [['d1', -17, 1], ['d2', -19.5, 1], ['d3', -22, 1]];

// drill: you [x, z]; brain (borrow that level's opposition); place [[id, x, z]]; frozen ids (stand still); owner id (who starts on the ball);
// mateHold (teammates wait on the ball until you call); crossHead (crosses come at head height);
// resetOn 'mate' | 'you' | 'any': set the drill up again a moment after that player receives the ball.
export const STEPS = [
  { id: 'run', title: 'DRIBBLE', need: 12, unit: 'M',
    vr: ['PUSH THE LEFT STICK TO RUN', 'THE BALL STAYS AT YOUR FEET'],
    pc: ['W A S D TO RUN', 'THE BALL STAYS AT YOUR FEET'],
    drill: { you: [0, -3] } },
  { id: 'sprint', title: 'SPRINT', need: 2, unit: 'S',
    vr: ['HOLD THE LEFT GRIP WHILE YOU RUN', '(CLICKING THE STICK WORKS TOO)'],
    pc: ['HOLD SHIFT WHILE YOU RUN'],
    drill: { you: [0, -3] } },
  { id: 'turn', title: 'TURN', need: 360, unit: 'DEG',
    vr: ['RIGHT STICK TURNS YOU AROUND', 'TURNING FOR REAL WORKS TOO'],
    pc: ['MOVE THE MOUSE TO TURN', '(Q AND Z WITHOUT A MOUSE)'],
    drill: { you: [0, -6] } },
  { id: 'knock', title: 'KNOCK-ON', need: 2,
    vr: ['RUN, THEN PRESS A: THE BALL GOES', 'AHEAD AND YOU BURST AFTER IT'],
    pc: ['RUN, THEN PRESS SPACE: THE BALL', 'GOES AHEAD AND YOU BURST AFTER IT'],
    drill: { you: [0, -2] } },
  { id: 'drag', title: 'DRAG-BACK', need: 2,
    vr: ['PRESS B TO DRAG THE BALL BACK', 'IT STOPS YOU AND SHAKES A DEFENDER'],
    pc: ['PRESS C TO DRAG THE BALL BACK', 'IT STOPS YOU AND SHAKES A DEFENDER'],
    drill: { you: [0, -4] } },
  { id: 'stepover', title: 'STEP-OVER', need: 1,
    vr: ['WHEN HE CLOSES IN, FLICK YOUR RIGHT', 'HAND SIDEWAYS: A STEP-OVER. HE BITES', 'AND YOU GO THE OTHER WAY'],
    pc: ['WHEN HE CLOSES IN, PRESS 1:', 'A STEP-OVER (HOLD A FOR LEFT)'],
    drill: { you: [0, -6], place: [['d2', 0, -10]] } },
  { id: 'roulette', title: 'ROULETTE', need: 1,
    vr: ['WHEN HE CLOSES IN, FLICK YOUR LEFT', 'HAND (OR DRAW A QUICK CIRCLE):', 'SPIN AWAY FROM HIM'],
    pc: ['WHEN HE CLOSES IN, PRESS 2:', 'SPIN AWAY FROM HIM'],
    drill: { you: [0, -6], place: [['d2', 0, -10]] } },
  { id: 'nutmeg', title: 'NUTMEG', need: 1,
    vr: ['FACE HIM UP CLOSE, THEN JAB YOUR', 'RIGHT HAND FORWARD AND DOWN:', 'THROUGH HIS LEGS!'],
    pc: ['FACE HIM UP CLOSE AND PRESS 3:', 'THROUGH HIS LEGS!'],
    drill: { you: [0, -6], place: [['d2', 0, -10]] } },
  { id: 'rainbow', title: 'RAINBOW FLICK', need: 1,
    vr: ['WHEN HE CLOSES IN, FLICK YOUR', 'RIGHT HAND UP: OVER HIS HEAD.', 'RUN ONTO IT'],
    pc: ['WHEN HE CLOSES IN, PRESS 4:', 'OVER HIS HEAD. RUN ONTO IT'],
    drill: { you: [0, -6], place: [['d2', 0, -10]] } },
  { id: 'pass', title: 'PASS', need: 2,
    vr: ['LOOK AT A MATE, HOLD LEFT TRIGGER', 'LET GO WHEN THE RING HITS THE CIRCLE', 'A PERFECT PASS COUNTS DOUBLE'],
    pc: ['LOOK AT A MATE, HOLD E OR R-CLICK', 'LET GO WHEN THE RING HITS THE CIRCLE', 'A PERFECT PASS COUNTS DOUBLE'],
    drill: { you: [0, -4], mateHold: true, resetOn: 'mate' } },
  { id: 'call', title: 'CALL FOR IT', need: 2,
    vr: ['YOUR TEAMMATE HAS THE BALL', 'RAISE A HAND ABOVE YOUR HEAD', 'TO CALL FOR IT'],
    pc: ['YOUR TEAMMATE HAS THE BALL', 'PRESS E (OR RIGHT CLICK) TO CALL', '(IN VR YOU RAISE YOUR HAND)'],
    drill: { you: [0, -6], place: [['m1', -9, -13]], frozen: ['m1'], owner: 'm1', mateHold: true, resetOn: 'you' } },
  { id: 'lob', title: 'LOB PASS', need: 1,
    vr: ['A DEFENDER BLOCKS YOUR LEFT MATE', 'PASS TO HIM ANYWAY: SEE THE BLUE', 'RING? IT GOES OVER THE TOP'],
    pc: ['A DEFENDER BLOCKS YOUR LEFT MATE', 'PASS TO HIM ANYWAY: SEE THE BLUE', 'RING? IT GOES OVER THE TOP'],
    drill: { you: [0, -5], place: [['m1', -10, -14], ['m2', 12, -5], ['d2', -5, -9.5]], frozen: ['m1', 'm2', 'd2'], mateHold: true, resetOn: 'mate' } },
  { id: 'shoot', title: 'SHOOT', need: 1,
    vr: ['HOLD RIGHT TRIGGER TO CHARGE', 'LOOK WHERE YOU WANT IT, LET GO', 'SCORE ONE! (A TAP IS A CHIP)'],
    pc: ['HOLD LEFT CLICK (OR F) TO CHARGE', 'LOOK WHERE YOU WANT IT, LET GO', 'SCORE ONE! (A TAP IS A CHIP)'],
    drill: { you: [0, -15] } },
  { id: 'chip', title: 'CHIP', need: 1,
    vr: ['RUN AT GOAL: THE KEEPER COMES OUT', 'JUST TAP THE RIGHT TRIGGER AND', 'LOOK OVER HIM. IT DROPS IN'],
    pc: ['RUN AT GOAL: THE KEEPER COMES OUT', 'JUST TAP LEFT CLICK (OR F) AND', 'LOOK OVER HIM. IT DROPS IN'],
    drill: { you: [0, -21], brain: 3 } },
  { id: 'flick', title: 'FLICK UP', need: 2,
    vr: ['STAND STILL AND PRESS A', 'TO FLICK THE BALL UP'],
    pc: ['STAND STILL AND PRESS SPACE', 'TO FLICK THE BALL UP'],
    drill: { you: [0, -15] } },
  { id: 'volley', title: 'VOLLEY', need: 1,
    vr: ['FLICK IT UP WITH A, THEN PULL', 'THE RIGHT TRIGGER AS IT DROPS'],
    pc: ['FLICK IT UP WITH SPACE, THEN', 'CLICK AS IT DROPS'],
    drill: { you: [0, -16] } },
  { id: 'header', title: 'HEADER', need: 1,
    vr: ['RAISE A HAND TO CALL FOR THE CROSS', 'THEN MEET IT WITH YOUR HEAD', 'NOD INTO IT FOR MORE POWER'],
    pc: ['PRESS E TO CALL FOR THE CROSS', 'STAND STILL AND LOOK AT THE GOAL', 'IT COMES RIGHT TO YOUR HEAD'],
    drill: { you: [3, -23], place: [['m2', 15, -25]], frozen: ['m2'], owner: 'm2', mateHold: true, crossHead: true, resetOn: 'any' } },
  { id: 'bicycle', title: 'BICYCLE KICK', need: 1,
    vr: ['FLICK IT UP WITH A, LOOK UP AT IT', 'AND PULL THE RIGHT TRIGGER'],
    pc: ['FLICK IT UP WITH SPACE, LOOK UP', 'AT IT AND CLICK'],
    drill: { you: [0, -17] } },
  { id: 'restart', title: 'RESTART', need: 1,
    vr: ['PRESS Y ANY TIME TO RESET', 'THE ATTACK WITH THE BALL'],
    pc: ['PRESS R ANY TIME TO RESET', 'THE ATTACK WITH THE BALL'],
    drill: { you: [0, -3] } },
];

export const DONE_PAUSE = 1.4;   // seconds the "done" message shows before the next drill
const RESET_PAUSE = 1.1;

export function createTutorial() {
  return { i: 0, n: 0, doneT: 0, resetT: 0, lastYaw: null, finished: false };
}

export const currentStep = tut => STEPS[Math.min(tut.i, STEPS.length - 1)];

// Puts the pitch in shape for a step: everyone back in position, defenders parked, the drill's own
// players placed, the ball with whoever starts on it.
export function setupDrill(w, step) {
  const d = step.drill;
  resetPlay(w, () => 0.5);
  const at = (id, x, z) => { const p = w.byId[id]; p.x = x; p.z = z; p.vx = p.vz = 0; p.stun = 0; p.dive = 0; };
  for (const [id, x, z] of PARK) at(id, x, z);
  at('you', d.you[0], d.you[1]);
  for (const [id, x, z] of d.place || []) at(id, x, z);
  const placed = new Set((d.place || []).map(p => p[0]));
  // a drill can borrow a level's opposition (the chip needs a keeper who comes out)
  w.tune = { ...w.tune, brain: BRAIN[d.brain !== undefined ? d.brain : w.tune.level || 0] };
  w.drill = {
    frozen: new Set([...PARK.map(p => p[0]).filter(id => !placed.has(id) || (d.frozen || []).includes(id)), ...(d.frozen || [])]),
    mateHold: !!d.mateHold, crossHead: !!d.crossHead,
  };
  const owner = w.byId[d.owner || 'you'];
  w.owner = owner.id; w.ownT = 0;
  if (owner.id !== 'you') { const f = norm2(w.you.x - owner.x, w.you.z - owner.z); owner.fx = f.x; owner.fz = f.z; }
  Object.assign(w.ball, makeBall(owner.x + owner.fx * MOVE.ballLead, owner.z + owner.fz * MOVE.ballLead));
}

// Leave training: back to normal play rules.
export function clearDrill(w) { w.drill = null; }

// f: { ev, intent, world, dt, vr, restart }
export function stepTutorial(tut, f) {
  if (tut.finished) return null;
  const s = STEPS[tut.i], w = f.world, you = w.you;
  if (tut.doneT > 0) {
    tut.doneT -= f.dt;
    if (tut.doneT > 0) return null;
    tut.i++; tut.n = 0; tut.resetT = 0; tut.lastYaw = null;
    if (tut.i >= STEPS.length) { tut.finished = true; return 'finished'; }
    return 'next';
  }
  let gain = 0;
  const speed = Math.hypot(you.vx, you.vz);
  if (s.id === 'run' && w.owner === 'you') gain = speed * f.dt;
  if (s.id === 'sprint' && f.intent.sprint && speed > 3) gain = f.dt;
  if (s.id === 'turn' && f.intent.facing) {
    const yaw = Math.atan2(f.intent.facing.x, f.intent.facing.z);
    if (tut.lastYaw !== null) gain = Math.abs(wrap(yaw - tut.lastYaw)) * 180 / Math.PI;
    tut.lastYaw = yaw;
  }
  if (s.id === 'restart' && f.restart) gain = 1;
  for (const e of f.ev) {
    const mine = e.by === 'you';
    if (s.id === 'knock' && e.type === 'knock') gain += 1;
    if (s.id === 'drag' && e.type === 'drag') gain += 1;
    if (e.type === 'skill' && e.ok && e.move === s.id) gain += 1;
    if (s.id === 'pass' && e.type === 'pass' && mine) gain += e.grade === 'perfect' ? 2 : e.grade === 'good' ? 1 : 0;
    if (s.id === 'call' && e.type === 'called' && (!f.vr || e.hand)) gain += 1;
    if (s.id === 'lob' && e.type === 'pass' && mine && e.lob) gain += 1;
    if (s.id === 'shoot' && e.type === 'goal' && mine) gain += 1;
    if (s.id === 'chip' && e.type === 'goal' && mine && e.kind === 'chip') gain += 1;
    if (s.id === 'flick' && e.type === 'flick') gain += 1;
    if (['volley', 'header', 'bicycle'].includes(s.id) && e.type === 'kick' && mine && e.kind === s.id) gain += 1;
    // drills that need the ball back where it started
    const r = s.drill.resetOn;
    if (r && e.type === 'received' && (r === 'any' || (r === 'you' ? e.id === 'you' : e.id !== 'you'))) tut.resetT = RESET_PAUSE;
  }
  tut.n = Math.min(s.need, tut.n + gain);
  if (tut.n >= s.need) { tut.doneT = DONE_PAUSE; return 'done'; }
  if (tut.resetT > 0) { tut.resetT -= f.dt; if (tut.resetT <= 0) return 'reset'; }
  return null;
}

// Skip the current step (if a move won't come off, or you already know it).
export function skipStep(tut) {
  if (tut.finished || tut.doneT > 0) return;
  tut.n = currentStep(tut).need; tut.doneT = 0.01; tut.skipped = (tut.skipped || 0) + 1;
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
