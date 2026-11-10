"""Tiny JSON-over-HTTP client with a disk cache (stdlib only).

get_json() never raises anything but NetError. When a request fails and an
older copy of the answer is on disk, that stale copy is returned instead, so
widgets keep working through short outages.
"""
import hashlib
import http.client
import json
import os
import tempfile
import time
import urllib.request

import paths

USER_AGENT = "elmatrix/1.0 (LED matrix banner; +https://github.com/)"
MAX_BYTES = 2 * 1024 * 1024


class NetError(Exception):
    """The request failed and no cached answer was available."""


def cache_dir():
    d = os.path.join(paths.data_dir(), "cache")
    os.makedirs(d, exist_ok=True)
    return d


def _cache_file(url):
    # Hashed: URLs may contain API keys and are not valid file names.
    return os.path.join(cache_dir(), hashlib.sha256(url.encode("utf-8")).hexdigest() + ".json")


def _read_cache(path):
    """Returns (timestamp, data) or None."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            blob = json.load(fh)
        return float(blob["ts"]), blob["data"]
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _write_cache(path, data, ts=None):
    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump({"ts": time.time() if ts is None else ts, "data": data}, fh)
        os.replace(tmp, path)
        tmp = None
    except (OSError, TypeError, ValueError):
        pass  # the cache is an optimisation, never a failure
    finally:
        if tmp is not None:
            try:
                os.remove(tmp)
            except OSError:
                pass


def _fetch(url, timeout, headers, opener):
    all_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    all_headers.update(headers or {})
    request = urllib.request.Request(url, headers=all_headers)
    response = opener(request, timeout=timeout)
    try:
        raw = response.read(MAX_BYTES + 1)
    finally:
        close = getattr(response, "close", None)
        if close:
            close()
    if len(raw) > MAX_BYTES:
        raise ValueError("response too large")
    return json.loads(raw.decode("utf-8"))


def get_json(url, timeout=8, cache_seconds=0, headers=None, opener=None):
    """GET `url` and decode the JSON body.

    cache_seconds > 0: a cached answer younger than that is returned without
    touching the network. Any failure falls back to the cached copy (however
    old); with no copy a NetError is raised.
    """
    opener = opener or urllib.request.urlopen
    path = _cache_file(url)
    cached = _read_cache(path)
    if cache_seconds > 0 and cached is not None and 0 <= time.time() - cached[0] < cache_seconds:
        return cached[1]
    try:
        data = _fetch(url, timeout, headers, opener)
    except (OSError, http.client.HTTPException, ValueError) as ex:
        # URLError/HTTPError/timeouts are OSError; bad JSON/encoding is ValueError.
        if cached is not None:
            return cached[1]
        raise NetError("%s: %s" % (type(ex).__name__, ex))
    _write_cache(path, data)
    return data
