"""Days left until important dates (`Name|YYYY-MM-DD` per line)."""
from datetime import date, datetime

from widget_base import Widget, run_widget, ascii_fold, WHITE, YELLOW, GREEN, RED, CYAN


def parse_events(lines):
    """['Name|YYYY-MM-DD', ...] -> [(name, date)]; invalid lines are skipped."""
    out = []
    for line in lines:
        if "|" not in str(line):
            continue
        name, text = (p.strip() for p in str(line).split("|", 1))
        try:
            when = datetime.strptime(text, "%Y-%m-%d").date()
        except ValueError:
            continue
        if name:
            out.append((name, when))
    return out


def days_left(target, today):
    return (target - today).days


def build_rows(events, today, show_past=False):
    """-> [(name, days)] upcoming first (soonest first), then past ones if wanted."""
    rows = [(name, days_left(when, today)) for name, when in events]
    upcoming = sorted((r for r in rows if r[1] >= 0), key=lambda r: r[1])
    past = sorted((r for r in rows if r[1] < 0), key=lambda r: -r[1])
    return upcoming + (past if show_past else [])


def describe(days):
    """-> (big text, caption, color)."""
    if days == 0:
        return "HOY", "", GREEN
    if days > 0:
        return str(days), "dia" if days == 1 else "dias", WHITE
    return str(-days), "dia atras" if days == -1 else "dias atras", RED


class Countdown(Widget):
    widget_id = "countdown"

    def render(self):
        cfg = self.cfg()
        rows = build_rows(parse_events(cfg["events"]), date.today(), cfg["show_past"])
        if not rows:
            self.show_message(["Sin eventos"], color=YELLOW, seconds=3)
            return
        page_seconds = max(3.0, self.duration() / len(rows))
        small = self.load_font("5x8.bdf")
        big = self.load_font("9x15B.bdf")

        def draw(canvas, t):
            name, days = rows[int(t / page_seconds) % len(rows)]
            text, caption, color = describe(days)
            if days == 0 and int(t * 2) % 2:
                color = YELLOW  # blink on the day itself
            self.draw_text(canvas, small, self.fit_text(small, ascii_fold(name), canvas.width - 2),
                           CYAN, top=0, align="center")
            self.draw_text(canvas, big, text, color, top=10, align="center")
            if caption:
                self.draw_text(canvas, small, caption, WHITE, top=25, align="center")

        self.play(max(1.0, self.remaining()), draw, fps=4)


if __name__ == "__main__":
    run_widget(Countdown)
