import random
import unittest

from _env import DataDirTestCase

import catalog
import settings
from scheduler import Scheduler


class FakeRunner(object):
    simulator = True

    def __init__(self, fail=()):
        self.ran = []
        self.fail = set(fail)
        self.skips = 0

    def run(self, widget_id, extra_args=()):
        self.ran.append((widget_id, tuple(extra_args)))
        return widget_id not in self.fail

    def skip(self):
        self.skips += 1

    def state(self):
        return {"running": False, "widget": None, "started_at": None}


class SchedulerTest(DataDirTestCase):
    def setUp(self):
        DataDirTestCase.setUp(self)
        settings.set_global({"pause_seconds": 0})
        self.runner = FakeRunner()
        self.sched = Scheduler(self.runner, rng=random.Random(1))

    def only_enabled(self, *ids):
        for w in catalog.WIDGETS:
            settings.set_enabled(w.id, w.id in ids)

    def test_bag_covers_every_enabled_widget_each_round(self):
        self.only_enabled("word", "clock", "tetris")
        for _ in range(6):
            self.sched.step()
        ran = [r[0] for r in self.runner.ran]
        self.assertEqual(sorted(ran[:3]), ["clock", "tetris", "word"])
        self.assertEqual(sorted(ran[3:]), ["clock", "tetris", "word"])

    def test_sequence_order(self):
        self.only_enabled("word", "clock", "tetris")
        settings.set_global({"order": "sequence"})
        for _ in range(4):
            self.sched.step()
        self.assertEqual([r[0] for r in self.runner.ran], ["word", "clock", "tetris", "word"])

    def test_priority_run_now_then_notification_then_bag(self):
        self.only_enabled("word")
        settings.set_enabled("notifications", True)
        self.assertTrue(self.sched.enqueue_notification("hola", "#ff0000", 3))
        self.sched.request_run("tetris")
        self.assertGreaterEqual(self.runner.skips, 1)
        for _ in range(3):
            self.sched.step()
        self.assertEqual(self.runner.ran, [
            ("tetris", ()),
            ("notifications", ("--message=hola", "--color=#ff0000", "--seconds=3")),
            ("word", ()),
        ])

    def test_run_now_ignores_enabled_flag(self):
        self.only_enabled("word")
        self.sched.request_run("tetris")
        self.sched.step()
        self.assertEqual(self.runner.ran[0][0], "tetris")
        with self.assertRaises(KeyError):
            self.sched.request_run("nope")

    def test_notifications_never_in_rotation(self):
        self.only_enabled("notifications")
        self.assertIsNone(self.sched.next_job())

    def test_notification_queue_limit_and_disabled_drop(self):
        settings.set_enabled("notifications", True)
        settings.set_widget_cfg("notifications", {"max_queue": 2})
        self.assertTrue(self.sched.enqueue_notification("a"))
        self.assertTrue(self.sched.enqueue_notification("b"))
        self.assertFalse(self.sched.enqueue_notification("c"))
        settings.set_enabled("notifications", False)
        self.only_enabled()
        self.assertIsNone(self.sched.next_job())
        self.assertEqual(self.sched.state()["queue"]["notifications"], 0)

    def test_nothing_enabled_returns_none(self):
        self.only_enabled()
        self.assertIsNone(self.sched.next_job())

    def test_survives_failing_widget(self):
        self.runner.fail = {"word"}
        self.only_enabled("word")
        self.sched._wait = lambda s: None  # do not really sleep
        self.sched.step()
        self.sched.step()
        self.assertEqual(len(self.runner.ran), 2)
        self.assertFalse(self.sched.state()["last_ok"])
        self.assertIn("word", self.sched.state()["last_error"])

    def test_pause_resume(self):
        self.only_enabled("word")
        self.sched._wait = lambda s: None
        self.sched.pause()
        self.assertIsNone(self.sched.step())
        self.assertEqual(self.runner.ran, [])
        self.assertTrue(self.sched.state()["paused"])
        self.sched.resume()
        self.assertEqual(self.sched.step(), "word")


if __name__ == "__main__":
    unittest.main()
