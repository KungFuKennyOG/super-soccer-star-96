# Super Soccer Star '96

Arcade VR football for Meta Quest 3, in the style of late-90s / early-2000s 3D soccer games. Play it in the Quest browser at **https://kungfukennyog.github.io/super-soccer-star-96/**, or in any desktop browser with mouse and keyboard.

You plus two teammates attack one goal against three defenders and a keeper.

## Modes

- **Score Attack:** two minutes, score as much as you can, beat your high score.
- **World Cup '96:** pick one of 32 nations. Three group games (draws count), the top two go through, then round of 16 to the final.
- **Champions Cup:** pick one of 16 city clubs. Straight knockouts from the round of 16.
- **Training:** 19 drills, one move each: dribble, sprint, turn, knock-on, drag-back, step-over, roulette, nutmeg, rainbow flick, pass, calling for it, lob, shoot, chip, flick-up, volley, header, bicycle kick, restart. A card at the top of your view says what to do and fills a progress bar; X (N in the browser) skips a drill.

Every club has its own ground (Champions Cup ties alternate home and away), packed with fans in both teams' colors who jump when their side scores.

Every cup match drops you into a comeback: you start behind with a few minutes left ("2 down, score 3 to win"). Lose the ball and they might score on the counter. Knockout games need the win; fall short and you spend one of your 3 continues to replay it. Win the final and you lift the cup with your squad: grab it with your grips and raise it above your head (in the browser, E then hold Up).

The opposition gets smarter through each cup: from the quarter-finals they double-team you near the box and the keeper sweeps up through-balls; in the semis they push up when you go backwards; in the final they track your runners closest and stop falling for the same drag-back. It stays forgiving: you're the superstar. When the keeper comes off his line, a quick tap of the trigger chips him.

Teams are picked on a turntable that shows a player in the kit (on a world map for the World Cup). Stars matter: a 5-star side presses harder, tackles quicker and has a better keeper, and a 5-star team of your own runs and passes better. Kits are colors and patterns only; clubs go by city name.

## Controls

| | Quest 3 | Browser |
| --- | --- | --- |
| Run | Left stick | WASD |
| Sprint | Left grip or left stick click | Shift |
| Turn | Right stick | Mouse (Q/Z without one) |
| Shoot | Hold right trigger, **look where you want it**, let go | Hold left click or F |
| Pass | Hold left trigger at a teammate, let go when the shrinking ring meets the circle. It goes along the ground when the lane is clear and lobs over anyone near the lane (the target ring turns blue and says LOB). | Hold right click or E |
| Call for it | Raise a hand above your head, or the pass button, when a teammate has the ball | Pass button |
| Knock-on | A | Space |
| Drag-back | B (shakes the defender pressing you) | C |
| Hat-trick dance | Strike each pose on the beat: left hand up, right hand up, both up, arms out wide | Arrow keys |
| Restart the attack | Y | R |
| Skill moves (with a defender close) | Right-hand flick: sideways step-over, forward-and-down nutmeg, upward rainbow flick. Left-hand flick or circle: roulette | 1 step-over (hold A for left), 2 roulette, 3 nutmeg, 4 rainbow |
| Skip a training drill | X | N |
| Menus | Either stick to move, A or X to pick, B to go back | Arrows, Enter, Esc |

## Settings

SETTINGS on the mode screen (left/right to change): match length, PS1 wobble, commentary (off, subtitles, voice), goal replays, hit effects (hit-stop, haptics, turf and a streak on hard shots), skill moves (off, gesture, or gesture only while holding the right grip) and weather (random, clear, rain, snow). Rain makes the ball skid on; snow slows it, kills the bounce and brings out the orange ball.

Under them is your locker: balls, boots and big heads, unlocked by **challenges** (16 of them, on their own screen: score a header, nutmeg three men in a match, win the World Cup with a 1-star side...).

## Scoring

| | Points |
| --- | --- |
| Goal | 1000 |
| Top bins (top corner) | +750 |
| Skills: step-over / roulette / rainbow / nutmeg | +150 / +200 / +300 / +400 |
| Joga bonita (a goal after 2+ skills in the attack) | +300 per skill |
| Header / volley / bicycle kick | +500 / +600 / +1500 |
| Chip over the keeper | +400 |
| Worldie (from 24 m+) | +500 |
| One-two (you score straight after a pass back) | +300 |
| Pass chain (perfect passes before the goal) | +100 each |
| Perfect pass | +50 |
| Hat-trick dance | +150 per perfect move, +75 good, +300 full combo |

Shot power fills in about a second. Hold too long and it starts to sky. A quick tap is a chip: slow and high, it beats a keeper who has come off his line but not one standing on it.

## Look

A softened PS1 look: the game renders at 480 lines in the browser and at 0.7 resolution in the headset, vertices snap to a fine grid (a light wobble), textures warp a little across polygons, and colors get a gentle ordered dither.

Chiptune music plays on the menu and during the goal dance. Players are single skinned meshes on an 18-bone skeleton, wearing a painted 128 px texture sheet. One team plays in all white, the other in blue-and-garnet stripes. Kits use colors only, with no crests, sponsors or club names.

## Development

No build step: everything is plain ES modules served as-is. See `CLAUDE.md` for the layout and rules.

```bash
npm install
npm run serve      # http://localhost:8000
npm run check      # lint + unit tests
npm run smoke      # headless browser play-through, screenshots in tests/smoke/out/
```
