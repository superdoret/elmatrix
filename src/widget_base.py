"""Shared helpers for the module-style widgets (src/widgets/*.py).

A widget subclasses Widget, sets `widget_id` and implements render(). Only
drawing calls that exist in BOTH the real rgbmatrix bindings and the simulator
are used (graphics.DrawText/DrawLine/DrawCircle, Canvas.SetPixel/SetImage/
Clear/Fill, FrameCanvas + SwapOnVSync).
"""
import asyncio
import os
import time
import unicodedata

import paths  # noqa: F401  (puts libs/ on sys.path)
import settings
from base import Base
from rgbmatrix import graphics

WHITE = (255, 255, 255)
GREEN = (60, 220, 90)
RED = (240, 70, 70)
GREY = (140, 140, 140)
YELLOW = (255, 210, 60)
CYAN = (90, 200, 255)
SMALL_FONT = "5x8.bdf"


def ascii_fold(text, replacement="?"):
    """Strip accents and replace what BDF fonts cannot draw (non printable ASCII)."""
    out = []
    for ch in unicodedata.normalize("NFKD", str(text)):
        if unicodedata.combining(ch):
            continue
        if ch.isspace():
            out.append(" ")
        elif 32 <= ord(ch) < 127:
            out.append(ch)
        else:
            out.append(replacement)
    return "".join(out)


def parse_color(value, default=WHITE):
    """'#rrggbb' (or an (r, g, b) tuple) -> (r, g, b)."""
    if isinstance(value, (tuple, list)) and len(value) == 3:
        return tuple(max(0, min(255, int(v))) for v in value)
    text = str(value or "").strip().lstrip("#")
    if len(text) == 6:
        try:
            return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
        except ValueError:
            pass
    return default


class Widget(Base):
    widget_id = ""

    def __init__(self, *args, **kwargs):
        super(Widget, self).__init__(*args, **kwargs)
        self._fonts = {}
        self._t0 = time.monotonic()
        self.canvas = None

    # -- configuration --------------------------------------------------------
    def cfg(self):
        return settings.widget_cfg(self.widget_id)

    def duration(self):
        try:
            return float(self.cfg().get("duration", 10))
        except (TypeError, ValueError):
            return 10.0

    # -- timing -----------------------------------------------------------------
    def elapsed(self):
        return time.monotonic() - self._t0

    def remaining(self):
        return self.duration() - self.elapsed()

    # -- geometry ---------------------------------------------------------------
    @property
    def width(self):
        return self.canvas.width

    @property
    def height(self):
        return self.canvas.height

    # -- fonts / colors ---------------------------------------------------------
    def load_font(self, name=SMALL_FONT):
        font = self._fonts.get(name)
        if font is None:
            font = graphics.Font()
            try:
                ok = font.LoadFont(paths.font(name))
            except Exception as ex:  # the real bindings raise instead of returning False
                raise RuntimeError("cannot load font %s: %s" % (name, ex))
            if ok is False:
                raise RuntimeError("cannot load font %s" % name)
            self._fonts[name] = font
        return font

    @staticmethod
    def color(rgb):
        r, g, b = parse_color(rgb)
        return graphics.Color(r, g, b)

    @staticmethod
    def text_width(font, text):
        total = 0
        for ch in text:
            w = font.CharacterWidth(ord(ch))
            total += w if w > 0 else 0
        return total

    def fit_text(self, font, text, max_width):
        """Longest prefix of `text` that fits in max_width pixels."""
        out = ""
        for ch in text:
            if self.text_width(font, out + ch) > max_width:
                break
            out += ch
        return out

    # -- drawing helpers --------------------------------------------------------
    def draw_text(self, canvas, font, text, color, x=0, top=0, align="left", width=None):
        """Draw `text` with its top edge at `top`.

        align 'left': starts at x. 'center': centred in [x, x+width). 'right':
        ends at x+width. width defaults to the rest of the panel.
        """
        text = ascii_fold(text)
        if isinstance(font, str):
            font = self.load_font(font)
        if width is None:
            width = canvas.width - x
        tw = self.text_width(font, text)
        if align == "center":
            x = x + (width - tw) // 2
        elif align == "right":
            x = x + width - tw
        graphics.DrawText(canvas, font, x, top + font.baseline, self.color(color), text)
        return tw

    @staticmethod
    def fill_rect(canvas, x, y, w, h, rgb):
        r, g, b = rgb
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                canvas.SetPixel(xx, yy, r, g, b)

    def draw_arrow(self, canvas, x, top, direction, rgb, size=5):
        """5 px wide arrow: up (direction > 0), down (< 0) or a flat dash (0)."""
        r, g, b = rgb
        mid = x + size // 2
        half = size // 2
        if direction == 0:
            for xx in range(x, x + size):
                canvas.SetPixel(xx, top + half, r, g, b)
            return
        for i in range(half + 1):
            row = top + i if direction > 0 else top + half - i
            for xx in range(mid - i, mid + i + 1):
                canvas.SetPixel(xx, row, r, g, b)

    def draw_bar(self, canvas, x, top, w, h, fraction, rgb, bg=(45, 45, 45)):
        fraction = max(0.0, min(1.0, fraction))
        self.fill_rect(canvas, x, top, w, h, bg)
        filled = int(round(w * fraction))
        if filled:
            self.fill_rect(canvas, x, top, filled, h, rgb)

    # -- frames -----------------------------------------------------------------
    def begin(self):
        self.canvas = self.matrix.CreateFrameCanvas()
        self._t0 = time.monotonic()
        return self.canvas

    def present(self):
        self.canvas = self.matrix.SwapOnVSync(self.canvas)

    def play(self, seconds, draw, fps=10):
        """Call draw(canvas, t) every frame for `seconds` (the canvas is cleared first)."""
        interval = 1.0 / fps
        start = time.monotonic()
        while True:
            frame_start = time.monotonic()
            t = frame_start - start
            if t >= seconds:
                break
            self.canvas.Clear()
            draw(self.canvas, t)
            self.present()
            time.sleep(max(0.01, interval - (time.monotonic() - frame_start)))

    sleep_frames = play

    def show_message(self, lines, color=RED, seconds=4):
        """Centred text lines ('Sin conexion', errors...) for a few seconds."""
        font = self.load_font(SMALL_FONT)
        lines = [ascii_fold(l) for l in lines][:4]
        line_h = font.height
        top = max(0, (self.height - line_h * len(lines)) // 2)

        def draw(canvas, t):
            for i, line in enumerate(lines):
                self.draw_text(canvas, font, line, color, top=top + i * line_h, align="center")

        self.play(seconds, draw, fps=4)

    # -- entry points -----------------------------------------------------------
    def render(self):
        raise NotImplementedError

    async def run(self):
        self.begin()
        self.render()
        return True


def run_widget(cls):
    """`if __name__ == "__main__": run_widget(MyWidget)`"""
    if os.name == "nt":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    widget = cls()
    if not asyncio.run(widget.process()):
        widget.parser.print_help()
