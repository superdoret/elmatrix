"""Current time in several time zones (zoneinfo; `Label|Zone` per line)."""
from datetime import datetime, timezone

from widget_base import Widget, run_widget, ascii_fold, WHITE, YELLOW, RED, CYAN

try:
    from zoneinfo import ZoneInfo
except ImportError:  # Python < 3.9 is not supported
    ZoneInfo = None

PER_PAGE = 4


def parse_zones(lines):
    """['Label|Zone', ...] -> [(label, zone name)]; blank lines are skipped.

    A line without '|' uses the last part of the zone as its label.
    """
    out = []
    for line in lines:
        line = str(line).strip()
        if not line:
            continue
        if "|" in line:
            label, zone = (p.strip() for p in line.split("|", 1))
        else:
            zone = line
            label = zone.rsplit("/", 1)[-1].replace("_", " ")
        out.append((label or zone, zone))
    return out


def format_time(now_utc, zone, format24h=True):
    """'HH:MM' (24h) or 'h:MMa'/'h:MMp' (12h); None when the zone is invalid."""
    if ZoneInfo is None:
        return None
    try:
        local = now_utc.astimezone(ZoneInfo(zone))
    except Exception:  # unknown zone, bad key, missing tz database...
        return None
    if format24h:
        return local.strftime("%H:%M")
    hour = local.hour % 12 or 12
    return "%d:%02d%s" % (hour, local.minute, "a" if local.hour < 12 else "p")


def paginate(items, per_page=PER_PAGE):
    return [items[i:i + per_page] for i in range(0, len(items), per_page)]


class WorldClock(Widget):
    widget_id = "worldclock"

    def render(self):
        cfg = self.cfg()
        zones = parse_zones(cfg["zones"])
        if not zones:
            self.show_message(["Sin zonas", "configuradas"], color=YELLOW, seconds=3)
            return
        pages = paginate(zones)
        page_seconds = max(3.0, self.duration() / len(pages))
        font = self.load_font("5x8.bdf")
        h24 = cfg["format24h"]

        def draw(canvas, t):
            page = pages[int(t / page_seconds) % len(pages)]
            now = datetime.now(timezone.utc)
            lh = font.height
            top0 = (canvas.height - lh * len(page)) // 2
            time_w = self.text_width(font, "00:00" if h24 else "00:00p")
            for i, (label, zone) in enumerate(page):
                top = top0 + i * lh
                text = format_time(now, zone, h24)
                if text is None:
                    self.draw_text(canvas, font, self.fit_text(font, ascii_fold(label), 40) + " ?",
                                   RED, x=1, top=top)
                    self.draw_text(canvas, font, "ERR", RED, top=top, align="right",
                                   width=canvas.width - 1)
                    continue
                shown = self.fit_text(font, ascii_fold(label), canvas.width - time_w - 6)
                self.draw_text(canvas, font, shown, CYAN, x=1, top=top)
                self.draw_text(canvas, font, text, WHITE, top=top, align="right",
                               width=canvas.width - 1)

        self.play(max(1.0, self.remaining()), draw, fps=2)


if __name__ == "__main__":
    run_widget(WorldClock)
