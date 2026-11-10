#!/usr/bin/env python3
"""eLMaTrIx: runs a random display mode forever (replaces the old index.sh).

    sudo python3 main.py [extra panel args]     # real panel (Raspberry Pi)
    python3 simulator/run.py [extra panel args] # on-screen simulator

Extra arguments are appended to every mode, so they override the defaults below.
"""
import os
import random
import runpy
import subprocess
import sys
import time
import traceback

import paths

HERE = paths.BASE_DIR
SIMULATOR = os.environ.get("ELMATRIX_SIMULATOR") == "1"

DEFAULT_ARGS = [
    "--led-cols=64",
    "--led-gpio-mapping=adafruit-hat",
    "--led-slowdown-gpio=4",
    "--led-brightness=30",
]

# (script, extra args), same eight modes as the old index.sh.
MODES = [
    ("positive-phrases.py", []),
    ("text.py", []),
    ("text.py", ["--show-clock=True"]),
    ("weather.py", []),
    ("commands.py", []),
    ("images.py", []),
    ("tetris.py", []),
    ("weather.py", ["--city=Barcelona"]),
]


def run_mode(script, args):
    path = os.path.join(HERE, script)
    if SIMULATOR:
        # One process, one window: the simulated RGBMatrix reuses its display.
        old_argv = sys.argv
        sys.argv = [path] + args
        try:
            runpy.run_path(path, run_name="__main__")
        except SystemExit:
            pass
        except Exception:
            traceback.print_exc()  # a broken mode must not stop the loop
        finally:
            sys.argv = old_argv
    else:
        # A fresh process per mode, like index.sh: the real library wants that.
        subprocess.run([sys.executable, path] + args, cwd=HERE)


def main():
    extra = sys.argv[1:]
    while True:
        script, args = random.choice(MODES)
        print("Running " + script + " " + " ".join(args))
        run_mode(script, DEFAULT_ARGS + args + extra)
        time.sleep(2)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
