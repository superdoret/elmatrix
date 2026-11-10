# Feature: webos-tv-app

## Objective
A native LG webOS TV app (packaged web app, HTML5 Canvas) that looks and behaves like the eLMaTrIx LED
banner (dot-matrix look, widgets rotating), but uses the TV's full 16:9 area: a larger virtual matrix
instead of 64x32.

## Decisions (orchestrator defaults, user may change)
- Standalone app: no Raspberry needed. Widgets are re-implemented in JS and fetch public APIs directly
  (dolarapi.com, Open-Meteo, CoinGecko, TheSportsDB; all CORS-enabled). Same widget ids/names as the catalog.
- Virtual matrix 16:9 (target 192x108 LEDs at 1920x1080, 10 px cells); text uses the existing BDF fonts
  (`src/assets/fonts`), parsed at runtime, with integer scaling for legibility on a TV.
- Remote-control UX: arrows/OK/Back/color keys; a settings screen on the TV (enable/disable widgets,
  pause seconds, widget options); settings stored in localStorage.
- Not in v1: hardware-only widgets (sysinfo, commands), GIF images, webhook notifications, syncing
  with the Raspberry panel. Tetris is a stretch goal.
- Artifacts in English (code/comments), UI copy and README in Spanish.
- Branch `feat/webos-tv-app` (from feat/v1). **No commit** (user request; overrides per-task commit step).
- TDD: disabled (no project config). Ordinary functional checks: `node --test` unit tests for pure logic,
  headless Chrome screenshots, appinfo.json validation.
- NOT verifiable here: real LG TV, webOS browser engine quirks, `ares-package`/`ares-install` (CLI not installed).

## Layout (all under `webos/`)
`appinfo.json`, `index.html`, `css/`, `js/` (matrix renderer, bdf font parser, scheduler, settings, widgets/,
remote-key handling, settings UI), `assets/fonts/` (copied BDF), icons (80x80, 130x130), `tests/`, `README.md` (Spanish).

## Tasks
- [x] T1 Core: appinfo + shell + LED matrix renderer + BDF parser + scheduler + settings store + remote keys + settings screen.
- [x] T2 Widgets (Tetris not done: stretch): clock, worldclock, countdown, rates, forecast, sports, phrases, word, pixelart (scene + snake); offline-safe.
- [x] T3 README (Spanish: build with webOS CLI, install on TV in Developer Mode) + verification pass.
- [x] T4 ES5 build for webOS 3.x (Chromium 38): Babel build to `webos/dist`, polyfills, Intl zone fallback, CSS without var()/gap/inset; guard tests. TV-engine run NOT verified.

## Route declaration
T1-T3: one delegated writer (2+ non-trivial files, preparation reading). Single writer, sequential.

## Progress
- Branch created, nothing committed. Engram mirror `odd/webos-tv-app/tasks`: pending.

## Verification (observed)
- `cd webos && node --test`: 76 tests pass (`node --test webos/tests` fails on Node 25: directories are not accepted).
- Headless Chrome screenshots of all widgets, settings, keyboard, offline, 720p, file:// font fallback; CDP key-flow check; no console errors on load.
- Not verified: real TV, webOS engine, ares CLI, TV performance.
- T4: `npm run build` ok; `node --test` 90 pass (acorn ES5 parse of dist, forbidden API/CSS guards, zone table vs Intl, compat polyfills); dist rendered in modern headless Chrome, no console errors. Chromium 38 not run locally.
