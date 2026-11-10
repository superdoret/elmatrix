"""Runs one widget at a time, on real hardware or inside the simulator.

Hardware: one subprocess per run (the real rgbmatrix library wants that);
skip() terminates it.
Simulator: in-process (the simulated RGBMatrix reuses one display); skip() sets
a flag and the patched time.sleep raises SkipRequested in the running thread.
"""
import os
import runpy
import subprocess
import sys
import threading
import time
import traceback

import catalog
import paths
import settings

HERE = paths.BASE_DIR

BASE_ARGS = (
    "--led-cols=64",
    "--led-gpio-mapping=adafruit-hat",
    "--led-slowdown-gpio=4",
)
SLEEP_SLICE = 0.05


class SkipRequested(SystemExit):
    """Raised inside a widget (simulator) when the user asks to skip it."""

    def __init__(self):
        SystemExit.__init__(self, 0)


# --- interruptible sleep (simulator) ---------------------------------------
_skip_flag = threading.Event()
_active = {"thread": None}
_real_sleep = time.sleep
_installed = False


def _interruptible_sleep(seconds):
    me = threading.current_thread()
    end = time.monotonic() + max(0.0, seconds)
    while True:
        if _active["thread"] is me and _skip_flag.is_set():
            raise SkipRequested()
        remaining = end - time.monotonic()
        if remaining <= 0:
            return
        _real_sleep(min(SLEEP_SLICE, remaining))


def install_interruptible_sleep():
    """Replace time.sleep with a version that can be interrupted by skip()."""
    global _installed
    if not _installed:
        time.sleep = _interruptible_sleep
        _installed = True


def _arg_int(args, name, default):
    prefix = name + "="
    value = default
    for a in args:
        if a.startswith(prefix):
            try:
                value = int(a[len(prefix):])
            except ValueError:
                pass
    return value


class ModeRunner(object):
    def __init__(self, simulator=False, extra_args=()):
        self.simulator = bool(simulator)
        self.extra_args = list(extra_args)
        self._lock = threading.Lock()
        self._current = None      # widget id while running
        self._started = None
        self._proc = None
        self._skip_requested_at = None
        if self.simulator:
            install_interruptible_sleep()

    # -- info ---------------------------------------------------------------
    def state(self):
        with self._lock:
            return {"running": self._current is not None,
                    "widget": self._current,
                    "started_at": self._started}

    def panel_size(self):
        args = self.build_base_args() + self.extra_args
        cols = _arg_int(args, "--led-cols", 32) * _arg_int(args, "--led-chain", 1)
        rows = _arg_int(args, "--led-rows", 32) * _arg_int(args, "--led-parallel", 1)
        return cols, rows

    def build_base_args(self):
        brightness = 100 if self.simulator else settings.get_global()["brightness"]
        return list(BASE_ARGS) + ["--led-brightness=%d" % brightness]

    def build_args(self, widget, extra_args=()):
        return (self.build_base_args() + list(widget.args)
                + self.extra_args + list(extra_args))

    # -- control ------------------------------------------------------------
    def skip(self):
        with self._lock:
            if self._current is None:
                return False
            proc = self._proc
        if self.simulator:
            _skip_flag.set()
        elif proc is not None:
            self._skip_requested_at = time.monotonic()
            try:
                proc.terminate()
            except OSError:
                pass
        return True

    def run(self, widget_id, extra_args=()):
        """Run a widget until it ends or is skipped. Returns False if it failed."""
        widget = catalog.get(widget_id)
        if widget is None or not (widget.script or widget.module):
            print("runner: unknown widget %r" % (widget_id,))
            return False
        args = self.build_args(widget, extra_args)
        label = widget.script or widget.module
        print("Running " + label + " " + " ".join(args))
        with self._lock:
            self._current = widget_id
            self._started = time.time()
        try:
            if self.simulator:
                return self._run_in_process(widget, args)
            return self._run_subprocess(widget, args)
        finally:
            with self._lock:
                self._current = None
                self._started = None
                self._proc = None

    # -- implementations ----------------------------------------------------
    def _run_in_process(self, widget, args):
        if HERE not in sys.path:
            sys.path.insert(0, HERE)
        old_argv = sys.argv
        _skip_flag.clear()
        _active["thread"] = threading.current_thread()
        ok = True
        try:
            if widget.script:
                path = os.path.join(HERE, widget.script)
                sys.argv = [path] + args
                runpy.run_path(path, run_name="__main__")
            else:
                sys.argv = [widget.module] + args
                runpy.run_module(widget.module, run_name="__main__", alter_sys=True)
        except SkipRequested:
            pass
        except SystemExit as ex:
            ok = ex.code in (None, 0)
            if not ok:
                print("runner: %s exited with %r" % (widget.id, ex.code))
        except Exception:
            traceback.print_exc()  # a broken widget must not stop the loop
            ok = False
        finally:
            _active["thread"] = None
            _skip_flag.clear()
            sys.argv = old_argv
        return ok

    def _run_subprocess(self, widget, args):
        if widget.script:
            cmd = [sys.executable, os.path.join(HERE, widget.script)] + args
        else:
            cmd = [sys.executable, "-m", widget.module] + args
        try:
            proc = subprocess.Popen(cmd, cwd=HERE)
        except OSError as ex:
            print("runner: cannot start %s: %s" % (widget.id, ex))
            return False
        with self._lock:
            self._proc = proc
        self._skip_requested_at = None
        while True:
            try:
                code = proc.wait(timeout=0.2)
                break
            except subprocess.TimeoutExpired:
                at = self._skip_requested_at
                if at is not None and time.monotonic() - at > 2.0:
                    proc.kill()  # terminate() was ignored
                continue
            except KeyboardInterrupt:
                proc.terminate()
                raise
        skipped = self._skip_requested_at is not None
        if code != 0 and not skipped:
            print("runner: %s exited with code %r" % (widget.id, code))
        return code == 0 or skipped
