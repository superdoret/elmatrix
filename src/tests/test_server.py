import base64
import http.client
import json
import unittest

from _env import DataDirTestCase

import settings
from webpanel.server import PanelServer, MAX_BODY


class FakeRunner(object):
    def panel_size(self):
        return 64, 32


class FakeScheduler(object):
    def __init__(self):
        self.calls = []
        self.notifications = []
        self.full = False

    def state(self):
        return {"paused": False, "current": None,
                "queue": {"run": [], "notifications": len(self.notifications)}}

    def request_run(self, widget_id):
        self.calls.append(("run", widget_id))

    def enqueue_notification(self, message, color=None, seconds=None):
        if self.full:
            return False
        self.notifications.append((message, color, seconds))
        return True

    def skip(self):
        self.calls.append("skip")

    def pause(self):
        self.calls.append("pause")

    def resume(self):
        self.calls.append("resume")


JSON = {"Content-Type": "application/json"}
BASIC = {"Authorization": "Basic " + base64.b64encode(b"admin:test-pass-1234").decode("ascii")}


class ServerBase(DataDirTestCase):
    frame = None

    def setUp(self):
        DataDirTestCase.setUp(self)
        self.sched = FakeScheduler()
        self.panel = PanelServer(self.sched, FakeRunner(), host="127.0.0.1", port=0,
                                 password="test-pass-1234", frame_provider=lambda: self.frame,
                                 simulator=True)
        self.panel.start()
        self.addCleanup(self.panel.stop)

    def call(self, method, path, body=None, headers=None, raw=None, auth=True):
        """Authenticated by default (HTTP Basic with the default credentials)."""
        headers = dict(JSON if headers is None else headers)
        if auth:
            headers.update(BASIC)
        conn = http.client.HTTPConnection("127.0.0.1", self.panel.port, timeout=5)
        try:
            data = raw if raw is not None else (json.dumps(body) if body is not None else None)
            conn.request(method, path, body=data, headers=headers)
            resp = conn.getresponse()
            payload = resp.read()
            ctype = resp.getheader("Content-Type", "")
            parsed = json.loads(payload) if "json" in ctype else payload
            return resp.status, parsed
        finally:
            conn.close()


class ReadApiTest(ServerBase):
    def test_index_page(self):
        status, body = self.call("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"<html", body.lower())

    def test_catalog(self):
        status, body = self.call("GET", "/api/catalog")
        self.assertEqual(status, 200)
        ids = [w["id"] for w in body["widgets"]]
        self.assertIn("rates", ids)
        word = next(w for w in body["widgets"] if w["id"] == "word")
        self.assertTrue(word["enabled"])
        self.assertEqual(word["config"], {})
        images = next(w for w in body["widgets"] if w["id"] == "images")
        self.assertEqual(images["config"], {"duration": 30})
        self.assertEqual(images["settings"][0]["key"], "duration")
        self.assertEqual(body["global"]["pause_seconds"], 2)
        self.assertTrue(body["global_fields"])

    def test_state(self):
        status, body = self.call("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(body["panel"], {"w": 64, "h": 32})
        self.assertFalse(body["notifications_enabled"])
        self.assertFalse(body["paused"])

    def test_frame(self):
        status, body = self.call("GET", "/api/frame")
        self.assertEqual(status, 200)
        self.assertFalse(body["available"])
        self.frame = (2, 1, bytes([255, 0, 0, 0, 255, 0]))
        status, body = self.call("GET", "/api/frame")
        self.assertTrue(body["available"])
        self.assertEqual((body["w"], body["h"]), (2, 1))
        self.assertEqual(base64.b64decode(body["data"]), bytes([255, 0, 0, 0, 255, 0]))

    def test_unknown_route_and_method(self):
        self.assertEqual(self.call("GET", "/api/nope")[0], 404)
        self.assertEqual(self.call("POST", "/api/catalog", {})[0], 405)
        self.assertEqual(self.call("DELETE", "/api/catalog")[0], 405)
        status, body = self.call("GET", "/api/nope")
        self.assertIn("error", body)

    def test_foreign_host_header_rejected(self):
        status, _ = self.call("GET", "/api/state", headers={"Host": "evil.example.com"})
        self.assertEqual(status, 403)


class WriteApiTest(ServerBase):
    def test_put_widget(self):
        status, body = self.call("PUT", "/api/widgets/word", {"enabled": False})
        self.assertEqual(status, 200)
        self.assertFalse(body["enabled"])
        self.assertFalse(settings.is_enabled("word"))
        status, body = self.call("PUT", "/api/widgets/images",
                                 {"enabled": True, "config": {"duration": "20"}})
        self.assertEqual(status, 200)
        self.assertEqual(body["config"]["duration"], 20)

    def test_put_widget_errors(self):
        self.assertEqual(self.call("PUT", "/api/widgets/nope", {"enabled": True})[0], 404)
        for bad in ({"config": {"duration": 1}}, {"config": {"zzz": 1}}, {"enabled": "yes"},
                    {"other": 1}, [1, 2]):
            with self.subTest(bad=bad):
                status, body = self.call("PUT", "/api/widgets/images", bad)
                self.assertEqual(status, 400)
                self.assertIn("error", body)
        self.assertEqual(settings.widget_cfg("images")["duration"], 30)

    def test_invalid_json(self):
        status, body = self.call("PUT", "/api/widgets/word", raw="{nope")
        self.assertEqual(status, 400)
        self.assertIn("error", body)

    def test_put_settings(self):
        status, body = self.call("PUT", "/api/settings", {"pause_seconds": 5})
        self.assertEqual(status, 200)
        self.assertEqual(body["global"]["pause_seconds"], 5)
        self.assertEqual(self.call("PUT", "/api/settings", {"brightness": 500})[0], 400)
        self.assertEqual(self.call("PUT", "/api/settings", {"x": 1})[0], 400)

    def test_content_type_required(self):
        for headers in ({}, {"Content-Type": "text/plain"},
                        {"Content-Type": "application/x-www-form-urlencoded"}):
            with self.subTest(headers=headers):
                status, _ = self.call("PUT", "/api/widgets/word", raw='{"enabled": false}',
                                      headers=headers)
                self.assertEqual(status, 415)
        self.assertTrue(settings.is_enabled("word"))
        self.assertEqual(self.call("POST", "/api/skip", headers={})[0], 415)
        self.assertNotIn("skip", self.sched.calls)

    def test_charset_in_content_type_ok(self):
        status, _ = self.call("POST", "/api/skip", {},
                              headers={"Content-Type": "application/json; charset=utf-8"})
        self.assertEqual(status, 200)

    def test_body_too_large(self):
        status, _ = self.call("PUT", "/api/settings", raw=" " * (MAX_BODY + 1))
        self.assertEqual(status, 413)

    def test_run_skip_pause_resume(self):
        self.assertEqual(self.call("POST", "/api/run/tetris", {})[0], 200)
        self.assertEqual(self.call("POST", "/api/run/nope", {})[0], 404)
        for action in ("skip", "pause", "resume"):
            status, body = self.call("POST", "/api/" + action, {})
            self.assertEqual(status, 200)
            self.assertTrue(body["ok"])
        self.assertEqual(self.sched.calls, [("run", "tetris"), "skip", "pause", "resume"])

    def test_empty_body_post_ok(self):
        self.assertEqual(self.call("POST", "/api/skip", raw="")[0], 200)

    def test_notify(self):
        body = {"message": "hola", "color": "#00ff00", "seconds": 5}
        status, resp = self.call("POST", "/api/notify", body)
        self.assertEqual(status, 409)
        self.assertIn("error", resp)
        self.assertEqual(self.sched.notifications, [])
        settings.set_enabled("notifications", True)
        status, resp = self.call("POST", "/api/notify", body)
        self.assertEqual(status, 200)
        self.assertEqual(self.sched.notifications, [("hola", "#00ff00", 5)])
        status, _ = self.call("POST", "/api/notify", {"message": "solo texto"})
        self.assertEqual(self.sched.notifications[-1], ("solo texto", None, None))

    def test_notify_validation(self):
        settings.set_enabled("notifications", True)
        for bad in ({}, {"message": ""}, {"message": 5}, {"message": "x" * 500},
                    {"message": "x", "color": "red"}, {"message": "x", "seconds": 0},
                    {"message": "x", "seconds": 9999}, {"message": "x", "extra": 1}):
            with self.subTest(bad=bad):
                self.assertEqual(self.call("POST", "/api/notify", bad)[0], 400)
        self.assertEqual(self.sched.notifications, [])

    def test_notify_queue_full(self):
        settings.set_enabled("notifications", True)
        self.sched.full = True
        self.assertEqual(self.call("POST", "/api/notify", {"message": "x"})[0], 429)


if __name__ == "__main__":
    unittest.main()
