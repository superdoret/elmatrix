import json
import os

from _env import DataDirTestCase

import settings
from settings import SettingsError


class SettingsTest(DataDirTestCase):
    def test_defaults(self):
        self.assertEqual(settings.get_global(),
                         {"pause_seconds": 2, "brightness": 30, "order": "shuffle"})
        self.assertTrue(settings.is_enabled("word"))
        self.assertFalse(settings.is_enabled("notifications"))
        self.assertFalse(settings.is_enabled("nope"))
        self.assertEqual(settings.widget_cfg("images"), {"duration": 30})
        self.assertEqual(settings.widget_cfg("rates")["assets"], ["bitcoin", "ethereum"])

    def test_no_file_until_first_write(self):
        settings.get_global()
        self.assertFalse(os.path.exists(os.path.join(self.data_dir, "settings.json")))

    def test_coercion(self):
        settings.set_widget_cfg("images", {"duration": "45"})
        self.assertEqual(settings.widget_cfg("images")["duration"], 45)
        cfg = settings.set_widget_cfg("forecast", {"days": "2", "city": "  Rosario "})
        self.assertEqual(cfg["days"], 2)
        self.assertEqual(cfg["city"], "Rosario")
        cfg = settings.set_widget_cfg("rates", {"assets": "bitcoin\n\n solana \n", "show_dolar": "false"})
        self.assertEqual(cfg["assets"], ["bitcoin", "solana"])
        self.assertIs(cfg["show_dolar"], False)
        cfg = settings.set_widget_cfg("notifications", {"default_color": "#FF00AA"})
        self.assertEqual(cfg["default_color"], "#ff00aa")

    def test_invalid_input(self):
        bad = [
            ("images", {"duration": 1}),            # below min
            ("images", {"duration": 9999}),         # above max
            ("images", {"duration": "abc"}),
            ("images", {"duration": True}),
            ("images", {"duration": 10.5}),         # integer field
            ("images", {"nope": 1}),                # unknown key
            ("forecast", {"days": 5}),              # not an option
            ("rates", {"show_dolar": "maybe"}),
            ("rates", {"assets": 5}),
            ("notifications", {"default_color": "red"}),
            ("word", "not a dict"),
        ]
        for widget_id, values in bad:
            with self.subTest(widget=widget_id, values=values):
                with self.assertRaises(SettingsError):
                    settings.set_widget_cfg(widget_id, values)
        with self.assertRaises(SettingsError):
            settings.set_global({"brightness": 0})
        with self.assertRaises(SettingsError):
            settings.set_global({"order": "random"})
        with self.assertRaises(SettingsError):
            settings.set_global({"unknown": 1})
        with self.assertRaises(SettingsError):
            settings.set_enabled("nope", True)
        with self.assertRaises(SettingsError):
            settings.update_widget("word", enabled="yes")
        self.assertIsInstance(SettingsError("x"), ValueError)

    def test_failed_update_changes_nothing(self):
        with self.assertRaises(SettingsError):
            settings.update_widget("images", enabled=False, config={"duration": 1})
        self.assertTrue(settings.is_enabled("images"))
        self.assertEqual(settings.widget_cfg("images")["duration"], 30)

    def test_persistence_and_atomic_write(self):
        settings.set_enabled("word", False)
        settings.set_global({"pause_seconds": 7, "order": "sequence"})
        settings.set_widget_cfg("weather", {"city": "Madrid"})
        path = os.path.join(self.data_dir, "settings.json")
        with open(path, encoding="utf-8") as fh:
            stored = json.load(fh)
        self.assertEqual(stored["global"]["pause_seconds"], 7)
        self.assertEqual(stored["widgets"]["word"]["enabled"], False)
        self.assertEqual(settings.widget_cfg("weather")["city"], "Madrid")
        # no temp files left behind
        self.assertEqual(os.listdir(self.data_dir), ["settings.json"])

    def test_external_edit_is_seen(self):
        settings.set_global({"pause_seconds": 3})
        path = os.path.join(self.data_dir, "settings.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"global": {"pause_seconds": 11}}, fh)
        self.assertEqual(settings.get_global()["pause_seconds"], 11)

    def test_corrupt_file_falls_back_to_defaults(self):
        path = os.path.join(self.data_dir, "settings.json")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("{not json")
        self.assertEqual(settings.get_global()["pause_seconds"], 2)
        settings.set_global({"pause_seconds": 4})  # recovers by rewriting
        self.assertEqual(settings.get_global()["pause_seconds"], 4)

    def test_stored_garbage_is_ignored(self):
        path = os.path.join(self.data_dir, "settings.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"global": {"brightness": 5000, "bogus": 1},
                       "widgets": {"images": {"enabled": "x", "config": {"duration": "zzz"}}}}, fh)
        self.assertEqual(settings.get_global()["brightness"], 30)
        self.assertEqual(settings.widget_cfg("images")["duration"], 30)
        self.assertTrue(settings.is_enabled("images"))

    def test_snapshot(self):
        snap = settings.snapshot()
        self.assertIn("global", snap)
        self.assertEqual(set(snap["widgets"]), {w.id for w in __import__("catalog").WIDGETS})


if __name__ == "__main__":
    import unittest
    unittest.main()
