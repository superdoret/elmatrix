"""Shows one notification: scrolls long text, centres short text.

Args: --message TEXT  --color #rrggbb  --seconds N  (all optional).
"""
import unicodedata

from widget_base import Widget, run_widget, ascii_fold, parse_color, WHITE

MAX_LENGTH = 200
MIN_SPEED = 30.0    # pixels per second
MAX_SPEED = 120.0


def sanitize_message(text, max_length=MAX_LENGTH):
    """Drop control characters, collapse whitespace, fold to ASCII, clamp the length."""
    text = "".join(" " if ch.isspace() else ch for ch in str(text or "")
                   if ch.isspace() or not unicodedata.category(ch).startswith("C"))
    text = " ".join(ascii_fold(text).split())
    return text[:max_length].rstrip()


def clamp_seconds(value, default=10.0, low=1.0, high=120.0):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, value))


def plan_scroll(text_width, panel_width, seconds):
    """-> (speed px/s, total seconds). The text always scrolls fully at least once."""
    distance = text_width + panel_width
    speed = max(MIN_SPEED, min(MAX_SPEED, distance / float(seconds)))
    return speed, max(float(seconds), distance / speed)


class Notify(Widget):
    widget_id = "notifications"

    def __init__(self, *args, **kwargs):
        super(Notify, self).__init__(*args, **kwargs)
        self.parser.add_argument("--message", default="", type=str)
        self.parser.add_argument("--color", default="", type=str)
        self.parser.add_argument("--seconds", default="", type=str)

    def render(self):
        cfg = self.cfg()
        message = sanitize_message(self.args.message) or "(mensaje vacio)"
        color = parse_color(self.args.color or cfg["default_color"], WHITE)
        seconds = clamp_seconds(self.args.seconds, clamp_seconds(cfg["default_seconds"]))
        font = self.load_font("9x15B.bdf")
        width = self.canvas.width
        top = (self.canvas.height - font.height) // 2
        text_w = self.text_width(font, message)

        if text_w <= width:
            def draw(canvas, t):
                self.draw_text(canvas, font, message, color, top=top, align="center")
            self.play(seconds, draw, fps=4)
            return

        speed, total = plan_scroll(text_w, width, seconds)
        cycle = (text_w + width) / speed

        def draw(canvas, t):
            x = width - int((t % cycle) * speed)
            self.draw_text(canvas, font, message, color, x=x, top=top)

        self.play(total, draw, fps=25)


if __name__ == "__main__":
    run_widget(Notify)
