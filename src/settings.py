"""Persistent settings stored as JSON in <data dir>/settings.json.

The data dir is `src/data` unless ELMATRIX_DATA_DIR is set (see paths.data_dir).
Reads are cached by file mtime/size so other processes (widgets running as
subprocesses on hardware) always see the latest file. Writes are atomic
(temp file + os.replace) and serialised with a lock inside this process.

Invalid input raises SettingsError (a ValueError) with a Spanish message
meant to be shown to the user.
"""
import copy
import json
import os
import re
import tempfile
import threading
import time

import catalog
import paths
from catalog import Field

MAX_TEXT = 200
MAX_LIST_ITEMS = 50

GLOBAL_FIELDS = (
    Field("pause_seconds", "Pausa entre widgets (segundos)", "number", 2,
          "Tiempo de espera entre un widget y el siguiente.", min=0, max=300, step=1),
    Field("brightness", "Brillo", "number", 30,
          "Solo en el panel real; el simulador siempre usa 100.", min=1, max=100, step=1),
    Field("order", "Orden", "select", "shuffle",
          "Cómo se eligen los widgets de la rotación.",
          options=({"value": "shuffle", "label": "Aleatorio"},
                   {"value": "sequence", "label": "En secuencia"})),
)
_GLOBAL_BY_KEY = {f.key: f for f in GLOBAL_FIELDS}

_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_TRUE = {"true", "1", "yes", "on", "si"}
_FALSE = {"false", "0", "no", "off"}

_LOCK = threading.RLock()
_cache = {"key": None, "data": {}}


class SettingsError(ValueError):
    pass


# ---------------------------------------------------------------- coercion
def _default(f):
    return list(f.default) if isinstance(f.default, list) else f.default


def _is_int_field(f):
    return (isinstance(f.default, int) and not isinstance(f.default, bool)
            and (f.step is None or float(f.step).is_integer()))


def _coerce(f, value):
    err = lambda msg: SettingsError("%s: %s" % (f.label, msg))  # noqa: E731
    t = f.type
    if t == "text":
        if not isinstance(value, str):
            raise err("debe ser texto")
        value = value.strip()
        if len(value) > MAX_TEXT:
            raise err("es demasiado largo (máximo %d caracteres)" % MAX_TEXT)
        return value
    if t == "number":
        if isinstance(value, bool):
            raise err("debe ser un número")
        if isinstance(value, str):
            try:
                value = float(value.strip())
            except ValueError:
                raise err("debe ser un número")
        if not isinstance(value, (int, float)) or value != value or value in (float("inf"), float("-inf")):
            raise err("debe ser un número")
        if f.min is not None and value < f.min:
            raise err("debe ser al menos %s" % f.min)
        if f.max is not None and value > f.max:
            raise err("debe ser como máximo %s" % f.max)
        if _is_int_field(f):
            if int(value) != value:
                raise err("debe ser un número entero")
            return int(value)
        return float(value)
    if t == "bool":
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.strip().lower() in _TRUE:
            return True
        if isinstance(value, str) and value.strip().lower() in _FALSE:
            return False
        raise err("debe ser verdadero o falso")
    if t == "select":
        for opt in f.options:
            if value == opt["value"] and type(value) is type(opt["value"]):
                return opt["value"]
        for opt in f.options:  # forms send strings: match "3" with 3
            if isinstance(value, (str, int)) and not isinstance(value, bool) \
                    and str(value) == str(opt["value"]):
                return opt["value"]
        raise err("opción no válida")
    if t == "list":
        if isinstance(value, str):
            value = value.splitlines()
        if not isinstance(value, (list, tuple)):
            raise err("debe ser una lista")
        out = []
        for item in value:
            if not isinstance(item, str):
                raise err("cada elemento debe ser texto")
            item = item.strip()
            if not item:
                continue
            if len(item) > MAX_TEXT:
                raise err("un elemento es demasiado largo (máximo %d caracteres)" % MAX_TEXT)
            out.append(item)
        if len(out) > MAX_LIST_ITEMS:
            raise err("demasiados elementos (máximo %d)" % MAX_LIST_ITEMS)
        return out
    if t == "color":
        if isinstance(value, str) and _COLOR_RE.match(value.strip()):
            return value.strip().lower()
        raise err("debe ser un color con el formato #rrggbb")
    raise err("tipo de campo desconocido: %s" % t)


def coerce(f, value, strict=True):
    """Validate/convert one value. strict=False falls back to the default."""
    try:
        return _coerce(f, value)
    except SettingsError:
        if strict:
            raise
        return _default(f)


def _validate_dict(fields_by_key, data, what):
    if not isinstance(data, dict):
        raise SettingsError("%s: se esperaba un objeto" % what)
    out = {}
    for key, value in data.items():
        f = fields_by_key.get(key)
        if f is None:
            raise SettingsError("%s: clave desconocida '%s'" % (what, key))
        out[key] = coerce(f, value, strict=True)
    return out


# ---------------------------------------------------------------- storage
def _path():
    return os.path.join(paths.data_dir(), "settings.json")


def _load():
    path = _path()
    try:
        st = os.stat(path)
    except OSError:
        return {}
    key = (path, st.st_mtime_ns, st.st_size)
    with _LOCK:
        if _cache["key"] == key:
            return copy.deepcopy(_cache["data"])
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as ex:
        print("settings: cannot read %s (%s); using defaults" % (path, ex))
        return {}
    if not isinstance(data, dict):
        data = {}
    with _LOCK:
        _cache["key"] = key
        _cache["data"] = data
    return copy.deepcopy(data)


def _save(data):
    path = _path()
    directory = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(prefix=".settings-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.flush()
            os.fsync(fh.fileno())
        for attempt in range(5):
            try:
                os.replace(tmp, path)
                break
            except PermissionError:  # Windows: a reader may hold the file briefly
                if attempt == 4:
                    raise
                time.sleep(0.05)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    with _LOCK:
        _cache["key"] = None


def _widget(widget_id):
    w = catalog.get(widget_id) if isinstance(widget_id, str) else None
    if w is None:
        raise SettingsError("Widget desconocido: %s" % (widget_id,))
    return w


def _stored_section(data, name):
    section = data.get(name)
    return section if isinstance(section, dict) else {}


def _stored_widget(data, widget_id):
    entry = _stored_section(data, "widgets").get(widget_id)
    return entry if isinstance(entry, dict) else {}


# -------------------------------------------------------------------- API
def get_global():
    stored = _stored_section(_load(), "global")
    out = {}
    for f in GLOBAL_FIELDS:
        out[f.key] = coerce(f, stored[f.key], strict=False) if f.key in stored else _default(f)
    return out


def set_global(values):
    clean = _validate_dict(_GLOBAL_BY_KEY, values, "Ajustes")
    with _LOCK:
        data = _load()
        section = _stored_section(data, "global")
        section.update(clean)
        data["global"] = section
        _save(data)
    return get_global()


def is_enabled(widget_id):
    w = catalog.get(widget_id)
    if w is None:
        return False
    stored = _stored_widget(_load(), widget_id).get("enabled")
    return stored if isinstance(stored, bool) else w.default_enabled


def widget_cfg(widget_id):
    w = _widget(widget_id)
    stored = _stored_widget(_load(), widget_id).get("config")
    stored = stored if isinstance(stored, dict) else {}
    out = w.defaults()
    for f in w.settings:
        if f.key in stored:
            out[f.key] = coerce(f, stored[f.key], strict=False)
    return out


def update_widget(widget_id, enabled=None, config=None):
    """Validate everything first, then persist enabled/config in one write."""
    w = _widget(widget_id)
    if enabled is not None and not isinstance(enabled, bool):
        raise SettingsError("'enabled' debe ser verdadero o falso")
    clean = None
    if config is not None:
        clean = _validate_dict({f.key: f for f in w.settings}, config, w.name)
    with _LOCK:
        data = _load()
        widgets = _stored_section(data, "widgets")
        entry = _stored_widget(data, widget_id)
        if enabled is not None:
            entry["enabled"] = enabled
        if clean:
            cfg = entry.get("config") if isinstance(entry.get("config"), dict) else {}
            cfg.update(clean)
            entry["config"] = cfg
        widgets[widget_id] = entry
        data["widgets"] = widgets
        _save(data)


def set_enabled(widget_id, enabled):
    update_widget(widget_id, enabled=enabled)


def set_widget_cfg(widget_id, values):
    update_widget(widget_id, config=values)
    return widget_cfg(widget_id)


def snapshot():
    return {
        "global": get_global(),
        "widgets": {w.id: {"enabled": is_enabled(w.id), "config": widget_cfg(w.id)}
                    for w in catalog.WIDGETS},
    }
