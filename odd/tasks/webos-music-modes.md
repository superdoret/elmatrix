# Feature: webos-music-modes

## Objective
Extend the webOS TV app (`webos/`, already merged in PR #2) with:
1. Soft background music in every mode.
2. A Christmas pixel-art mode with its own soft, ambient Christmas music.
3. More modes (widgets).

## Decisions (orchestrator defaults, user may change)
- Music source: SomaFM internet radio (128k MP3 via an `<audio>` element routed through the Web Audio master chain) is the
  default for the ambient background (`music_source` = stream | synth, `music_station`); the procedural Web Audio synth
  (no audio files) is the offline fallback (auto after 3 failed connects / offline, background retry every 3 min).
  Christmas track default = synthesized public-domain carols regardless of `music_source` (`christmas_source` = carols |
  radio, the radio option is SomaFM Christmas Lounge, labelled honestly as lounge). Station URLs live in one table
  (`js/music/stations.js`). SomaFM terms NOT formally reviewed (personal use). Synth details: Ambient synth pads + soft bell/music-box voices through a generated reverb/delay.
  Christmas track = public-domain carols (Silent Night, Away in a Manger, O Christmas Tree, Jingle Bells, We Wish You a
  Merry Christmas) re-arranged slowly and softly. Tradeoff: synthesized sound, not recorded music.
- Background music plays across all modes (generative ambient, slowly evolving, never loud). A widget can request a
  different track; the engine crossfades to it and back (Christmas mode -> christmas track).
- Controls: music on/off and volume in the settings screen (persisted); a remote key to mute/unmute (blue). TV volume is
  still the TV's own.
- Autoplay: try to start on load; if the engine is suspended (newer WebKit/Chromium policies), start on the first key
  press and show a small hint.
- New modes (Spanish names): Lluvia Matrix, Chimenea, Acuario, Fuegos artificiales, Plasma, Juego de la vida,
  Estrellas (starfield), Visualizador de musica (spectrum from the audio analyser). Christmas = a new `navidad` style of the
  `pixelart` widget (snow, tree with blinking lights, ornaments) that selects the christmas track.
- Must keep working on webOS 3.x (Chromium 38): ES5 build, Web Audio 'webkitAudioContext' fallback, no `suspend/resume`
  (use gain), no AudioWorklet.
- Artifacts in English (code), UI copy and README in Spanish.
- Branch `feat/webos-music-modes` from origin/main. Writer does NOT commit; the orchestrator commits work units.
- TDD disabled. Checks: `cd webos && node --test`, ES5 guards on `dist/`, headless Chrome screenshots.
- NOT verifiable here: how it sounds on the real TV (no audio device/ears), TV performance, Chromium 38 execution
  (the user's TV is the test bed through the inspector).

## Tasks
- [x] T5 Audio engine (+ radio streaming with synth fallback): Web Audio graph (master gain, reverb, delay), generative ambient track, track switching with
      crossfade, mute/volume, settings + key, autoplay fallback hint. Pure sequencing logic unit-tested with a fake context.
- [x] T6 Christmas: `navidad` pixelart style + christmas music track (public-domain carols, soft arrangement).
- [x] T7 New modes: matrix rain, fireplace, aquarium, fireworks, plasma, game of life, starfield, music visualizer.
- [x] T8 README + catalog/settings updates + verification pass.

## Route declaration
T5-T8: delegated writer (agent a0e6ac3, has full context of `webos/`). Single writer, sequential.

## Progress
- T5-T8 implemented and committed (4 work-unit commits on feat/webos-music-modes). Verified by unit tests and screenshots;
  sound, the live radio stream and Chromium 38 execution are NOT verified. Review: not run (see PR). Engram mirror: pending.

## Verification (observed, writer)
- `cd webos && node --test`: 175 pass (audio engine with fake AudioContext/clock, stream state machine, carol sequencing, 8 new modes' logic, ES5 guards on dist).
- `npm run build` ok; dist rendered in headless Chrome; key flow (blue mute, settings rows, station change, navidad requests the christmas track) with no console errors.
- Live SomaFM: first request with a browser UA returned 200 audio/mpeg, later requests from this sandbox got 403 (curl and headless Chrome), so
  stream playback itself was NOT confirmed here; the failure path (connect -> backoff -> fallback to synth) was observed live in headless Chrome.
- NOT verified: sound quality (nobody listened), TV performance, Chromium 38 execution.

## Update T9-T11 (observed on the real TV by the coordinator, then implemented)
- webOS 3: Web Audio output is SILENT, WAV unsupported in <audio>, MP3 works. So: all audible output is ONE <audio> element (MP3);
  the synth runs offline in Node (`tools/lib/offline-synth.js`, `npm run render-music`, needs ffmpeg) and is shipped as
  `assets/music/ambient.mp3` + `christmas.mp3` (~2.2 MB each, 64 kbps mono 32 kHz). Sources: `stream` (SomaFM / Kiss FM, plain URLs) and
  `incluida` (bundled MP3). Radio failure -> bundled MP3 (sequential fade-out/swap/fade-in, never two elements). Web Audio is only an optional
  analyser tap off-TV; visualizer simulates when silent/unavailable.
- T10: credit line "Desarrollado por Matias Toro" in index.html (`#credit.byline`), bottom strip reserved by the renderer (6.5 %).
- T11: Kiss FM España added as a selectable background station (commercial, ads; default stays SomaFM Drone Zone).
- NOT verified: playing the bundled MP3 as a local file on the TV, how anything sounds, Kiss FM/SomaFM terms (not reviewed).
- T12: bottom line = credit (left) + version (right, `vX.Y.Z`); version source of truth = `appinfo.json` (1.1.0), injected into dist/index.html by the build, read at runtime in dev; package.json/lock kept in sync by a test; settings credit line also shows it.
- T13: pin current mode (Green / settings row "Fijar modo actual"): central in `ctx.loop` (pinned = infinite duration; `ctx.loopFixed` for one-shot content) + scheduler (`setPin`, re-run without gap, history dedupe); session-only; "Fijo" tag in the bottom bar; tests incl. 3 simulated minutes per widget (no blank frames, animation continues, heap growth < 15 MB). Green key code 404 NOT verified on the physical remote.
- T14: level matching: per-station `trim` (Kiss 1.0 reference; SomaFM 0.7 = UNMEASURED guess) + per-station user level (settings row "Nivel de esta estación", 50..100 % step 5, `settings.global.station_levels`, key = station id or `bundled`); element.volume = fade x volume x trim x level, <= 1.0. Bundled MP3s re-rendered at -14.6 dB RMS target: ambient -16.1 LUFS / peak -4.2 dBFS, christmas -15.9 LUFS / -3.4 dBFS (ebur128). NOT verified: how it sounds on the TV (0.7 is to be tuned by ear).
