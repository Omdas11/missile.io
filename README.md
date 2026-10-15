# missile.io

A **2-minutes-in-space** style HTML5 survival game: your rocket auto-flies upward — steer, dodge everything, and **survive the full 2:00 to win.**

Play it: https://omdas11.github.io/missile.io/ (GitHub Pages)

No build step, no dependencies — just open `index.html` or serve the folder.

## How to play

| Input | Action |
|---|---|
| &#8592; &#8594; or A / D | Hold to turn (release to fly straight) |
| Touch | Hold left / right half of the screen to turn |
| P or Esc | Pause |
| M | Mute |

The rocket **always flies forward** — like the real 2 Minutes in Space, holding a turn key carves a circular path, and releasing it sends you off on the tangent in a straight line. Homing missiles chase you: out-turn them, don't outrun them.

- **Goal:** survive 2:00. The timer counts down; distance is your score.
- **Difficulty:** pick EASY, NORMAL, or HARD on the menu. You have 5 hearts — except HARD, where a single hit ends the run.
- **Dodge:** asteroids, homing missiles (watch for the INCOMING warning — and when two missiles cross paths they blow each other up), UFO bolts, proximity mines, and black holes that pull you in.
- **Grab pickups:** shield · heart (+1) · clock (slow-mo), each with its own icon.
- Difficulty ramps the whole flight — the last 10 seconds are a missile storm.
- Best distance and best time are saved locally in the browser.

## Files

- `index.html` — page, HUD, menus
- `style.css` — all styling
- `game.js` — the whole game (canvas rendering, synthesized WebAudio SFX, no assets)

## Deploy

Any static host works. GitHub Pages is enabled on this repo (`main` branch, `/` root).
