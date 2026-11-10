#!/usr/bin/env python3
"""Runs every new widget in the headless simulator and prints a PASS/FAIL table.

Not a unit test (the name does not match `test*.py`):
    cd src && python3 tests/smoke_widgets.py [widget_id ...]

Each widget runs for ~3 s with a temp data dir. PASS = no exception and at
least one lit pixel was seen. Network widgets that are offline show the "Sin
conexion" frame, which counts as PASS (the column says what happened).
"""
import os
import runpy
import shutil
import sys
import tempfile
import threading
import time
import traceback

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.environ["ELMATRIX_SIMULATOR"] = "1"
DATA = tempfile.mkdtemp(prefix="elmatrix-smoke-")
os.environ["ELMATRIX_DATA_DIR"] = DATA
sys.path.insert(0, os.path.join(SRC, "simulator"))  # simulated rgbmatrix first
sys.path.insert(1, SRC)
os.chdir(SRC)

import paths  # noqa: E402,F401
import catalog  # noqa: E402
import net  # noqa: E402
import settings  # noqa: E402
import rgbmatrix  # noqa: E402

BASE_ARGS = ["--led-cols=64", "--led-gpio-mapping=adafruit-hat", "--led-brightness=100"]
EXTRA_ARGS = {"notifications": ["--message=Hola desde el smoke test, mensaje largo para scroll",
                                "--color=#00ff88", "--seconds=3"]}
DURATION = 3


def lit_pixels():
    display = getattr(rgbmatrix, "_display", None)
    if display is None:
        return 0
    _, _, data = display.snapshot()
    return sum(1 for i in range(0, len(data), 3) if data[i] or data[i + 1] or data[i + 2])


def run_one(widget):
    net_stats = {"ok": 0, "fail": 0}
    real_get = net.get_json

    def counting_get(*args, **kwargs):
        try:
            result = real_get(*args, **kwargs)
        except net.NetError:
            net_stats["fail"] += 1
            raise
        net_stats["ok"] += 1
        return result

    net.get_json = counting_get
    samples = []
    stop = threading.Event()

    def sampler():
        while not stop.is_set():
            samples.append(lit_pixels())
            time.sleep(0.2)

    error = None
    if any(f.key == "duration" for f in widget.settings):
        settings.set_widget_cfg(widget.id, {"duration": DURATION})
    sys.argv = [widget.module] + BASE_ARGS + EXTRA_ARGS.get(widget.id, [])
    thread = threading.Thread(target=sampler, daemon=True)
    thread.start()
    started = time.monotonic()
    try:
        runpy.run_module(widget.module, run_name="__main__", alter_sys=True)
    except SystemExit as ex:
        if ex.code not in (None, 0):
            error = "SystemExit(%r)" % (ex.code,)
    except BaseException:
        error = traceback.format_exc().strip().splitlines()[-1]
        traceback.print_exc()
    finally:
        took = time.monotonic() - started
        stop.set()
        thread.join()
        net.get_json = real_get
    if not widget.uses_network:
        mode = "n/a"
    elif net_stats["fail"] and not net_stats["ok"]:
        mode = "offline"
    elif net_stats["fail"]:
        mode = "partial"
    else:
        mode = "online"
    peak = max(samples) if samples else 0
    ok = error is None and peak > 0
    return ok, peak, mode, took, error


def main():
    wanted = sys.argv[1:]
    widgets = [w for w in catalog.WIDGETS if w.module and (not wanted or w.id in wanted)]
    print("%-14s %-6s %8s %-8s %6s  %s" % ("widget", "result", "lit px", "network", "secs", "error"))
    failures = 0
    try:
        for w in widgets:
            ok, peak, mode, took, error = run_one(w)
            failures += 0 if ok else 1
            print("%-14s %-6s %8d %-8s %6.1f  %s" % (w.id, "PASS" if ok else "FAIL", peak, mode,
                                                    took, error or ""))
            sys.stdout.flush()
    finally:
        shutil.rmtree(DATA, ignore_errors=True)
    print("%d widget(s), %d failure(s)" % (len(widgets), failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
