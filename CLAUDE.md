# CLAUDE.md

Read this first in every session. Super Soccer Star '96 is an arcade VR soccer game for Meta Quest 3 (WebXR, Quest browser), hosted on GitHub Pages from `main`. It is a separate project from Last Call (KungFuKennyOG/last-call-vr); `engine/` started as a copy of Last Call's engine modules.

The owner is Kenny. He plays every change on a Quest 3, so make each change easy to check (see "Asking for a headset check"). Keep replies short and direct. He prefers honest answers over hedged ones.

## Layout

| Path | What goes there |
| --- | --- |
| `index.html` | Title screen, browser HUD, import map |
| `engine/` | Stage (renderer, rig), WebXR session, controllers and desktop input, frame loop (copied from Last Call) |
| `rules/` | **Pure game rules, no three.js**: tuning numbers, ball physics, passing, shooting, AI, the sim, match scoring. Unit tested in Node. |
| `game/` | Everything that draws or sounds: PS1 materials, textures, stadium, skinned players, HUD, audio, controls, `main.js` |
| `tests/unit/` | Node tests for every module in `rules/` |
| `tests/smoke/` | Headless Chromium play-through with screenshots |
| `tools/serve.mjs` | Local no-cache server |

## How it fits together

- `rules/sim.js` owns the match: `stepSim(world, intent, dt)` takes one intent per frame (move, facing, shot, pass, knock, drag, call) and returns events (`kick`, `pass`, `received`, `goal`, `saved`, `post`, `out`, `tackled` and so on). The page never moves the ball or players itself.
- `rules/match.js` turns events into points and banners and runs the 2-minute clock.
- `game/main.js` reads controls, builds the intent (head-aim shooting, pass ring holds), steps the sim, then poses models and HUD.
- All feel numbers live in `rules/tuning.js`.

## Rules

- Plain ES modules, no bundler, no runtime npm packages. three.js is pinned to **r149** from jsDelivr via the import map.
- Game rules stay pure (no three, no DOM) so they're testable. Every new rules module gets a test file.
- Keep files under about 400 lines.
- `npm run check` must pass before committing. Run `npm run smoke` when a page changes.
- PS1 look: use `ps1()` from `game/ps1.js` for every material (vertex snap, affine textures, dither). Its strength is tunable in `PS1` (snap grid, color levels, dither amount); Kenny asked for it softer than the real PS1. Textures are painted in code at small sizes with nearest filtering.
- Kits are colors only: no real crests, sponsors, club or player names.

## Quest 3 budgets

72 fps minimum. Each player is one draw call (a SkinnedMesh). The headset renders at framebuffer scale 0.7.

## Decision log

- Name: Super Soccer Star '96. 90s logo and pixel-font UI.
- Comfort isn't a constraint (Kenny's call: it's just for him). Smooth turning is fine.
- Controls: sticky-ball dribbling, head-aimed shooting, timing-ring passes (hold, release when the ring meets the circle).
- First mode: 3 v 3 plus keeper on a half pitch, 2-minute arcade score attack.
- Passes lob over defenders in the lane, otherwise go along the ground (`rules/pass.js` choosePass). The lane is a corridor that widens toward the receiver (`PASS.lobNear`/`lobFar` in tuning). A blue ring and a LOB tag show it before you pass.
- On a hat trick (your 3rd, 6th... goal): a rhythm dance mini-game (`rules/dance.js`, `game/celebration.js`) at 88 bpm, one move per beat. Teammates face you and mirror the moves.
- Right stick is only for turning. Skills are on buttons: A knock-on, B drag-back, Y restart.
- Your own body in first person shows only boots and lower socks.
- Music: original chiptune tracks sequenced in `game/music.js` (menu, dance).
- Players are code-built skinned meshes for now. The planned upgrade is a real rigged model (Mixamo or a CC0 pack) with real run, kick and dive animations, with kits repainted on its UVs.

## Asking for a headset check

Say what to open, what to do step by step, what "working" looks like (fps, feel), and what you couldn't check without a headset.
