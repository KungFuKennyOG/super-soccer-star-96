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
  mateRun: 6.0, mateDribble: 5.6,             // your teammates
  gkMove: 3.4, gkDive: 5.0, gkReact: 0.18, gkReach: 1.0, gkCatchBelow: 19,
  tackleRange: 0.85, tackleTime: 0.22,        // a defender must stay this close to the ball this long to win it
  interceptSlow: 1.0, interceptFast: 0.45, fastPass: 15,
  receive: 1.3,                               // how close the ball must come to be controlled
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

// Headers, volleys and bicycle kicks (rules/aerial.js). Heights are of the ball's centre (m).
export const AIR = {
  headR: 0.3,                          // the ball meets your head inside this distance of its centre
  headMin: 6, headMax: 21,             // header speed: a still head nods it, a lunge into it powers it
  headLunge: 2.4,                      // m/s of header speed per m/s your head is moving
  volleyLow: 0.22, volleyHigh: 1.4, volleyReach: 1.15,
  bikeLow: 0.95, bikeHigh: 2.4, bikeReach: 1.35, bikeLook: 0.4,   // look up at least this much (dir.y)
  trapBelow: 0.55,                     // you only bring a dropping ball down once it's below this
  boxDepth: 17, boxHalfW: 12,          // you're "in the box" for a cross inside this
  crossSpeed: 15.5,                    // horizontal speed of a teammate's cross
  flick: { up: 5.2, fwd: 0.6 },        // knock-on while standing: flick it up for a volley or an overhead
};

// How the opposition thinks, by level (rules/brain.js, rules/keeper.js). Level comes from the match:
// cup rounds get smarter (group/R16 0, QF 1, SF 2, final 3); Score Attack is 0, or 1 against 5 stars.
//   read       seconds you can look at one teammate before a defender steps into that passing lane
//   readGap    how far in front of that teammate (toward the ball) his marker steps to cut it out
//   readSteal  pass to him anyway and his marker nips in front if he's within this many metres of him
//   double     a second defender closes you down inside doubleRange metres of goal
//   stepUp     the defence steps up together when you turn back or drag back
//   dragBite   drag-backs in a row (within 3 s) the presser falls for; after that he reads it
//   gkOut      how far (0..1 of 4 m) the keeper comes off his line to narrow the angle when you're through
//   gkRush     the keeper races out to claim through-balls he can reach first
//   runMargin  a pass to the teammate making a run is his unless a defender is this much closer to it
//              (perfect pass; a good one gets 40% of it). Later rounds track runners better.
export const BRAIN = [
  { read: 2.0, readGap: 1.5, readSteal: 2.4, double: false, doubleRange: 0, stepUp: false, dragBite: 3, gkOut: 0.35, gkRush: false, runMargin: 0.95 },
  { read: 1.6, readGap: 1.35, readSteal: 2.8, double: true, doubleRange: 19, stepUp: false, dragBite: 3, gkOut: 0.6, gkRush: true, runMargin: 0.9 },
  { read: 1.35, readGap: 1.2, readSteal: 3.1, double: true, doubleRange: 21, stepUp: true, dragBite: 2, gkOut: 0.85, gkRush: true, runMargin: 0.85 },
  { read: 1.15, readGap: 1.05, readSteal: 3.4, double: true, doubleRange: 23, stepUp: true, dragBite: 2, gkOut: 1, gkRush: true, runMargin: 0.8 },
];
// The scouting report shown a few seconds into a match at each level (banner lines, 31 characters max).
export const LEVEL_NAMES = ['',
  'THEY DOUBLE-TEAM NEAR THE BOX\nTHE KEEPER SWEEPS UP BEHIND',
  'THEY PUSH UP WHEN YOU GO BACK\nDRAG-BACKS ONLY WORK TWICE',
  'THEY READ EVERYTHING\nPASS QUICK, CHIP THE KEEPER'];
