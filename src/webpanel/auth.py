"""Authentication for the web panel (stdlib only).

Credentials, cookie sessions and a per-IP failed-login lockout. Everything
time-dependent takes an injectable clock so tests never sleep.
"""
import hashlib
import hmac
import math
import os
import secrets
import threading
import time
from collections import OrderedDict

DEFAULT_USER = "admin"
# There is deliberately NO default password in the source: the repository is public.
# See resolve_password(): flag/env, else a random one saved on first run.
PASSWORD_FILE = "web_password"

COOKIE_NAME = "elmatrix_session"
SESSION_TTL = 12 * 3600      # absolute lifetime, seconds
MAX_SESSIONS = 100           # oldest evicted beyond this
MAX_FAILURES = 5             # consecutive failures before a lock
LOCK_SECONDS = 60
MAX_CLIENTS = 1000           # size cap of the failure table


def _digest(value):
    return hashlib.sha256(value.encode("utf-8")).digest()


def constant_time_equal(a, b):
    """Compare two strings in constant time (fixed-length digests)."""
    return hmac.compare_digest(_digest(a), _digest(b))


def resolve_password(explicit, path):
    """Return (password, source); source is "given", "saved" or "generated".

    `explicit` (flag or env) wins. Otherwise the password saved at `path` is
    reused; if there is none, a random one is generated and saved (owner-only
    permissions where the OS supports it) so it survives restarts.
    """
    if explicit:
        return explicit, "given"
    try:
        with open(path, "r", encoding="utf-8") as handle:
            saved = handle.read().strip()
        if saved:
            return saved, "saved"
    except OSError:
        pass
    password = secrets.token_urlsafe(9)  # 12 characters
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(password + "\n")
    return password, "generated"


class Authenticator(object):
    def __init__(self, user=DEFAULT_USER, password=None, clock=time.monotonic,
                 session_ttl=SESSION_TTL, max_sessions=MAX_SESSIONS,
                 max_failures=MAX_FAILURES, lock_seconds=LOCK_SECONDS,
                 max_clients=MAX_CLIENTS):
        if not password:
            raise ValueError("a non-empty password is required")
        self.user = user
        self._password = password
        self.clock = clock
        self.session_ttl = session_ttl
        self.max_sessions = max_sessions
        self.max_failures = max_failures
        self.lock_seconds = lock_seconds
        self.max_clients = max_clients
        self._lock = threading.Lock()
        self._sessions = OrderedDict()   # token -> (user, expires_at)
        self._failures = OrderedDict()   # ip -> [count, locked_until]

    # -- credentials ------------------------------------------------------
    def check_credentials(self, user, password):
        """Both fields are always compared (no short-circuit)."""
        user_ok = constant_time_equal(user or "", self.user)
        pass_ok = constant_time_equal(password or "", self._password)
        return user_ok & pass_ok

    # -- sessions ---------------------------------------------------------
    def _prune_sessions(self, now):
        for token in [t for t, (_, exp) in self._sessions.items() if exp <= now]:
            del self._sessions[token]

    def create_session(self, user):
        token = secrets.token_urlsafe(32)
        with self._lock:
            now = self.clock()
            self._prune_sessions(now)
            self._sessions[token] = (user, now + self.session_ttl)
            while len(self._sessions) > self.max_sessions:
                self._sessions.popitem(last=False)
        return token

    def session_user(self, token):
        if not token:
            return None
        with self._lock:
            now = self.clock()
            self._prune_sessions(now)
            entry = self._sessions.get(token)
            return entry[0] if entry else None

    def end_session(self, token):
        with self._lock:
            self._sessions.pop(token, None)

    def session_count(self):
        with self._lock:
            self._prune_sessions(self.clock())
            return len(self._sessions)

    # -- brute-force lockout (per client IP) ------------------------------
    def retry_after(self, ip):
        """Seconds left on this IP's lock (0 when not locked)."""
        with self._lock:
            rec = self._failures.get(ip)
            if not rec:
                return 0
            left = rec[1] - self.clock()
            if left > 0:
                return int(math.ceil(left))
            if rec[1]:                    # lock expired: start counting afresh
                del self._failures[ip]
            return 0

    def record_failure(self, ip):
        """Count a failure; returns the lock seconds if this one locked the IP, else 0."""
        with self._lock:
            now = self.clock()
            rec = self._failures.pop(ip, None) or [0, 0.0]
            if rec[1] and rec[1] <= now:
                rec = [0, 0.0]
            rec[0] += 1
            locked = 0
            if rec[0] >= self.max_failures:
                rec[1] = now + self.lock_seconds
                locked = int(math.ceil(self.lock_seconds))
            self._failures[ip] = rec      # most recently used goes last
            if len(self._failures) > self.max_clients:
                for key in [k for k, (_, until) in self._failures.items()
                            if until and until <= now]:
                    del self._failures[key]
                while len(self._failures) > self.max_clients:
                    self._failures.popitem(last=False)
            return locked

    def record_success(self, ip):
        with self._lock:
            self._failures.pop(ip, None)

    def failure_table_size(self):
        with self._lock:
            return len(self._failures)
