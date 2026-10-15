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

- **Goal:** survive 2:00. The timer counts down.
- **Score:** collect the glowing **cores** laid in arcs ahead of your flight path (+10 each, streak bonus every 8 in a row without taking damage).
- **Difficulty:** pick EASY, NORMAL, or HARD on the menu. You have 5 hearts — except HARD, where a single hit ends the run.
- **Dodge:** asteroids, homing missiles (watch for the INCOMING warning — missiles that cross paths blow each other up, and luring one into an asteroid bursts them both), UFO bolts, proximity mines, and black holes that pull you in.
- **Grab pickups:** shield · heart (+1) · clock (slow-mo), each with its own icon.
- **Graphics settings:** LOW / MED / HIGH on the menu (render scale, glow effects, starfield density, particles) plus an FPS meter toggle, for weaker machines.
- Difficulty ramps the whole flight — the last 10 seconds are a missile storm.
- Best score and best time are saved locally in the browser.
- **Online leaderboard:** sign in with Google (top of the menu) to submit your scores to the global TOP PILOTS leaderboard, powered by Firebase.

## Backend

Scores live in Cloud Firestore (`leaderboard` collection) in the user's Firebase project, in the `asia-south1` region. Google sign-in uses Firebase Authentication; Firestore security rules allow public reads and restrict score submissions to signed-in pilots writing their own UID with a non-negative score. Needs one manual step in the Firebase console: Authentication → Get started → enable the Google provider.

## Files

- `index.html` — page, HUD, menus
- `style.css` — all styling
- `game.js` — the whole game (canvas rendering, synthesized WebAudio SFX)
- `assets/` — ship, UFO and meteor sprites from [Kenney's Space Shooter](https://kenney.nl/assets/space-shooter) (CC0 — credited anyway)

## Deploy

Any static host works. GitHub Pages is enabled on this repo (`main` branch, `/` root).
