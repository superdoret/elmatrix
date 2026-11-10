"""Decides which widget runs next.

Priority per slot: pending run-now requests > queued notifications > the
shuffle bag (or sequence) over enabled rotation widgets. With nothing to run
the scheduler idles. A widget that crashes or is missing is logged and the
loop carries on after a (at least one second) pause.
"""
import collections
import random
import threading
import time
import traceback

import catalog
import settings

IDLE_SECONDS = 5.0
FAILURE_MIN_PAUSE = 1.0
NOTIFICATIONS_ID = "notifications"


class Scheduler(object):
    def __init__(self, runner, rng=None):
        self.runner = runner
        self._rng = rng or random.Random()
        self._lock = threading.RLock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._run_now = collections.deque()       # (widget_id, extra_args)
        self._notifications = collections.deque()  # (message, color, seconds)
        self._bag = []
        self._last = None
        self._last_ok = True
        self._last_error = None
        self._paused = False

    # -- requests -----------------------------------------------------------
    def request_run(self, widget_id):
        """Run a widget as soon as possible (interrupts the current one)."""
        if catalog.get(widget_id) is None:
            raise KeyError(widget_id)
        with self._lock:
            self._run_now.append((widget_id, ()))
        self.runner.skip()
        self._wake.set()

    def enqueue_notification(self, message, color=None, seconds=None):
        """Queue a message. Returns False when the queue is full."""
        cfg = settings.widget_cfg(NOTIFICATIONS_ID)
        with self._lock:
            if len(self._notifications) >= cfg["max_queue"]:
                return False
            self._notifications.append((
                message,
                color or cfg["default_color"],
                seconds if seconds is not None else cfg["default_seconds"],
            ))
        self._wake.set()
        return True

    def pause(self):
        """Stop starting new widgets (the current one finishes)."""
        self._paused = True

    def resume(self):
        self._paused = False
        self._wake.set()

    def skip(self):
        return self.runner.skip()

    def stop(self):
        self._stop.set()
        self._wake.set()
        self.runner.skip()

    # -- selection ----------------------------------------------------------
    def _eligible(self):
        return [w.id for w in catalog.WIDGETS if w.rotation and settings.is_enabled(w.id)]

    def _pick_from_rotation(self):
        eligible = self._eligible()
        if not eligible:
            self._bag = []
            return None
        if settings.get_global()["order"] == "sequence":
            if self._last in eligible:
                return eligible[(eligible.index(self._last) + 1) % len(eligible)]
            return eligible[0]
        self._bag = [i for i in self._bag if i in eligible]
        if not self._bag:
            self._bag = list(eligible)
            self._rng.shuffle(self._bag)
            if len(self._bag) > 1 and self._bag[-1] == self._last:
                # the next pick (pop from the end) would repeat the last widget
                self._bag[0], self._bag[-1] = self._bag[-1], self._bag[0]
        return self._bag.pop()

    def next_job(self):
        """Returns (widget_id, extra_args) or None."""
        with self._lock:
            if self._run_now:
                return self._run_now.popleft()
            if self._notifications:
                if settings.is_enabled(NOTIFICATIONS_ID):
                    message, color, seconds = self._notifications.popleft()
                    return NOTIFICATIONS_ID, (
                        "--message=" + message, "--color=" + color,
                        "--seconds=%s" % seconds)
                self._notifications.clear()  # disabled meanwhile: drop them
            picked = self._pick_from_rotation()
            return (picked, ()) if picked else None

    # -- loop ---------------------------------------------------------------
    def _wait(self, seconds):
        self._wake.wait(seconds)
        self._wake.clear()

    def step(self):
        """One scheduling slot (blocking). Returns the widget id that ran, or None."""
        if self._paused:
            self._wait(0.5)
            return None
        job = self.next_job()
        if job is None:
            self._wait(IDLE_SECONDS)
            return None
        widget_id, extra = job
        try:
            ok = self.runner.run(widget_id, extra)
        except Exception:
            traceback.print_exc()
            ok = False
        with self._lock:
            self._last = widget_id
            self._last_ok = bool(ok)
            self._last_error = None if ok else "El widget '%s' falló" % widget_id
        pause = settings.get_global()["pause_seconds"]
        if not ok:
            pause = max(pause, FAILURE_MIN_PAUSE)
        if pause > 0 and not self._stop.is_set():
            self._wait(pause)
        return widget_id

    def loop(self):
        while not self._stop.is_set():
            try:
                self.step()
            except Exception:
                traceback.print_exc()
                self._wait(1.0)

    # -- info ---------------------------------------------------------------
    def state(self):
        run = self.runner.state()
        current = None
        if run.get("widget"):
            w = catalog.get(run["widget"])
            current = {"id": run["widget"], "name": w.name if w else run["widget"],
                       "started_at": run.get("started_at")}
        with self._lock:
            return {
                "paused": self._paused,
                "current": current,
                "last": self._last,
                "last_ok": self._last_ok,
                "last_error": self._last_error,
                "queue": {"run": [i for i, _ in self._run_now],
                          "notifications": len(self._notifications)},
                "order": settings.get_global()["order"],
                "now": time.time(),
            }
