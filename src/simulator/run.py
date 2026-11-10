#!/usr/bin/env python3
"""Run src/main.py against an on-screen LED matrix simulator.

Usage (from anywhere, no sudo needed):
    python3 src/simulator/run.py [same arguments as main.py]

The application code is NOT modified: this launcher only puts the simulated
`rgbmatrix` package ahead of the real one on sys.path.
"""
import os
import runpy
import sys
import threading
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
MAIN_DIR = os.path.abspath(os.path.join(HERE, ".."))
MAIN = os.path.join(MAIN_DIR, "main.py")

os.environ["ELMATRIX_SIMULATOR"] = "1"
sys.path.insert(0, HERE)      # simulated rgbmatrix wins
sys.path.insert(1, MAIN_DIR)  # base, models, paths, ...
os.chdir(MAIN_DIR)            # same cwd as `python3 main.py`

args = sys.argv[1:]
if not any(a.startswith("--led-brightness") or a in ("-b",) for a in args):
    args.append("--led-brightness=100")  # 30 looks very dim on a monitor
sys.argv = [MAIN] + args

import rgbmatrix  # noqa: E402  (the simulated one)

ready = threading.Event()
_orig_init = rgbmatrix.RGBMatrix.__init__


def _init(self, options=None):
    _orig_init(self, options)
    ready.set()


rgbmatrix.RGBMatrix.__init__ = _init


def worker():
    try:
        runpy.run_path(MAIN, run_name="__main__")
    except SystemExit:
        pass
    except BaseException:
        traceback.print_exc()
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0)


if __name__ == "__main__":
    # Tk must own the main thread, but the window size depends on the options
    # the app passes to RGBMatrix(). Start the app, open the window once the
    # first matrix exists.
    threading.Thread(target=worker, daemon=True).start()
    if not ready.wait(timeout=60):
        print("The application never created an RGBMatrix (see errors above).")
        sys.exit(1)
    rgbmatrix._display.run_gui(lambda: None)
