# CLAUDE.md

Read this first in every session. Super Soccer Star '96 is an arcade VR soccer game for Meta Quest 3 (WebXR, Quest browser), hosted on GitHub Pages from `main`. It is a separate project from Last Call (KungFuKennyOG/last-call-vr); `engine/` started as a copy of Last Call's engine modules.

The owner is Kenny. He plays every change on a Quest 3, so make each change easy to check (see "Asking for a headset check"). Keep replies short and direct. He prefers honest answers over hedged ones.

## Layout

| Path | What goes there |
| --- | --- |
| `index.html` | Title screen, browser HUD, import map |
| `engine/` | Stage (renderer, rig), WebXR session, controllers and desktop input, frame loop (copied from Last Call) |
| `rules/` | **Pure game rules, no three.js**: tuning numbers, ball physics, passing, shooting, headers/volleys/bicycle kicks (`aerial.js`), AI (`ai.js` basics, `brain.js` reading/doubling/stepping up/teammate runs, `keeper.js`), the sim, match scoring, what the commentator says (`commentary.js`), the dance, training drills (`tutorial.js`), teams and kits (`teams.js`), cup runs (`cup.js`). Unit tested in Node. |
| `game/` | Everything that draws or sounds: PS1 materials, textures, stadium, skinned players (`body.js`, `head.js`, `hair.js`, `atlas.js`, `actors.js`, `squad.js`), HUD, menus (`menus.js`), trophy lift (`trophy.js`), training card (`training.js`), dance (`celebration.js`), commentator (`commentary.js`, voice clips in `assets/voice`), goal replays (`replay.js`), audio and music, controls and intents (`controls.js`, `intent.js`), `main.js` |
| `tests/unit/` | Node tests for every module in `rules/`, plus `bot.js` (a scripted attacker) and `balance.test.js` (every level stays beatable) |
| `tests/smoke/` | Headless Chromium play-through with screenshots |
| `tools/` | `serve.mjs` local no-cache server, `lab.html` model lineup, `build-voice.py` renders the commentator's lines |

## How it fits together

- `rules/sim.js` owns the match: `stepSim(world, intent, dt)` takes one intent per frame (move, facing, shot, pass, knock, drag, call, strike, head) and returns events (`kick`, `pass`, `received`, `goal`, `saved`, `post`, `out`, `tackled` and so on). The page never moves the ball or players itself.
- `rules/match.js` turns events into points and banners and runs the 2-minute clock.
- `game/main.js` reads controls, builds the intent (`game/intent.js`: head-aim shooting, pass ring holds, your head for headers), steps the sim, records it for replays, then poses models and HUD.
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
- Cups (Kenny's format): every match is a comeback scenario (start behind, short clock, reach the target). Opponents never attack in play; they can score on the counter when you lose the ball (`counterAttack` in `rules/match.js`). World Cup '96 = 32 nations, groups of 4 with draws then knockouts. Champions Cup = 16 city clubs, knockouts. 3 arcade continues per cup for knockout losses; going out in the groups is final.
- Teams (agreed list): 32 nations in `rules/teams.js`; 16 clubs by city name (London Red and London Blue both in, Marseille out). No club names or crests.
- Menus are in-world panels for both headset and browser. Picking is A/X or Enter, never a trigger (a held trigger would fire a shot at kick-off). Shoot and pass also ignore input until both triggers have been released after kick-off.
- Winning a cup ends with a physical trophy lift: grab with grips, raise above your head.
- Team stars matter on the pitch (`rules/skill.js`, `tuneFor(yours, theirs)`): their stars scale pressing, tackling, interceptions and keeper; yours scale teammates' pace and passing and a little of your pace and shooting. Max ±10% between 1 and 5 stars (15% compounded too hard).
- World Cup team select is a world map: the stick moves to the nearest nation that way; European picks zoom to Europe.
- PS1 wobble is a setting (OFF / LOW / FULL, default LOW) on the mode screen. In the headset LOW is a light vertex wobble with no texture warp (warp swims as your head moves); FULL adds the warp back.
- Match length is a setting (SHORT 0.6x, NORMAL, LONG 1.5x, EPIC 2.5x): Score Attack's 2 minutes and every cup scenario's clock scale with it. Settings persist in localStorage.
- The keeper always faces the ball in a crouched ready stance and side-steps instead of running; he hugs the ball after a catch and eases into position (no twitching).
- Passes lob over defenders in the lane, otherwise go along the ground (`rules/pass.js` choosePass). The lane is a corridor that widens toward the receiver (`PASS.lobNear`/`lobFar` in tuning). A blue ring and a LOB tag show it before you pass.
- On a hat trick (your 3rd, 6th... goal): a rhythm dance mini-game (`rules/dance.js`, `game/celebration.js`) at 88 bpm, one move per beat. Teammates face you and mirror the moves.
- Right stick is only for turning. Skills are on buttons: A knock-on (standing still: flick-up), B drag-back, Y restart.
- Your own body in first person shows only boots and lower socks, plus low-poly hands on the controller grips (`game/hands.js`): open by default, pointing while you squeeze the grip, a fist on the trigger, sweatband in your kit. They follow the WebXR grip-space spec (origin mid-fist, -Z along the handle toward the thumb, palm toward -X on the right hand, +Y back to the wrist).
- Trophies are deliberately PS1: few sides, flat shading, dithered metal textures, engraved plates. While you grip a hand-hold, a posed hand on the cup replaces your controller hand; each hand takes its own side (left hand on the cup's left).
- Every club has its own ground (`game/grounds.js` recipes: stand tiers, corners, roof, lights, time of day, mowing, seat colors, extras like Liverpool's single big end, Dortmund's wall, Turin's track, Milan's towers; the two Milan clubs share a ground). Champions Cup alternates: home in R16 and SF, away in QF and the final. Nations and the World Cup use the national stadium.
- The crowd is ~10k instanced fan dots in both teams' colors; they bob all game, yours jump when your team scores, theirs when they score on the counter (vertex shader, one draw call).
- Music: original chiptune tracks sequenced in `game/music.js` (menu, dance).
- Players are code-built low-poly skinned meshes measured against Kenny's FIFA 98 / Virtua Striker 2 screenshots (`game/body.js`, measurements in `P`): realistic athletic male proportions (1.82 m, about 8 heads), broad shoulders, straight torso and narrow hips (no waist, or they read as women), a thick neck carried forward, shirt tucked into long wide 90s shorts, socks to the knee, big calves, chunky boots. The face is sculpted in the geometry (`game/head.js`: brow ridge, deep-set eyes, nose, muzzle, chin, cheekbones, jaw corners). Textures are never flat: blotchy photo-like cloth with folds, skin tone variation and painted muscle light, V-necks, raglan shoulder stripes (`game/atlas.js`, 256 sheet). Mostly short hair (`game/hair.js`), most players stubbled. Gouraud shading, baked ambient occlusion, extra contrast (`ps1({ pop: true })`). Chunky stylised proportions and a realistic CC0 rigged model (Quaternius) were both tried and rejected. `tools/lab.html` shows a lineup for checking models.
- Aerial play (`rules/aerial.js`, numbers in `AIR`): headers use your real head (position and speed from the headset); pull the trigger on a dropping ball for a volley, or look up and pull it for a bicycle kick (always on target, slow motion). Teammates cross it in when you're in the box; A while standing flicks the ball up. A dropping ball isn't trapped above waist height, so it can be headed or volleyed. Goal bonuses: header +500, volley +600, bicycle +1500.
- Commentator (setting OFF / TEXT / VOICE, default VOICE): a British TV voice, pre-recorded lines in `game/assets/voice` (Kokoro TTS voice bm_george, rendered by `tools/build-voice.py` from hand-written phonemes in `lines.json`; add a line there and re-run it). Subtitles float just below your view. `rules/commentary.js` picks lines by event and priority.
- Calling for the ball: raise either hand above your head (fist 14 cm above eye level; lower it to call again), or the pass button without the ball. A two-note whistle, a buzz in that hand, and the arrow over the carrier pops. A called teammate passes to you (or crosses if you're in the box).
- Training mode (`rules/tutorial.js` drills, `game/training.js` card): 15 drills in order, each sets up the pitch (`setupDrill`: defenders parked and pinned via `world.drill.frozen`, teammates can hold the ball until called via `mateHold`, crosses forced to head height via `crossHead`) and counts progress from sim events. In the headset the call drill only counts a raised hand. X / N skips a drill, Y / R resets it. No replays, dance or clock in training. Add a move to the game → add a drill for it.
- Hit effects / juice (setting HIT EFFECTS OFF / ON, `game/juice.js`): hit-stop on your strikes (the sim steps with dt 0 for 35-90 ms by power; not on the bicycle, which has slow motion), power-scaled haptics, the ball swells on contact, turf bits kick up, a streak behind hard shots, the crowd draws breath when a shot is on target, a haptic heartbeat on your goals. Cosmetic apart from the hit-stop.
- Smarter opposition by level (`BRAIN` in `rules/tuning.js`, `levelFor` in `rules/skill.js`): cup group/R16 0, QF 1, SF 2, final 3; Score Attack 0, or 1 against 5 stars. Difficulty comes from behaviour, not more speed. A "scouting report" banner names it a few seconds in. Keep it forgiving (Kenny: you're meant to feel like a superstar): later rounds ask a little more, never shut you down. Cup deficits are at most 2 goals with 85 + 45 s per goal down (`scenarioFor`), since the smarter defence carries the difficulty.
  - Reading where you look (a marker stepping in front of the teammate you'd stared at, with a READ! tag) was built and then scrapped: Kenny found it too much, and in VR you look around constantly. Don't bring it back.
  - Doubling (level 1+): a second defender closes you down from the goal side near the box, leaving a teammate free.
  - Stepping up (level 2+): after you run back or drag back, markers squeeze up to 6 m from the ball for a second, except a marker whose man is already making a run in behind.
  - Drag-backs: the presser falls for `dragBite` in a row (3, or 2 in the final), then reads it (NOT AGAIN banner, no stumble).
  - Keeper (`rules/keeper.js`): one on one with nobody between you and goal he comes off his line (further at higher levels); a quick tap (`SHOT.chipBelow`) is a chip that drops over him (+400 CHIP). From level 1 he races out to claim ground passes played into space that he can reach first; never lobs, crosses or your own dribbling touches and knock-ons. He's checked before the ball moves each step so he's never a frame late. He can't gather his own parry for 0.6 s (the rebound is live), and once you've gone past him he can't save.
  - Teammates: while you have the ball one makes a diagonal run into the box, the other offers a pass wide and level (`mateSupport`). The runner keeps his run (the other man only takes over with 2 m more space). A pass to the runner is his unless a defender is `runMargin` closer (1.3 down to 0.95 m for a perfect pass, 70% of that for a good one): this one number sets most of the difficulty curve (see `balance.test.js`, which keeps the final within ~60% of the group stage for the bot).
  - Passes: the receiver gets first touch unless a defender is 0.4 m closer; a lofted ball on its way up can't be intercepted.
  - Offside was considered and dropped (Kenny: a hassle in a 3 v 3 arcade game).
- Goal replays (setting OFF / ON): the last ~4 s before a goal replay with copies of the players, slowing for the finish, filmed from a touchline gantry into a render target (256x144, every third frame in the headset) shown on a floating CRT in front of you and on the stadium's big screen. A or B skips. When rendering into it, restore the previous render target afterwards (in WebXR that's the headset's framebuffer; setting null dropped frames and made the view judder). No replay on a hat trick (the dance goes instead).

## Asking for a headset check

Say what to open, what to do step by step, what "working" looks like (fps, feel), and what you couldn't check without a headset.
