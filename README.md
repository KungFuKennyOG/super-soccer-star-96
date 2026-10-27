# Super Soccer Star '96

Arcade VR football for Meta Quest 3, in the style of late-90s / early-2000s 3D soccer games. Play it in the Quest browser at **https://kungfukennyog.github.io/super-soccer-star-96/**, or in any desktop browser with mouse and keyboard.

You plus two teammates attack one goal against three defenders and a keeper. You have two minutes to score as much as you can.

## Controls

| | Quest 3 | Browser |
| --- | --- | --- |
| Run | Left stick | WASD |
| Sprint | Left grip or left stick click | Shift |
| Turn | Right stick | Mouse (Q/Z without one) |
| Shoot | Hold right trigger, **look where you want it**, let go | Hold left click or F |
| Pass | Hold left trigger at a teammate, let go when the shrinking ring meets the circle. It goes along the ground when the lane is clear and lobs over anyone near the lane (the target ring turns blue and says LOB). | Hold right click or E |
| Call for it | Pass button when a teammate has the ball | Same |
| Knock-on | A | Space |
| Drag-back | B (shakes the defender pressing you) | C |
| Hat-trick dance | Strike each pose on the beat: left hand up, right hand up, both up, arms out wide | Arrow keys |
| Restart the attack | Y | R |

## Scoring

| | Points |
| --- | --- |
| Goal | 1000 |
| Top bins (top corner) | +750 |
| Worldie (from 24 m+) | +500 |
| One-two (you score straight after a pass back) | +300 |
| Pass chain (perfect passes before the goal) | +100 each |
| Perfect pass | +50 |
| Hat-trick dance | +150 per perfect move, +75 good, +300 full combo |

Shot power fills in about a second. Hold too long and it starts to sky. A quick tap is a chip.

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
