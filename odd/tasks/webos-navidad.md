# Feature: webos-navidad

## Objective
Many more Christmas pixel-art scenes in the webOS TV app (today there is a single `navidad` style inside the
`pixelart` widget).

## Decisions (orchestrator defaults, user may change)
- New widget `navidad` ("Navidad", gallery) that cycles through many animated scenes on the 16:9 LED grid; every
  scene is procedural pixel art (no image files), deterministic with a seed, ES5/Chromium 38 safe.
- The existing `pixelart` style `navidad` is kept (it becomes one of the gallery scenes or keeps working as is).
- The gallery requests the christmas music track for as long as it runs; pin (green key) works through `ctx.loop`.
- Settings: duration per scene, order (aleatorio | secuencial), and a per-scene on/off list.
- Branch `feat/webos-navidad` from origin/main (2e1b0b8). Writer does NOT commit; the orchestrator commits.
- Artifacts in English (code), UI copy and README in Spanish. TDD disabled.
- Checks: `cd webos && node --test`, `npm run build` (ES5 guards), headless Chrome screenshots of every scene at
  1920x1080 and 1280x720, frame-time numbers. NOT verifiable here: how it looks/performs on the real TV.

## Tasks
- [x] T15 Scene framework + widget registration (catalog, settings, music request, order/duration).
- [x] T16 At least 12 scenes (see brief) with polished pixel art and animation.
- [x] T17 Tests, README, verification pass (screenshots of every scene).

## Route declaration
T15-T17: delegated writer (agent a0e6ac3, has the full context of `webos/`). Single writer, sequential.

## Progress
- Branch created. Nothing implemented yet. Engram mirror: pending.

## Update (writer)
- Widget `navidad` (`js/widgets/navidad.js`) + `js/widgets/navidad/{lib,scenes-a,scenes-b,scenes-c}.js`: 15 scenes registered in `E.navidadScenes`
  (arbol, muneco, santa, chimenea, belen, reyes, pueblo, jengibre, globo, corona, aurora, pinguinos, chocolate, bolas, anonuevo).
- Design decisions: a run plays `scenes_per_visit` (default 4) scenes then returns to the rotation (not the whole gallery); scenes use a 192x100 design grid
  centred in the framebuffer (Pen); fade through dark between scenes; pin via ctx.loop (no extra code); `?scene=<id>` URL param = dev screenshots.
- Verified: node --test 295 pass; npm run build ok; screenshots of all scenes viewed. NOT verified: look/performance on the real TV, taste.
