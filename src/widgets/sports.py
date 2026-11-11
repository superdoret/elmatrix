"""Last result and next match of a team (TheSportsDB v1)."""
import re
import urllib.parse
from datetime import datetime, timezone

import net
from widget_base import Widget, run_widget, ascii_fold, YELLOW, WHITE, CYAN, GREEN

BASE = "https://www.thesportsdb.com/api/v1/json/%s/"


def sports_key(value):
    """The old free key "3" was disabled by TheSportsDB; its free test key is now "123"."""
    key = str(value or "").strip()
    return "123" if key in ("", "3") else key


TEAM_CACHE = 86400
EVENT_CACHE = 600


def _list(data, key):
    items = data.get(key) if isinstance(data, dict) else None
    return [e for e in items if isinstance(e, dict)] if isinstance(items, list) else []


def pick_team(data, name):
    """Exact (case-insensitive) match first, else the first result."""
    teams = _list(data, "teams")
    wanted = (name or "").strip().lower()
    for team in teams:
        if str(team.get("strTeam", "")).strip().lower() == wanted:
            return team
    return teams[0] if teams else None


def event_datetime(event):
    """-> (datetime or None, has_time). TheSportsDB reports UTC; converted to local time."""
    stamp = event.get("strTimestamp")
    if stamp:
        try:
            dt = datetime.strptime(str(stamp)[:19], "%Y-%m-%dT%H:%M:%S")
            return dt.replace(tzinfo=timezone.utc).astimezone(), True
        except ValueError:
            pass
    date = event.get("dateEvent")
    if date:
        clock = str(event.get("strTime") or "")[:8]
        for text, fmt, has_time in ((("%s %s" % (date, clock)), "%Y-%m-%d %H:%M:%S", True),
                                    (str(date), "%Y-%m-%d", False)):
            try:
                dt = datetime.strptime(text, fmt)
            except ValueError:
                continue
            if has_time:
                return dt.replace(tzinfo=timezone.utc).astimezone(), True
            return dt, False
    return None, False


def format_when(event):
    dt, has_time = event_datetime(event)
    if dt is None:
        return "--/--"
    return dt.strftime("%d/%m %H:%M") if has_time else dt.strftime("%d/%m")


def _sort_key(event):
    dt, _ = event_datetime(event)
    return dt.timestamp() if dt is not None else 0.0


def parse_last(data):
    """Most recent finished event -> dict or None."""
    events = _list(data, "results") or _list(data, "events")
    if not events:
        return None
    event = max(events, key=_sort_key)
    return {"home": ascii_fold(event.get("strHomeTeam") or "?"),
            "away": ascii_fold(event.get("strAwayTeam") or "?"),
            "home_score": _score(event.get("intHomeScore")),
            "away_score": _score(event.get("intAwayScore")),
            "when": format_when(event)}


def parse_next(data):
    """Earliest upcoming event -> dict or None."""
    events = _list(data, "events") or _list(data, "results")
    if not events:
        return None
    event = min(events, key=_sort_key)
    return {"home": ascii_fold(event.get("strHomeTeam") or "?"),
            "away": ascii_fold(event.get("strAwayTeam") or "?"),
            "when": format_when(event)}


def _score(value):
    return str(value) if value is not None and re.fullmatch(r"\d{1,3}", str(value)) else "-"


class Sports(Widget):
    widget_id = "sports"

    def fetch(self, cfg):
        """-> (team name, last, next) ; raises NetError when offline."""
        base = BASE % urllib.parse.quote(sports_key(cfg["api_key"]), safe="")
        team_name = cfg["team"].strip()
        data = net.get_json(base + "searchteams.php?t=" + urllib.parse.quote(team_name),
                            cache_seconds=TEAM_CACHE)
        team = pick_team(data, team_name)
        if team is None or not team.get("idTeam"):
            return None, None, None
        team_id = urllib.parse.quote(str(team["idTeam"]))
        last = nxt = None
        try:
            last = parse_last(net.get_json(base + "eventslast.php?id=" + team_id,
                                           cache_seconds=EVENT_CACHE))
        except net.NetError as ex:
            print("sports: last: %s" % ex)
        try:
            nxt = parse_next(net.get_json(base + "eventsnext.php?id=" + team_id,
                                          cache_seconds=EVENT_CACHE))
        except net.NetError as ex:
            print("sports: next: %s" % ex)
        return ascii_fold(team.get("strTeam") or team_name), last, nxt

    def render(self):
        cfg = self.cfg()
        if not cfg["team"].strip():
            self.show_message(["Sin equipo"], seconds=3)
            return
        try:
            name, last, nxt = self.fetch(cfg)
        except net.NetError as ex:
            print("sports: %s" % ex)
            self.show_message(["Sin conexion"], seconds=max(2, min(4, self.remaining())))
            return
        if name is None:
            self.show_message(["Equipo no", "encontrado"], seconds=3)
            return
        pages = []
        if last:
            pages.append(("ULTIMO", last["home"], last["home_score"],
                          last["away"], last["away_score"], last["when"]))
        if nxt:
            pages.append(("PROXIMO", nxt["home"], None, nxt["away"], None, nxt["when"]))
        if not pages:
            self.show_message(["Sin datos", name[:12]], color=YELLOW, seconds=3)
            return
        page_seconds = max(4.0, self.duration() / len(pages))
        font = self.load_font("5x8.bdf")

        def draw(canvas, t):
            title, home, hs, away, as_, when = pages[int(t / page_seconds) % len(pages)]
            lh = font.height
            w = canvas.width
            self.draw_text(canvas, font, title, YELLOW, top=0, align="center")
            for i, (team, score) in enumerate(((home, hs), (away, as_))):
                top = lh + i * lh
                limit = w - (12 if score is not None else 2)
                self.draw_text(canvas, font, self.fit_text(font, team, limit), WHITE, x=1, top=top)
                if score is not None:
                    self.draw_text(canvas, font, score, GREEN, x=0, top=top, align="right",
                                   width=w - 1)
            self.draw_text(canvas, font, when, CYAN, top=3 * lh, align="center")

        self.play(max(1.0, self.remaining()), draw, fps=2)


if __name__ == "__main__":
    run_widget(Sports)
