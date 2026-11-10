#!/usr/bin/env python3
"""Run src/main.py against an LED matrix simulator.

Usage (from anywhere, no sudo needed):
    python3 src/simulator/run.py [--no-window] [same arguments as main.py]

By default an on-screen Tk window opens and the web panel is served too.
With --no-window nothing is drawn locally (headless): use the web panel.

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
NO_WINDOW = "--no-window" in args
args = [a for a in args if a != "--no-window"]
sys.argv = [MAIN] + args  # main.py forces brightness 100 in the simulator

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
    if NO_WINDOW:
        # Headless: the scheduler runs in the main thread, the web panel shows the frames.
        try:
            runpy.run_path(MAIN, run_name="__main__")
        except (KeyboardInterrupt, SystemExit):
            pass
        sys.exit(0)

    # Tk must own the main thread, but the window size depends on the options
    # the app passes to RGBMatrix(). Start the app, open the window once the
    # first matrix exists (that happens when the first widget starts).
    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    while not ready.wait(timeout=1):
        if not thread.is_alive():
            print("The application stopped before creating an RGBMatrix (see errors above).")
            sys.exit(1)
    rgbmatrix._display.run_gui(lambda: None)
