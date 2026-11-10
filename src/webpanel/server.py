"""Web panel HTTP server (stdlib only) and JSON API.

    GET  /login                  the login page (open)
    GET  /api/auth               {authenticated, user?} (open)
    POST /api/login              {user, password} -> session cookie (open)
    POST /api/logout             ends the session
    GET  /                       the panel page (webpanel/index.html)
    GET  /api/catalog            widgets + schema + current config + enabled
    GET  /api/state              scheduler state + panel size
    GET  /api/frame              current simulator frame (base64 RGB)
    PUT  /api/widgets/<id>       {enabled?, config?}
    PUT  /api/settings           global settings
    POST /api/run/<id>           run a widget now
    POST /api/skip | /api/pause | /api/resume
    POST /api/notify             {message, color?, seconds?}

Everything except the three "open" entries needs a session cookie (from
/api/login) or HTTP Basic credentials (scripts: `curl -u user:password`).
Unauthenticated pages redirect to /login; unauthenticated API calls get a
401 JSON without `WWW-Authenticate`, so browsers never show the native prompt.
Writes need `Content-Type: application/json` (this blocks cross-site form
posts). Repeated failed logins lock the client IP for a while (429).
"""
import base64
import http.cookies
import json
import os
import re
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import catalog
import settings
from webpanel import auth as authmod

MAX_BODY = 64 * 1024
MAX_MESSAGE = 200
INDEX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
LOGIN_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "login.html")
# The pages are single files with inline script/style and no external origins.
CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
       "img-src 'self' data:; connect-src 'self'; form-action 'self'; "
       "base-uri 'none'; frame-ancestors 'none'")
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")


class ApiError(Exception):
    def __init__(self, status, message, headers=()):
        Exception.__init__(self, message)
        self.status = status
        self.message = message
        self.headers = headers


def widget_view(w):
    d = w.to_dict()
    d["enabled"] = settings.is_enabled(w.id)
    d["config"] = settings.widget_cfg(w.id)
    return d


def _get_widget(widget_id):
    w = catalog.get(widget_id)
    if w is None:
        raise ApiError(404, "Widget desconocido: %s" % widget_id)
    return w


def _as_object(body):
    if not isinstance(body, dict):
        raise ApiError(400, "Se esperaba un objeto JSON")
    return body


class PanelServer(object):
    def __init__(self, scheduler, runner, host="127.0.0.1", port=8080,
                 user=authmod.DEFAULT_USER, password=None,
                 frame_provider=None, simulator=False, authenticator=None):
        self.scheduler = scheduler
        self.runner = runner
        self.auth = authenticator or authmod.Authenticator(user, password)
        self.frame_provider = frame_provider
        self.simulator = simulator
        self.host = host
        self.loopback_only = host in LOOPBACK_HOSTS
        self._thread = None
        server_cls = _Server6 if ":" in host else _Server
        self.httpd = server_cls((host, port), _Handler)
        self.httpd.panel = self

    @property
    def port(self):
        return self.httpd.server_address[1]

    def start(self):
        self._thread = threading.Thread(target=self.httpd.serve_forever,
                                        kwargs={"poll_interval": 0.2},
                                        name="webpanel", daemon=True)
        self._thread.start()

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    # -- API handlers (return JSON-able data) ------------------------------
    def catalog_view(self):
        return {
            "widgets": [widget_view(w) for w in catalog.WIDGETS],
            "global": settings.get_global(),
            "global_fields": [f.to_dict() for f in settings.GLOBAL_FIELDS],
            "simulator": self.simulator,
        }

    def state_view(self):
        st = dict(self.scheduler.state())
        w, h = self.runner.panel_size()
        st["panel"] = {"w": w, "h": h}
        st["simulator"] = self.simulator
        st["notifications_enabled"] = settings.is_enabled("notifications")
        return st

    def frame_view(self):
        w, h = self.runner.panel_size()
        frame = self.frame_provider() if self.frame_provider else None
        if not frame:
            return {"available": False, "w": w, "h": h, "data": ""}
        fw, fh, data = frame
        return {"available": True, "w": fw, "h": fh,
                "data": base64.b64encode(data).decode("ascii")}

    def put_widget(self, widget_id, body):
        w = _get_widget(widget_id)
        body = _as_object(body)
        unknown = set(body) - {"enabled", "config"}
        if unknown:
            raise ApiError(400, "Claves desconocidas: %s" % ", ".join(sorted(unknown)))
        settings.update_widget(w.id, enabled=body.get("enabled"), config=body.get("config"))
        return widget_view(w)

    def put_settings(self, body):
        return {"global": settings.set_global(_as_object(body))}

    def run_widget(self, widget_id):
        _get_widget(widget_id)
        self.scheduler.request_run(widget_id)
        return {"ok": True}

    def notify(self, body):
        body = _as_object(body)
        unknown = set(body) - {"message", "color", "seconds"}
        if unknown:
            raise ApiError(400, "Claves desconocidas: %s" % ", ".join(sorted(unknown)))
        if not settings.is_enabled("notifications"):
            raise ApiError(409, "Las notificaciones están desactivadas")
        message = body.get("message")
        if not isinstance(message, str) or not message.strip():
            raise ApiError(400, "El mensaje es obligatorio")
        message = message.strip()
        if len(message) > MAX_MESSAGE:
            raise ApiError(400, "El mensaje es demasiado largo (máximo %d caracteres)" % MAX_MESSAGE)
        fields = {f.key: f for f in catalog.get("notifications").settings}
        color = body.get("color")
        seconds = body.get("seconds")
        if color is not None:
            color = settings.coerce(fields["default_color"], color)
        if seconds is not None:
            seconds = settings.coerce(fields["default_seconds"], seconds)
        if not self.scheduler.enqueue_notification(message, color, seconds):
            raise ApiError(429, "La cola de notificaciones está llena")
        return {"ok": True, "queued": self.scheduler.state()["queue"]["notifications"]}

    def simple(self, action):
        getattr(self.scheduler, action)()
        return {"ok": True, "state": self.state_view()}


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    panel = None


class _Server6(_Server):
    address_family = socket.AF_INET6


_ID = r"([A-Za-z0-9_\-]+)"
# (method, regex, handler(panel, match, body), takes_body)
ROUTES = (
    ("GET", r"/api/catalog", lambda p, m, b: p.catalog_view()),
    ("GET", r"/api/state", lambda p, m, b: p.state_view()),
    ("GET", r"/api/frame", lambda p, m, b: p.frame_view()),
    ("PUT", r"/api/widgets/" + _ID, lambda p, m, b: p.put_widget(m.group(1), b)),
    ("PUT", r"/api/settings", lambda p, m, b: p.put_settings(b)),
    ("POST", r"/api/run/" + _ID, lambda p, m, b: p.run_widget(m.group(1))),
    ("POST", r"/api/skip", lambda p, m, b: p.simple("skip")),
    ("POST", r"/api/pause", lambda p, m, b: p.simple("pause")),
    ("POST", r"/api/resume", lambda p, m, b: p.simple("resume")),
    ("POST", r"/api/notify", lambda p, m, b: p.notify(b)),
)
_COMPILED = tuple((meth, re.compile(rx + r"$"), fn) for meth, rx, fn in ROUTES)


class _Handler(BaseHTTPRequestHandler):
    server_version = "eLMaTrIx"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # keep the console quiet
        pass

    # -- plumbing -----------------------------------------------------------
    def _send(self, status, payload, content_type="application/json; charset=utf-8",
              headers=()):
        if isinstance(payload, (dict, list)):
            payload = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if content_type.startswith("text/html"):
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Frame-Options", "DENY")
        for name, value in headers:
            self.send_header(name, value)
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _error(self, status, message, headers=()):
        self._send(status, {"error": message}, headers=headers)

    def _redirect(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()

    def _fail(self, status, message, headers=()):
        if self.command in ("PUT", "POST"):
            self.close_connection = True  # the body may be unread
        self._error(status, message, headers)

    def _host_ok(self):
        """Reject foreign Host headers on loopback binds (DNS rebinding)."""
        if not self.server.panel.loopback_only:
            return True
        host = self.headers.get("Host")
        if not host:
            return True
        host = host.strip().lower()
        if host.startswith("["):
            host = host[1:].split("]", 1)[0]
        elif host.count(":") == 1:
            host = host.split(":", 1)[0]
        return host in LOOPBACK_HOSTS

    # -- authentication -----------------------------------------------------
    def _client_ip(self):
        return self.client_address[0]

    def _session_token(self):
        raw = self.headers.get("Cookie")
        if not raw:
            return ""
        try:
            jar = http.cookies.SimpleCookie()
            jar.load(raw)
        except http.cookies.CookieError:
            return ""
        morsel = jar.get(authmod.COOKIE_NAME)
        return morsel.value if morsel else ""

    def _basic_credentials(self):
        header = self.headers.get("Authorization") or ""
        scheme, _, value = header.partition(" ")
        if scheme.lower() != "basic" or not value.strip():
            return None
        try:
            decoded = base64.b64decode(value.strip(), validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return ("", "")
        user, _, password = decoded.partition(":")
        return (user, password)

    def _lock_error(self, seconds):
        self.close_connection = True
        raise ApiError(429, "Demasiados intentos. Probá de nuevo en %d s" % seconds,
                       headers=(("Retry-After", str(seconds)),))

    def _identify(self):
        """The signed-in user name (session cookie, else HTTP Basic) or None.

        Failed Basic attempts count towards the lockout; a locked client gets 429.
        """
        auth = self.server.panel.auth
        user = auth.session_user(self._session_token())
        if user:
            return user
        creds = self._basic_credentials()
        if creds is None:
            return None
        ip = self._client_ip()
        left = auth.retry_after(ip)
        if left:
            self._lock_error(left)
        if auth.check_credentials(creds[0], creds[1]):
            auth.record_success(ip)
            return auth.user
        left = auth.record_failure(ip)
        if left:
            self._lock_error(left)
        return None

    def _login(self):
        auth = self.server.panel.auth
        ip = self._client_ip()
        left = auth.retry_after(ip)
        if left:
            self._lock_error(left)
        body = _as_object(self._read_body())
        user, password = body.get("user"), body.get("password")
        if not isinstance(user, str) or not isinstance(password, str) or not user or not password:
            raise ApiError(400, "Usuario y contraseña son obligatorios")
        if not auth.check_credentials(user, password):
            left = auth.record_failure(ip)
            if left:
                self._lock_error(left)
            raise ApiError(401, "Usuario o contraseña incorrectos")
        auth.record_success(ip)
        token = auth.create_session(auth.user)
        cookie = ("%s=%s; Max-Age=%d; Path=/; HttpOnly; SameSite=Strict"
                  % (authmod.COOKIE_NAME, token, auth.session_ttl))
        self._send(200, {"ok": True, "user": auth.user}, headers=(("Set-Cookie", cookie),))

    def _logout(self):
        self.server.panel.auth.end_session(self._session_token())
        cookie = "%s=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict" % authmod.COOKIE_NAME
        self._send(200, {"ok": True}, headers=(("Set-Cookie", cookie),))

    def _read_body(self):
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            self.close_connection = True
            raise ApiError(415, "Content-Type debe ser application/json")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.close_connection = True
            raise ApiError(400, "Content-Length no válido")
        if length < 0 or length > MAX_BODY:
            self.close_connection = True
            raise ApiError(413, "El cuerpo es demasiado grande")
        raw = self.rfile.read(length) if length else b""
        if not raw.strip():
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "JSON no válido")

    def _dispatch(self):
        try:
            if not self._host_ok():
                raise ApiError(403, "Host no permitido")
            path = urlsplit(self.path).path
            method = self.command
            # Open endpoints (no session needed).
            if path == "/login":
                if method != "GET":
                    raise ApiError(405, "Método no permitido")
                return self._serve_page(LOGIN_PATH, "login.html")
            if path == "/api/auth":
                if method != "GET":
                    raise ApiError(405, "Método no permitido")
                user = self._identify()
                return self._send(200, {"authenticated": True, "user": user} if user
                                  else {"authenticated": False})
            if path == "/api/login":
                if method != "POST":
                    raise ApiError(405, "Método no permitido")
                return self._login()
            # Everything else needs a session (or Basic credentials).
            is_page = method == "GET" and path in ("/", "/index.html")
            if not is_page and not path.startswith("/api/"):
                raise ApiError(404, "No encontrado")
            if self._identify() is None:
                if is_page:
                    return self._redirect("/login")
                raise ApiError(401, "Autenticación requerida")
            if is_page:
                return self._serve_page(INDEX_PATH, "index.html")
            if path == "/api/logout":
                if method != "POST":
                    raise ApiError(405, "Método no permitido")
                self._read_body()
                return self._logout()
            matched, other_method = None, False
            for meth, rx, fn in _COMPILED:
                m = rx.match(path)
                if m:
                    if meth == method:
                        matched = (fn, m)
                        break
                    other_method = True
            if matched is None:
                if other_method:
                    raise ApiError(405, "Método no permitido")
                raise ApiError(404, "No encontrado")
            body = None
            if method in ("PUT", "POST"):
                body = self._read_body()
            fn, m = matched
            self._send(200, fn(self.server.panel, m, body))
        except ApiError as ex:
            self._fail(ex.status, ex.message, ex.headers)
        except settings.SettingsError as ex:
            self._fail(400, str(ex))
        except Exception as ex:  # never leave the client hanging
            print("webpanel: unexpected error: %r" % (ex,))
            self.close_connection = True
            self._error(500, "Error interno")

    def _serve_page(self, path, name):
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            raise ApiError(404, "%s no encontrado" % name)
        self._send(200, data, "text/html; charset=utf-8")

    do_GET = do_PUT = do_POST = _dispatch

    def do_HEAD(self):
        self._error(405, "Método no permitido")

    do_DELETE = do_PATCH = do_HEAD
