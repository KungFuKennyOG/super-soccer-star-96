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
| Pass | Hold left trigger at a teammate, let go when the shrinking ring meets the circle | Hold right click or E |
| Call for it | Pass button when a teammate has the ball | Same |
| Knock-on | Flick right stick up | Space |
| Drag-back | Flick right stick down (shakes the defender pressing you) | C |
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

Shot power fills in about a second. Hold too long and it starts to sky. A quick tap is a chip.

## Look

The game renders at 360 lines in the browser and at half resolution in the headset. Vertices snap to a coarse grid (the PS1 wobble), textures warp across polygons, and colors are cut to 15 bits with an ordered dither.

Players are single skinned meshes on an 18-bone skeleton, wearing a painted 128 px texture sheet. One team plays in all white, the other in blue-and-garnet stripes. Kits use colors only, with no crests, sponsors or club names.

## Development

No build step: everything is plain ES modules served as-is. See `CLAUDE.md` for the layout and rules.

```bash
npm install
npm run serve      # http://localhost:8000
npm run check      # lint + unit tests
npm run smoke      # headless browser play-through, screenshots in tests/smoke/out/
```
