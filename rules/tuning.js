// Every number that sets how the game feels, in one place. Pure data: no three, no DOM.
// Units: metres, seconds, m/s. The pitch lies on X/Z with the attacking goal toward -Z.

export const PITCH = { halfW: 22, halfwayZ: 0 };

// Real goal size. z is the goal line; the net is depth metres behind it.
export const GOAL = { z: -34, halfW: 3.66, h: 2.44, depth: 2.0, post: 0.06 };

export const BALL = {
  r: 0.12,         // a touch bigger than real so it reads in the headset
  g: 9.81,
  rollFric: 1.3,   // m/s² lost every second while rolling
  rollDrag: 0.32,  // plus this much per m/s of speed
  bounce: 0.55,    // vertical speed kept on a bounce
  curlDecay: 1.4,
};

export const MOVE = {
  run: 6.4, sprint: 8.4,           // no ball
  dribble: 5.8, dribbleSprint: 7.6, // with the ball at your feet
  accel: 24,                        // how fast you reach top speed
  knockBoost: 1.4, knockTime: 1.0, // extra speed after a knock-on
  knockKick: 6.5,                   // how far ahead a knock-on pushes the ball (m/s above your speed)
  ballLead: 0.62,                   // ball distance ahead of your feet while dribbling
};

export const AI = {
  press: 6.6, mark: 5.8, chase: 7.0,         // defenders
  pressGap: 0.8, pressLead: 0.1, pressIn: 2.2,  // the presser comes at you from this far goal-side (reading your run), and goes in from pressIn m
  markDanger: 21, markGoal: 2.0, markBall: 0,     // attackers inside this of goal are marked goal-side (and ball-side, by level)
  coverGap: 4.5,                              // the spare man sits this far behind the ball toward goal
  mateRun: 6.0, mateDribble: 5.6,             // your teammates
  gkMove: 3.5, gkDive: 5.0, gkReact: 0.17, gkReach: 1.04, gkCatchBelow: 19, gkCatchAtHim: 9, gkCatchWidth: 1.6,   // he catches below gkCatchBelow m/s, up to gkCatchAtHim more for a shot straight at him (fading out gkCatchWidth m away)
  tackleRange: 0.85, tackleTime: 0.22,        // a defender must stay this close to the ball this long to win it
  block: 0.55,                                // a defender this close to a shot's path gets a foot to it
  interceptSlow: 0.85, interceptFast: 0.45, fastPass: 15,
  receive: 1.3,                               // how close the ball must come to be controlled
  youMargin: 0.9,                             // a pass to you is yours unless a defender is this much closer to it
  separation: 0.75,
  dragGrace: 0.6, dragStun: 0.6,              // drag-back: defenders can't tackle, the presser stumbles
};

export const PASS = {
  ringTime: 0.95,   // seconds for the ring to shrink from ringStart to nothing
  ringStart: 3,     // ring size when you start holding (the target circle is 1)
  perfect: 0.18,    // |ring - 1| at release for a perfect pass
  good: 0.45,
  // a lob is chosen when a defender is inside this corridor along the pass: it widens from `near`
  // metres beside the passer to `far` metres at the receiver's end
  lobNear: 1.4, lobFar: 2.4,
  lobMin: 8,        // never a lob over less than this: it hangs in the air and gets cut out
  leadYou: 3.5,     // a teammate's pass to you leads you by at most this (you might turn)
  mateLane: [1.3, 1.3],   // a teammate lofts it to you only if someone's inside this corridor (near, far)
};

export const SHOT = {
  chargeTime: 0.9,  // hold this long for full power
  overTime: 1.25,   // hold past this and the shot starts skying
  minSpeed: 13, maxSpeed: 31,
  chipBelow: 0.22,  // let go before this and it's a chip: a slow, high ball that drops over a keeper who's come out
  chipTime: 1.3,    // seconds a chip takes to reach the goal (within chipSpeed limits)
  chipSpeed: [5.5, 10],
};

export const MATCH = { duration: 120, deadTime: 2.4 };

// A shot that comes back off the keeper, a defender or the woodwork and is won by a defender within
// `window` s (nobody kicking it since) is a clearance, not a turnover you gave away: it shows CLEARED and
// its counter-attack chance is `counter` x the normal one (rules/match.js).
export const REBOUND = { window: 2.5, counter: 1 / 3 };

// Headers, volleys and bicycle kicks (rules/aerial.js). Heights are of the ball's centre (m).
export const AIR = {
  headR: 0.3,                          // the ball meets your head inside this distance of its centre
  headMin: 6, headMax: 21,             // header speed: a still head nods it, a lunge into it powers it
  headLunge: 2.4,                      // m/s of header speed per m/s your head is moving
  headAuto: 22,                        // headers within this distance of goal always go on target
  volleyLow: 0.22, volleyHigh: 1.4, volleyReach: 1.15,
  bikeLow: 0.95, bikeHigh: 2.4, bikeReach: 1.35, bikeLook: 0.4,   // look up at least this much (dir.y)
  trapBelow: 0.55,                     // you only bring a dropping ball down once it's below this
  boxDepth: 17, boxHalfW: 12,          // you're "in the box" for a cross inside this
  crossSpeed: 15.5,                    // horizontal speed of a teammate's cross
  flick: { up: 5.2, fwd: 0.6 },        // knock-on while standing: flick it up for a volley or an overhead
};

// How the opposition thinks, by level (rules/brain.js, rules/keeper.js): cup rounds get smarter
// (group/R16 0, QF 1, SF 2, final 3); Score Attack is 0, or 1 against 5 stars. Later rounds ask a bit
// more of you; they never shut you down (Kenny: you're meant to feel like a superstar).
//   markTight  how much further ball-side markers stand (on top of AI.markBall): more passes cut out
//   dragBite   drag-backs in a row (within 3 s) the presser falls for; after that he reads it
//   gkOut      how far (0..1 of 4 m) the keeper comes off his line to narrow the angle when you're through
//   gkRush     the keeper races out to claim through-balls he can reach first
//   gkSharp    the keeper reacts this much quicker (fraction) and reaches a touch further
//   runMargin  a pass to the teammate making a run is his unless a defender is this much closer to it
//              (perfect pass; a good one gets 70% of it)
export const BRAIN = [
  { markTight: 0, dragBite: 3, gkOut: 0.35, gkRush: false, gkSharp: 0, runMargin: 1.3 },
  { markTight: 0.15, dragBite: 3, gkOut: 0.6, gkRush: true, gkSharp: 0.1, runMargin: 1.15 },
  { markTight: 0.35, dragBite: 3, gkOut: 0.85, gkRush: true, gkSharp: 0.2, runMargin: 1.0 },
  { markTight: 0.45, dragBite: 2, gkOut: 1, gkRush: true, gkSharp: 0.25, runMargin: 0.95 },
];

// The DIFFICULTY setting (rules/skill.js tuneFor), on top of the cup-round levels above. NORMAL is the
// defence as it was: it reads passes but can simply be run round (a scripted player who sprints past the
// presser and shoots scored on 85% of attacks). HARD and LEGEND defend the dribble and the shot:
//   pressRead  going in, the presser heads for where he can meet the ball, reading your run up to this many seconds
//              ahead (0: he chases the ball where it is). Cut back and he's committed to the wrong line.
//   coverIn    the spare man goes in as well once your run brings you inside this (m)
//   closeShot  wind up a shot with a defender goal-side of you inside this (m) and he comes for the ball
//   recover    a presser the wrong side of you, a marker who's lost his man (more than markLoose m off him) and the
//              man closing a shot run at chase x this
//   block      x how close to a shot's path a defender gets a foot to it
//   tackle     x how long he needs on the ball to win it (and his reach grows by half as much)
//   gkReact    x keeper reaction; gkReach metres further; gkDive x how fast he gets across; gkOut further off his
//              line when you're through
//   bite       fewer of the same skill move (and drag-back) in a row fool him
//   mark       markers this much further ball-side, and a runner's pass needs to be this much better (m off runMargin)
export const DIFFICULTY = [
  { name: 'NORMAL', pressRead: 0, coverIn: 0, closeShot: 0, recover: 1, markLoose: 3, block: 1, tackle: 1, gkReact: 1, gkReach: 0, gkDive: 1, gkOut: 0, bite: 0, mark: 0 },
  { name: 'HARD', pressRead: 0.45, coverIn: 3.25, closeShot: 4, recover: 1.12, markLoose: 2, block: 1.3, tackle: 0.9, gkReact: 0.9, gkReach: 0.06, gkDive: 1.15, gkOut: 0.2, bite: 0, mark: 0 },
  { name: 'LEGEND', pressRead: 0.75, coverIn: 3.5, closeShot: 6, recover: 1.2, markLoose: 1.5, block: 1.6, tackle: 0.8, gkReact: 0.8, gkReach: 0.12, gkDive: 1.3, gkOut: 0.4, bite: 1, mark: 0.1 },
];
