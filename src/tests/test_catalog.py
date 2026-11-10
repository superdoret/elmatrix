import unittest

import _env  # noqa: F401

import catalog
import settings

LEGACY = ["phrases", "word", "clock", "weather", "commands", "images", "tetris"]
NEW = ["rates", "sysinfo", "sports", "worldclock", "countdown", "forecast",
       "notifications", "pixelart"]


class CatalogTest(unittest.TestCase):
    def test_ids_unique_and_complete(self):
        ids = [w.id for w in catalog.WIDGETS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(ids, LEGACY + NEW)

    def test_runnable_target(self):
        for w in catalog.WIDGETS:
            with self.subTest(widget=w.id):
                self.assertTrue(bool(w.script) != bool(w.module), "exactly one of script/module")
                if w.id in NEW:
                    self.assertTrue(w.module.startswith("widgets."))
                self.assertTrue(w.name and w.description and w.category)

    def test_field_integrity(self):
        for w in catalog.WIDGETS:
            keys = [f.key for f in w.settings]
            self.assertEqual(len(keys), len(set(keys)), w.id)
            for f in w.settings:
                with self.subTest(widget=w.id, field=f.key):
                    self.assertIn(f.type, catalog.FIELD_TYPES)
                    self.assertTrue(f.label)
                    if f.type == "select":
                        self.assertTrue(f.options)

    def test_defaults_satisfy_own_schema(self):
        fields = [f for w in catalog.WIDGETS for f in w.settings] + list(settings.GLOBAL_FIELDS)
        for f in fields:
            with self.subTest(field=f.key):
                self.assertEqual(settings.coerce(f, f.default, strict=True), f.default)

    def test_notifications_not_in_rotation(self):
        w = catalog.get("notifications")
        self.assertFalse(w.rotation)
        self.assertFalse(w.default_enabled)

    def test_to_dict_is_json_serialisable(self):
        import json
        data = json.loads(json.dumps(catalog.to_dict()))
        self.assertEqual(len(data["widgets"]), len(catalog.WIDGETS))
        self.assertEqual(catalog.get("nope"), None)


if __name__ == "__main__":
    unittest.main()
