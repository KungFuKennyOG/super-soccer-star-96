// Weather for a match: clear, rain or snow. Pure. The pitch changes how the ball rolls and bounces
// (ball.surface, read by stepBall): a wet pitch is quick and skiddy, snow is heavy and dead.
// The page draws the rain or snow and tints the pitch (game/weather.js).

// fric, drag: multipliers on BALL.rollFric / rollDrag; bounce: on BALL.bounce
export const WEATHER = {
  clear: { name: 'CLEAR', surface: null },
  rain: { name: 'RAIN', surface: { fric: 0.6, drag: 0.72, bounce: 0.8 }, banner: 'WET PITCH - THE BALL SKIDS ON' },
  snow: { name: 'SNOW', surface: { fric: 1.7, drag: 1.35, bounce: 0.55 }, banner: 'HEAVY PITCH - ORANGE BALL OUT' },
};

// The weather setting's options, in menu order. RANDOM picks per match.
export const WEATHER_SETTING = ['RANDOM', 'CLEAR', 'RAIN', 'SNOW'];
const ODDS = [['clear', 0.65], ['rain', 0.23], ['snow', 0.12]];

export function pickWeather(setting = 0, rnd = Math.random) {
  if (setting > 0) return ['clear', 'rain', 'snow'][setting - 1];
  let r = rnd();
  for (const [k, p] of ODDS) { if (r < p) return k; r -= p; }
  return 'clear';
}

// Puts the weather on a world's ball (survives resetPlay, which keeps unknown keys).
export function applyWeather(world, kind) {
  world.weather = kind;
  world.ball.surface = WEATHER[kind].surface;
}
