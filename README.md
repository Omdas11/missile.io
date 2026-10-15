# missile.io

A **2-minutes-in-space** style HTML5 survival game: your rocket auto-flies upward — steer, dodge everything, and **survive the full 2:00 to win.**

Play it: https://omdas11.github.io/missile.io/ (GitHub Pages)

No build step, no dependencies — just open `index.html` or serve the folder.

## How to play

| Input | Action |
|---|---|
| Mouse / touch drag / WASD · arrows | Steer your rocket |
| P or Esc | Pause |
| M | Mute |

- **Goal:** survive 2:00. The timer counts down; distance is your score.
- **Dodge:** asteroids, homing missiles (watch for the INCOMING warning), UFO bolts, proximity mines, and black holes that pull you in.
- **Grab pickups:** **S** shield · **+** repair · **T** slow-mo.
- Difficulty ramps the whole flight — the last 10 seconds are a missile storm.
- Best distance and best time are saved locally in the browser.

## Files

- `index.html` — page, HUD, menus
- `style.css` — all styling
- `game.js` — the whole game (canvas rendering, synthesized WebAudio SFX, no assets)

## Deploy

Any static host works. GitHub Pages is enabled on this repo (`main` branch, `/` root).
