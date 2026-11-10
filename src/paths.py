"""Single place that knows where things live. Import it first.

Layout:
    src/assets/fonts      BDF fonts
    src/assets/img        weather icons and fun images
    src/libs/rgbmatrix    compiled Python bindings (built by `make build`)
    src/libs/site-packages pip dependencies (installed by `make deps`)
"""
import os
import sys

# Windows consoles default to cp1252 and the banners/temperature use Unicode.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
FONTS_DIR = os.path.join(ASSETS_DIR, "fonts")
WEATHER_DIR = os.path.join(ASSETS_DIR, "img", "weather")
FUN_DIR = os.path.join(ASSETS_DIR, "img", "fun")
LIBS_DIR = os.path.join(BASE_DIR, "libs")
SITE_PACKAGES = os.path.join(LIBS_DIR, "site-packages")


def data_dir():
    """Writable runtime data (settings, caches). Override with ELMATRIX_DATA_DIR."""
    d = os.environ.get("ELMATRIX_DATA_DIR") or os.path.join(BASE_DIR, "data")
    d = os.path.abspath(d)
    os.makedirs(d, exist_ok=True)
    return d


def font(name):
    return os.path.join(FONTS_DIR, name)


# Appended (not prepended) so a simulated `rgbmatrix` placed earlier on
# sys.path (see simulator/run.py) still wins over the real bindings.
for _p in (LIBS_DIR, SITE_PACKAGES):
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.append(_p)
