# Feature: web-panel-widgets

## Objective
Add 8 new widgets (rates, sysinfo, sports, worldclock, countdown, forecast, notifications/webhook, pixelart)
and a web panel (stdlib only) to see the simulator live, browse a widget catalog, enable/disable
widgets and edit each widget's settings. Existing 7 modes become catalog entries too.

## Constraints / decisions (user-approved scope; defaults chosen by orchestrator)
- No commit (user will test locally first). This overrides the per-task commit step.
- TDD: disabled (no project config). Ordinary functional checks: `cd src && python3 -m unittest discover -s tests -v` + smoke checks below.
- Artifacts in English (code, comments). Web panel UI copy + catalog names/descriptions in Spanish (project is Spanish-facing). README stays Spanish.
- Cross-platform: Ubuntu, Windows 11, macOS, Raspberry Pi. Stdlib + `requirements.txt` only. No API keys.
- Web server default bind 127.0.0.1; `--web-host 0.0.0.0` + `--web-token` (or env ELMATRIX_TOKEN) to expose. Writes need `Content-Type: application/json`; with a token, writes need header `X-Token` or `?token=`.
- Live preview only in simulator mode; on real hardware the panel shows catalog/config/status only (pixels live in the C++ lib).
- Single writer, sequential stages. Heuristic ~400 changed lines/task is advisory only.

## Architecture contract (all under `src/`)
- `settings.py`: JSON store `data/settings.json` (dir overridable with env `ELMATRIX_DATA_DIR`), atomic write (tmp + os.replace), re-read on access (mtime cache ok), thread/process safe.
  API: `get_global()`, `set_global(d)`, `is_enabled(id)`, `set_enabled(id, bool)`, `widget_cfg(id)` (defaults merged, coerced), `set_widget_cfg(id, d)`, `snapshot()`; `SettingsError(ValueError)` on invalid input (unknown key, bad type, out of range).
  Global keys: `pause_seconds` int 0-300 default 2; `brightness` int 1-100 default 30 (hardware only); `order` 'shuffle'|'sequence' default 'shuffle'.
- `catalog.py`: dataclasses `Field(key,label,type,default,help,min,max,step,options)` and `Widget(id,name,description,category,script|module,args,default_enabled,rotation,uses_network,settings)`; `WIDGETS` (ordered), `get(id)`, `to_dict()`.
  Field types: `text`, `number`, `bool`, `select` (options [{value,label}]), `list` (list of strings, one per line in the UI), `color` (#rrggbb).
  `rotation=False` => never picked by the scheduler (only triggered by API).
- `runner.py`: `ModeRunner(simulator, extra_args)`: `run(widget_id, extra_args=())` blocking; `skip()`; `state()`.
  Legacy widgets run as scripts (`script`), new ones as modules (`module`, e.g. `widgets.rates`; subprocess `python -m`, cwd=src; sim `runpy.run_module`).
  Hardware: one subprocess per run (as today), skip = terminate. Simulator: in-process; `install_interruptible_sleep()` replaces `time.sleep` with 50 ms slices raising `SkipRequested(SystemExit)` when the skip flag is set. Args = base args (cols, gpio mapping, slowdown, brightness from settings; simulator forces brightness 100) + widget args + CLI extra args.
- `scheduler.py`: `Scheduler(runner)`: shuffle bag over enabled rotation widgets; `request_run(id)`, `enqueue_notification(message,color,seconds)`, `pause()/resume()/skip()`, `state()`, `loop()`. Priority per slot: pending run-now > notifications (`notifications` widget, args `--message --color --seconds`) > bag. No enabled widget => idle 5 s. Pause between modes from settings.
- `widget_base.py`: `Widget(Base)` helpers (`cfg()`, cached fonts, `draw_text`, `show_message(lines,color,seconds)`, `sleep_frames`, arrows), `run_widget(cls)` entry (Windows asyncio policy). `net.py`: `get_json(url, timeout=8, cache_seconds=0, headers=None)` with disk cache under data dir, stale fallback, `NetError`. Widgets never crash offline: show "Sin conexion".
- `webpanel/server.py` (+ `webpanel/index.html`, single file, vanilla JS, dark theme, no CDN): ThreadingHTTPServer.
  `GET /`, `GET /api/catalog` (widgets + schema + current cfg + enabled), `GET /api/state` (mode, current, queue, paused, panel size), `GET /api/frame` ({available,w,h,data b64 RGB}), `PUT /api/widgets/<id>` ({enabled?,config?}), `PUT /api/settings`, `POST /api/run/<id>`, `POST /api/skip`, `POST /api/pause`, `POST /api/resume`, `POST /api/notify` ({message,color?,seconds?}; 409 if `notifications` disabled).
- Simulator: `Display.snapshot()` stable frame bytes; `simulator/run.py` gains `--no-window` (headless, web only); default opens Tk window + web.
- `main.py`: flags `--web-host`, `--web-port` (8080), `--web-token`, `--no-web`; unknown args pass through to widgets.

## Widget catalog (id: settings)
Legacy: `phrases`, `word` (text.py), `clock` (text.py --show-clock=True), `weather` (city, blank=random), `commands`, `images` (duration), `tetris`.
New (module `widgets.<id>`):
- `rates`: assets list (CoinGecko ids, default bitcoin, ethereum), vs_currency select usd|eur, show_dolar bool, dolar_type select blue|oficial|bolsa|contadoconliqui|tarjeta (dolarapi.com), duration 12. Arrow green/red from 24h change. Cache 60 s.
- `sysinfo`: show_cpu/show_temp/show_ram/show_disk bool, ping_host text `host[:port]` (TCP connect, blank=skip), duration 10. psutil; temp falls back to /sys/class/thermal; "N/A" if unavailable.
- `sports`: team text (default Barcelona), api_key text (default "3"), duration 12. TheSportsDB: last result + next match.
- `worldclock`: zones list `Label|Zone` (default Barcelona|Europe/Madrid, Rosario|America/Argentina/Cordoba, Tokyo|Asia/Tokyo), format24h bool, duration 10. zoneinfo + `tzdata` dep.
- `countdown`: events list `Name|YYYY-MM-DD` (default Ano nuevo|2027-01-01), show_past bool, duration 8.
- `forecast`: city text (default Barcelona), days select 2|3, duration 12. Open-Meteo (geocoding + daily), WMO code -> existing `assets/img/weather/*.PNG` names.
- `notifications` (rotation=False): default_color color, default_seconds number, max_queue number. Script `widgets.notify` scrolls message.
- `pixelart`: style select scene|snake|random, show_clock bool, duration 20. Day/night scene by hour; auto-playing Snake.

## Tasks
- [x] T1 Core (done, writer A, 45 unit tests + headless smoke OK): settings.py, catalog.py (legacy + new specs), runner.py, scheduler.py, main.py refactor, simulator changes, legacy hooks (weather city, images duration), requirements (psutil, tzdata), .gitignore `src/data/`.
- [x] T2 Web server (done, writer A; placeholder index.html pending T4): webpanel/server.py (API, token, JSON-only writes), `--web-*` wiring, minimal tests (settings/catalog/server).
- [x] T3 Widgets (done, writer B; 86 unit tests + smoke 8/8 + scheduler e2e; CoinGecko/TheSportsDB 403 from this sandbox, only offline path + canned JSON verified): widget_base.py, net.py, 8 widgets in `src/widgets/`.
- [x] T4 UI (done, writer C; headless Chrome screenshots, endpoints cross-checked; interactive forms not clicked): webpanel/index.html (sim canvas, catalog cards, enable toggle, generated config forms, global settings, run/skip/pause, notify form).
- [x] T5 README (done; orchestrator spot check: 86 tests OK, server up, catalog 15 widgets). Nothing committed per user request. (Spanish) update, smoke verification, spot check.

- [x] T6 (done, writer D; orchestrator viewed desktop-dark + mobile-light screenshots; interactions not exercised in a browser) (user request after stage C) Visual/UX redesign of `webpanel/index.html` (same API, no backend changes unless a minimal clearly reported fix is needed). Also: web host default now 0.0.0.0 with optional token (done by orchestrator, verified over LAN IP).

- [x] T7 (done, writer E; 117 tests, live curl over localhost + LAN IP, CDP-driven Chrome login flow; orchestrator re-verified) (user request) Web panel requires login: user `admin`; NO baked-in password (public repo, user chose option 2): password from flag/env, else a random one generated on first run and saved in `src/data/web_password` (overridable with `--web-user/--web-password` or env `ELMATRIX_USER/ELMATRIX_PASSWORD`). Server-side session cookie (HttpOnly, SameSite=Strict, random id, expiry) + `/login` page + logout; HTTP Basic accepted too for curl/webhook; replaces the old X-Token mechanism; constant-time compare; failed-login lockout (a 4-digit password is brute-forceable). Runs AFTER T6 (same index.html), as a sequential writer.

## Route declaration
T1+T2: delegated writer A (core + server, 2+ non-trivial files). T3: delegated writer B. T4+T5: delegated writer C. Sequential, one writer at a time.

## Verification
- `cd src && python3 -m unittest discover -s tests -v`
- Headless smoke: `python3 simulator/run.py --no-window --web-port 8099` then curl `/api/catalog`, `/api/state`, `/api/frame`, `PUT /api/widgets/<id>`, `POST /api/notify`.
- Each new widget runs in simulator and lights pixels (tests/smoke_widgets.py, with ELMATRIX_DATA_DIR temp + duration 2).
- NOT verifiable here: Windows, macOS, Raspberry hardware.

## Progress
- Stage A done. Deviations to honour: `paths.data_dir()` (creates dir, honours ELMATRIX_DATA_DIR) must be used by net.py; settings API also has `update_widget(id, enabled, config)`; `forecast.days` is int 2|3; notifications default_enabled=False, max_queue 5; pixelart.style default random; legacy `weather --city=Barcelona` mode removed (blank city = random); POST /api/run/<id> interrupts current widget; extra status codes 401/403/405/413/415/429; GET needs no token; main refuses non-loopback host without token; `catalog` returns `global_fields`+`simulator`.
- Not verified in stage A: Tk window mode, hardware subprocess path, weather city / images duration hooks end to end.
- Engram mirror `odd/web-panel-widgets/tasks`: PENDING (mem_save blocked by hook/auto-mode classifier); local file is source of truth.
- A user's own `simulator/run.py` process (PID 172980) was running before stage A; leave it alone.
