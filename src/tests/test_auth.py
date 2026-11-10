import base64
import http.client
import json
import unittest
from unittest import mock

from _env import DataDirTestCase

from webpanel import auth as authmod
from webpanel import server as servermod
from webpanel.auth import Authenticator
from webpanel.server import PanelServer


class FakeRunner(object):
    def panel_size(self):
        return 64, 32


class FakeScheduler(object):
    def __init__(self):
        self.calls = []

    def state(self):
        return {"paused": False, "current": None, "queue": {"run": [], "notifications": 0}}

    def skip(self):
        self.calls.append("skip")


class Clock(object):
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


JSON = {"Content-Type": "application/json"}
GOOD = {"user": "admin", "password": "test-pass-1234"}


def basic(user, password):
    return {"Authorization": "Basic " + base64.b64encode(("%s:%s" % (user, password)).encode()).decode()}


class AuthTestBase(DataDirTestCase):
    def setUp(self):
        DataDirTestCase.setUp(self)
        self.clock = Clock()
        self.auth = Authenticator(password="test-pass-1234", clock=self.clock)
        self.sched = FakeScheduler()
        self.panel = PanelServer(self.sched, FakeRunner(), host="127.0.0.1", port=0,
                                 authenticator=self.auth)
        self.panel.start()
        self.addCleanup(self.panel.stop)

    def raw(self, method, path, body=None, headers=None, raw=None):
        """-> (status, headers, parsed body)"""
        conn = http.client.HTTPConnection("127.0.0.1", self.panel.port, timeout=5)
        try:
            data = raw if raw is not None else (json.dumps(body) if body is not None else None)
            conn.request(method, path, body=data, headers=headers if headers is not None else JSON)
            resp = conn.getresponse()
            payload = resp.read()
            ctype = resp.getheader("Content-Type", "")
            parsed = json.loads(payload) if "json" in ctype else payload
            return resp.status, resp, parsed
        finally:
            conn.close()

    def login(self, creds=GOOD):
        status, resp, body = self.raw("POST", "/api/login", creds)
        cookie = resp.getheader("Set-Cookie")
        return status, resp, body, cookie

    def session_headers(self):
        status, resp, body, cookie = self.login()
        self.assertEqual(status, 200)
        return dict(JSON, Cookie=cookie.split(";")[0])


class OpenEndpointsTest(AuthTestBase):
    def test_login_page_open_with_security_headers(self):
        status, resp, body = self.raw("GET", "/login", headers={})
        self.assertEqual(status, 200)
        self.assertIn(b"<form", body)
        self.assertEqual(resp.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(resp.getheader("Referrer-Policy"), "no-referrer")
        self.assertEqual(resp.getheader("X-Frame-Options"), "DENY")
        csp = resp.getheader("Content-Security-Policy")
        self.assertIn("default-src 'none'", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertNotIn("http", csp)

    def test_index_has_security_headers_when_authenticated(self):
        status, resp, _ = self.raw("GET", "/", headers=self.session_headers())
        self.assertEqual(status, 200)
        self.assertEqual(resp.getheader("X-Frame-Options"), "DENY")
        self.assertTrue(resp.getheader("Content-Security-Policy"))

    def test_auth_status_open(self):
        status, _, body = self.raw("GET", "/api/auth", headers={})
        self.assertEqual((status, body), (200, {"authenticated": False}))
        status, _, body = self.raw("GET", "/api/auth", headers=self.session_headers())
        self.assertEqual(body, {"authenticated": True, "user": "admin"})

    def test_login_page_wrong_method(self):
        self.assertEqual(self.raw("POST", "/login", {})[0], 405)
        self.assertEqual(self.raw("GET", "/api/login", headers={})[0], 405)


class SessionRequiredTest(AuthTestBase):
    def test_page_redirects_to_login(self):
        status, resp, _ = self.raw("GET", "/", headers={})
        self.assertEqual(status, 302)
        self.assertEqual(resp.getheader("Location"), "/login")
        self.assertEqual(self.raw("GET", "/index.html", headers={})[0], 302)

    def test_api_is_401_without_www_authenticate(self):
        for method, path in (("GET", "/api/state"), ("GET", "/api/catalog"), ("GET", "/api/frame"),
                             ("POST", "/api/skip"), ("PUT", "/api/settings"),
                             ("POST", "/api/logout"), ("POST", "/api/notify")):
            with self.subTest(path=path):
                status, resp, body = self.raw(method, path, {} if method != "GET" else None)
                self.assertEqual(status, 401)
                self.assertIn("error", body)
                self.assertIsNone(resp.getheader("WWW-Authenticate"))
        self.assertEqual(self.sched.calls, [])

    def test_bad_cookie_is_rejected(self):
        h = dict(JSON, Cookie="elmatrix_session=nope")
        self.assertEqual(self.raw("GET", "/api/state", headers=h)[0], 401)

    def test_non_api_unknown_path_is_404(self):
        self.assertEqual(self.raw("GET", "/secret", headers={})[0], 404)

    def test_session_grants_access_and_writes_keep_json_rule(self):
        h = self.session_headers()
        self.assertEqual(self.raw("GET", "/api/state", headers=h)[0], 200)
        self.assertEqual(self.raw("POST", "/api/skip", {}, headers=h)[0], 200)
        form = {"Cookie": h["Cookie"], "Content-Type": "application/x-www-form-urlencoded"}
        self.assertEqual(self.raw("POST", "/api/skip", raw="a=1", headers=form)[0], 415)
        self.assertEqual(self.sched.calls, ["skip"])


class LoginTest(AuthTestBase):
    def test_login_ok_sets_cookie_with_flags(self):
        status, resp, body, cookie = self.login()
        self.assertEqual(status, 200)
        self.assertEqual(body, {"ok": True, "user": "admin"})
        parts = [p.strip() for p in cookie.split(";")]
        name, _, value = parts[0].partition("=")
        self.assertEqual(name, "elmatrix_session")
        self.assertGreaterEqual(len(value), 40)
        self.assertIn("HttpOnly", parts)
        self.assertIn("SameSite=Strict", parts)
        self.assertIn("Path=/", parts)
        self.assertIn("Max-Age=%d" % (12 * 3600), parts)
        self.assertNotIn("Secure", parts)

    def test_sessions_are_random(self):
        a = self.login()[3].split(";")[0]
        b = self.login()[3].split(";")[0]
        self.assertNotEqual(a, b)

    def test_bad_credentials(self):
        for creds in ({"user": "admin", "password": "x"}, {"user": "root", "password": "test-pass-1234"},
                      {"user": "x", "password": "y"}):
            with self.subTest(creds=creds):
                status, resp, body, cookie = self.login(creds)
                self.assertEqual(status, 401)
                self.assertIn("error", body)
                self.assertIsNone(cookie)
                self.assertIsNone(resp.getheader("WWW-Authenticate"))
                self.auth.record_success("127.0.0.1")  # keep the lockout out of this test

    def test_missing_or_wrong_type_fields(self):
        for bad in ({}, {"user": "admin"}, {"password": "test-pass-1234"}, {"user": "", "password": ""},
                    {"user": 1, "password": 2}, [1]):
            with self.subTest(bad=bad):
                self.assertEqual(self.raw("POST", "/api/login", bad)[0], 400)
        self.assertEqual(self.raw("POST", "/api/login", raw="{nope")[0], 400)

    def test_login_requires_json_content_type(self):
        status, _, _ = self.raw("POST", "/api/login", raw=json.dumps(GOOD),
                                headers={"Content-Type": "text/plain"})
        self.assertEqual(status, 415)

    def test_logout_invalidates_session(self):
        h = self.session_headers()
        self.assertEqual(self.raw("GET", "/api/state", headers=h)[0], 200)
        status, resp, body = self.raw("POST", "/api/logout", {}, headers=h)
        self.assertEqual(status, 200)
        self.assertIn("Max-Age=0", resp.getheader("Set-Cookie"))
        self.assertEqual(self.raw("GET", "/api/state", headers=h)[0], 401)
        self.assertEqual(self.raw("GET", "/", headers=h)[0], 302)

    def test_session_expires(self):
        h = self.session_headers()
        self.clock.now += 12 * 3600 - 1
        self.assertEqual(self.raw("GET", "/api/state", headers=h)[0], 200)
        self.clock.now += 2
        self.assertEqual(self.raw("GET", "/api/state", headers=h)[0], 401)
        self.assertEqual(self.auth.session_count(), 0)

    def test_custom_credentials(self):
        self.auth.user, self.auth._password = "bob", "pw"
        self.assertEqual(self.login(GOOD)[0], 401)
        self.auth.record_success("127.0.0.1")
        self.assertEqual(self.login({"user": "bob", "password": "pw"})[0], 200)


class BasicAuthTest(AuthTestBase):
    def test_basic_works_without_cookie(self):
        self.assertEqual(self.raw("GET", "/api/state", headers=basic("admin", "test-pass-1234"))[0], 200)
        h = dict(JSON, **basic("admin", "test-pass-1234"))
        self.assertEqual(self.raw("POST", "/api/skip", {}, headers=h)[0], 200)
        self.assertEqual(self.sched.calls, ["skip"])

    def test_basic_write_still_needs_json(self):
        h = {"Content-Type": "text/plain"}
        h.update(basic("admin", "test-pass-1234"))
        self.assertEqual(self.raw("POST", "/api/skip", raw="{}", headers=h)[0], 415)

    def test_basic_wrong_or_malformed(self):
        for h in (basic("admin", "nope"), basic("nope", "test-pass-1234"),
                  {"Authorization": "Basic !!!notbase64"}, {"Authorization": "Bearer abc"}):
            with self.subTest(h=h):
                status, resp, _ = self.raw("GET", "/api/state", headers=h)
                self.assertEqual(status, 401)
                self.assertIsNone(resp.getheader("WWW-Authenticate"))
                self.auth.record_success("127.0.0.1")

    def test_basic_password_with_colon(self):
        self.auth._password = "a:b"
        self.assertEqual(self.raw("GET", "/api/state", headers=basic("admin", "a:b"))[0], 200)


class LockoutTest(AuthTestBase):
    def fail_login(self):
        return self.raw("POST", "/api/login", {"user": "admin", "password": "bad"})

    def test_lock_after_five_failures_with_retry_after(self):
        for _ in range(4):
            self.assertEqual(self.fail_login()[0], 401)
        status, resp, body = self.fail_login()
        self.assertEqual(status, 429)
        self.assertEqual(resp.getheader("Retry-After"), "60")
        self.assertIn("error", body)
        # locked: even the right password is refused
        status, resp, _, cookie = self.login()
        self.assertEqual(status, 429)
        self.assertIsNone(cookie)
        self.clock.now += 20
        status, resp, _, _ = self.login()
        self.assertEqual((status, resp.getheader("Retry-After")), (429, "40"))
        self.clock.now += 41
        self.assertEqual(self.login()[0], 200)

    def test_basic_failures_lock_too(self):
        for _ in range(4):
            self.assertEqual(self.raw("GET", "/api/state", headers=basic("admin", "x"))[0], 401)
        status, resp, _ = self.raw("GET", "/api/state", headers=basic("admin", "x"))
        self.assertEqual(status, 429)
        self.assertEqual(resp.getheader("Retry-After"), "60")
        self.assertEqual(self.raw("GET", "/api/state", headers=basic("admin", "test-pass-1234"))[0], 429)
        self.assertEqual(self.login()[0], 429)  # same IP, shared counter

    def test_success_resets_counter(self):
        for _ in range(4):
            self.fail_login()
        self.assertEqual(self.login()[0], 200)
        for _ in range(4):
            self.assertEqual(self.fail_login()[0], 401)
        self.assertEqual(self.fail_login()[0], 429)

    def test_counter_restarts_after_lock_expires(self):
        for _ in range(5):
            self.fail_login()
        self.clock.now += 61
        for _ in range(4):
            self.assertEqual(self.fail_login()[0], 401)
        self.assertEqual(self.fail_login()[0], 429)


class AuthenticatorUnitTest(unittest.TestCase):
    def test_failure_table_is_capped(self):
        clock = Clock()
        a = Authenticator(password="test-pass-1234", clock=clock, max_clients=10)
        for i in range(200):
            a.record_failure("10.0.0.%d" % i)
        self.assertLessEqual(a.failure_table_size(), 10)

    def test_session_cap_evicts_oldest(self):
        a = Authenticator(password="test-pass-1234", clock=Clock(), max_sessions=3)
        tokens = [a.create_session("admin") for _ in range(5)]
        self.assertEqual(a.session_count(), 3)
        self.assertIsNone(a.session_user(tokens[0]))
        self.assertEqual(a.session_user(tokens[4]), "admin")

    def test_custom_limits(self):
        clock = Clock()
        a = Authenticator(password="test-pass-1234", clock=clock, max_failures=2, lock_seconds=5)
        self.assertEqual(a.record_failure("ip"), 0)
        self.assertEqual(a.record_failure("ip"), 5)
        self.assertEqual(a.retry_after("ip"), 5)
        clock.now += 6
        self.assertEqual(a.retry_after("ip"), 0)

    def test_compares_both_fields_in_constant_time(self):
        a = Authenticator(password="test-pass-1234", clock=Clock())
        with mock.patch.object(authmod.hmac, "compare_digest", wraps=authmod.hmac.compare_digest) as cd:
            self.assertFalse(a.check_credentials("wrong", "wrong"))
            self.assertEqual(cd.call_count, 2)  # no short-circuit on the user
            for call in cd.call_args_list:
                self.assertEqual(len(call.args[0]), 32)  # fixed-length digests
                self.assertEqual(len(call.args[1]), 32)
        self.assertTrue(a.check_credentials("admin", "test-pass-1234"))
        self.assertFalse(a.check_credentials("admin", "test-pass-1235"))
        self.assertFalse(a.check_credentials(None, None))

    def test_defaults(self):
        self.assertEqual(authmod.DEFAULT_USER, "admin")
        self.assertFalse(hasattr(authmod, "DEFAULT_PASSWORD"))  # public repo: no baked-in password
        self.assertIs(servermod.authmod, authmod)

    def test_password_is_required(self):
        with self.assertRaises(ValueError):
            Authenticator()
        with self.assertRaises(ValueError):
            Authenticator(password="")


class ResolvePasswordTest(DataDirTestCase):
    def path(self):
        import os
        return os.path.join(self.data_dir, "web_password")

    def test_explicit_wins_and_is_not_saved(self):
        import os
        self.assertEqual(authmod.resolve_password("mine", self.path()), ("mine", "given"))
        self.assertFalse(os.path.exists(self.path()))

    def test_generates_once_then_reuses(self):
        pw, source = authmod.resolve_password(None, self.path())
        self.assertEqual(source, "generated")
        self.assertGreaterEqual(len(pw), 12)
        self.assertEqual(authmod.resolve_password(None, self.path()), (pw, "saved"))

    def test_generated_file_is_owner_only_on_posix(self):
        import os, stat
        if os.name != "posix":
            self.skipTest("POSIX permissions only")
        authmod.resolve_password(None, self.path())
        self.assertEqual(stat.S_IMODE(os.stat(self.path()).st_mode), 0o600)


class MainArgsTest(unittest.TestCase):
    def parse(self, argv, env):
        import main
        with mock.patch.dict(main.os.environ, env, clear=False):
            for k in ("ELMATRIX_USER", "ELMATRIX_PASSWORD"):
                if k not in env:
                    main.os.environ.pop(k, None)
            return main.parse_args(argv)[0]

    def test_defaults(self):
        a = self.parse([], {})
        self.assertEqual((a.web_user, a.web_password), ("admin", None))  # password resolved later

    def test_env_and_flags_priority(self):
        a = self.parse([], {"ELMATRIX_USER": "eu", "ELMATRIX_PASSWORD": "ep"})
        self.assertEqual((a.web_user, a.web_password), ("eu", "ep"))
        a = self.parse(["--web-user", "fu", "--web-password", "fp"],
                       {"ELMATRIX_USER": "eu", "ELMATRIX_PASSWORD": "ep"})
        self.assertEqual((a.web_user, a.web_password), ("fu", "fp"))

    def test_old_token_flag_is_gone(self):
        import main
        _, extra = main.parse_args(["--web-token", "x"])
        self.assertIn("--web-token", extra)  # now just an unknown pass-through argument


if __name__ == "__main__":
    unittest.main()
