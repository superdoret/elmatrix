"""Pure-logic tests for the new widgets and net.py (no network, no display)."""
import io
import json
import os
import random
import sys
import unittest
import urllib.error
from datetime import date, datetime, timezone

from tests import _env  # noqa: F401  (src/ on sys.path)
from tests._env import DataDirTestCase, SRC

# The widgets import rgbmatrix: use the simulated one (the real one needs the Pi build).
sys.path.insert(0, os.path.join(SRC, "simulator"))

import net
import paths
import widget_base
from widgets import countdown, forecast, notify, pixelart, rates, sports, sysinfo, worldclock


class FakeResponse(object):
    def __init__(self, body):
        self._body = body if isinstance(body, bytes) else body.encode("utf-8")

    def read(self, n=-1):
        return self._body

    def close(self):
        pass


def opener_returning(body, calls=None):
    def opener(request, timeout=None):
        if calls is not None:
            calls.append(request)
        return FakeResponse(body)
    return opener


def opener_failing(exc, calls=None):
    def opener(request, timeout=None):
        if calls is not None:
            calls.append(request)
        raise exc
    return opener


class NetTests(DataDirTestCase):
    URL = "http://example.invalid/x?key=secret"

    def test_fetch_sets_user_agent_and_caches_to_disk(self):
        calls = []
        data = net.get_json(self.URL, opener=opener_returning('{"a": 1}', calls))
        self.assertEqual(data, {"a": 1})
        self.assertIn("elmatrix", calls[0].get_header("User-agent"))
        cache = os.path.join(paths.data_dir(), "cache")
        files = os.listdir(cache)
        self.assertEqual(len(files), 1)
        self.assertNotIn("secret", files[0])  # file names must not leak API keys

    def test_fresh_cache_skips_network(self):
        net.get_json(self.URL, cache_seconds=60, opener=opener_returning('{"a": 1}'))
        calls = []
        data = net.get_json(self.URL, cache_seconds=60, opener=opener_failing(OSError("x"), calls))
        self.assertEqual(data, {"a": 1})
        self.assertEqual(calls, [])

    def test_stale_cache_used_on_error(self):
        path = net._cache_file(self.URL)
        net._write_cache(path, {"old": True}, ts=1.0)
        for exc in (urllib.error.URLError("down"), OSError("boom"), TimeoutError("slow")):
            self.assertEqual(net.get_json(self.URL, cache_seconds=60, opener=opener_failing(exc)),
                             {"old": True})

    def test_stale_cache_used_on_invalid_json(self):
        net._write_cache(net._cache_file(self.URL), {"old": 1})
        self.assertEqual(net.get_json(self.URL, opener=opener_returning("<html>")), {"old": 1})

    def test_error_without_cache_raises_neterror(self):
        with self.assertRaises(net.NetError):
            net.get_json(self.URL, opener=opener_failing(urllib.error.URLError("down")))
        with self.assertRaises(net.NetError):
            net.get_json(self.URL, opener=opener_returning(b"\xff\xfe not json"))
        http_error = urllib.error.HTTPError(self.URL, 500, "err", {}, io.BytesIO(b""))
        self.addCleanup(http_error.close)
        with self.assertRaises(net.NetError):
            net.get_json(self.URL, opener=opener_failing(http_error))


class WidgetBaseTests(unittest.TestCase):
    def test_ascii_fold(self):
        self.assertEqual(widget_base.ascii_fold("Año nuevo Málaga"), "Ano nuevo Malaga")
        self.assertEqual(widget_base.ascii_fold("a\tb\nc"), "a b c")
        self.assertEqual(widget_base.ascii_fold("東京"), "??")

    def test_parse_color(self):
        self.assertEqual(widget_base.parse_color("#ff8000"), (255, 128, 0))
        self.assertEqual(widget_base.parse_color("zzz", (1, 2, 3)), (1, 2, 3))
        self.assertEqual(widget_base.parse_color((300, -5, 7)), (255, 0, 7))


class RatesTests(unittest.TestCase):
    def test_clean_ids(self):
        self.assertEqual(rates.clean_ids(["Bitcoin", " bitcoin ", "bad id!", "", "ethereum"]),
                         ["bitcoin", "ethereum"])

    def test_format_price_is_short(self):
        for value in (0.0123456, 1.5, 99.999, 2543.2, 67234.5, 123456.7, 1405):
            self.assertLessEqual(len(rates.format_price(value)), 6, value)
        self.assertEqual(rates.format_price(67234.5), "67234")
        self.assertEqual(rates.format_price(123456.7), "123k")

    def test_parse_crypto(self):
        data = {"bitcoin": {"usd": 67234.5, "usd_24h_change": 1.2},
                "ethereum": {"usd": 3000.0, "usd_24h_change": -0.5},
                "weird": {"usd": "n/a"}}
        rows = rates.parse_crypto(data, ["bitcoin", "ethereum", "weird", "missing"], "usd")
        self.assertEqual(rows, [("BTC", "67234", 1.2), ("ETH", "3000", -0.5)])
        self.assertEqual(rates.parse_crypto(None, ["bitcoin"], "usd"), [])
        self.assertEqual(rates.parse_crypto({"bitcoin": {"usd": 1.0}}, ["bitcoin"], "usd"),
                         [("BTC", "1.00", None)])

    def test_parse_dolar(self):
        data = {"casa": "blue", "compra": 1380, "venta": 1405, "fechaActualizacion": "x"}
        self.assertEqual(rates.parse_dolar(data, "blue"), ("BLUE", "1405", None))
        self.assertIsNone(rates.parse_dolar({"venta": None}, "blue"))
        self.assertIsNone(rates.parse_dolar([], "blue"))

    def test_arrow_and_pages(self):
        self.assertEqual(rates.arrow_for(2.0)[0], 1)
        self.assertEqual(rates.arrow_for(-2.0)[0], -1)
        self.assertEqual(rates.arrow_for(None)[0], 0)
        self.assertEqual(rates.paginate(list(range(9))), [[0, 1, 2, 3], [4, 5, 6, 7], [8]])


class SysinfoTests(unittest.TestCase):
    def test_parse_thermal_text(self):
        self.assertEqual(sysinfo.parse_thermal_text("54321\n"), 54.321)
        self.assertEqual(sysinfo.parse_thermal_text("48"), 48.0)
        self.assertIsNone(sysinfo.parse_thermal_text("garbage"))

    def test_parse_host_port(self):
        self.assertEqual(sysinfo.parse_host_port("example.com"), ("example.com", 443))
        self.assertEqual(sysinfo.parse_host_port("example.com:80"), ("example.com", 80))
        self.assertEqual(sysinfo.parse_host_port("[::1]:8080"), ("::1", 8080))
        self.assertEqual(sysinfo.parse_host_port("::1"), ("::1", 443))
        self.assertIsNone(sysinfo.parse_host_port(""))
        self.assertIsNone(sysinfo.parse_host_port("host:abc"))
        self.assertIsNone(sysinfo.parse_host_port("host:99999"))

    def test_build_lines_with_na(self):
        cfg = {"show_cpu": True, "show_temp": True, "show_ram": True, "show_disk": False}
        lines = sysinfo.build_lines({"cpu": 12.4, "temp": None, "ram": 50.0}, cfg, 23.4, True)
        self.assertEqual([l[0] for l in lines], ["CPU", "TMP", "RAM", "PNG"])
        self.assertEqual(lines[0][1], "12%")
        self.assertEqual(lines[1][1:], ("N/A", None))
        self.assertEqual(lines[3][1], "23ms")
        failed = sysinfo.build_lines({}, {"show_cpu": False}, None, True)
        self.assertEqual(failed, [("PNG", "ERR", None)])

    def test_tcp_ping_unreachable_returns_none(self):
        self.assertIsNone(sysinfo.tcp_ping("127.0.0.1", 1, timeout=0.3))


class SportsTests(unittest.TestCase):
    def test_pick_team(self):
        data = {"teams": [{"strTeam": "Barcelona SC", "idTeam": "1"},
                          {"strTeam": "Barcelona", "idTeam": "2"}]}
        self.assertEqual(sports.pick_team(data, "barcelona")["idTeam"], "2")
        self.assertEqual(sports.pick_team(data, "nothing")["idTeam"], "1")
        self.assertIsNone(sports.pick_team({"teams": None}, "x"))
        self.assertIsNone(sports.pick_team(None, "x"))

    def test_sports_key_maps_the_disabled_free_key(self):
        for value in ("3", " 3 ", "", None):
            self.assertEqual(sports.sports_key(value), "123")
        self.assertEqual(sports.sports_key("123"), "123")
        self.assertEqual(sports.sports_key("mykey"), "mykey")

    def test_parse_last_and_next(self):
        last = {"results": [
            {"strHomeTeam": "A", "strAwayTeam": "B", "intHomeScore": "1", "intAwayScore": "0",
             "dateEvent": "2024-01-01", "strTimestamp": "2024-01-01T20:00:00"},
            {"strHomeTeam": "Atlético", "strAwayTeam": "C", "intHomeScore": "3", "intAwayScore": None,
             "dateEvent": "2024-02-01", "strTimestamp": "2024-02-01T20:00:00"}]}
        parsed = sports.parse_last(last)
        self.assertEqual(parsed["home"], "Atletico")
        self.assertEqual((parsed["home_score"], parsed["away_score"]), ("3", "-"))
        nxt = {"events": [{"strHomeTeam": "X", "strAwayTeam": "Y", "dateEvent": "2030-05-02"},
                          {"strHomeTeam": "P", "strAwayTeam": "Q", "dateEvent": "2030-05-01"}]}
        self.assertEqual(sports.parse_next(nxt)["home"], "P")
        self.assertEqual(sports.parse_next(nxt)["when"], "01/05")  # date only, no time

    def test_missing_or_empty_data(self):
        for empty in (None, {}, {"results": None}, {"events": []}, {"events": "bad"}):
            self.assertIsNone(sports.parse_last(empty))
            self.assertIsNone(sports.parse_next(empty))

    def test_format_when_without_data(self):
        self.assertEqual(sports.format_when({}), "--/--")
        dt, has_time = sports.event_datetime({"strTimestamp": "2024-01-01T20:00:00"})
        self.assertTrue(has_time)
        self.assertEqual(dt.astimezone(timezone.utc).hour, 20)


class WorldclockTests(unittest.TestCase):
    def test_parse_zones(self):
        self.assertEqual(worldclock.parse_zones(["Tokyo|Asia/Tokyo", "", "America/New_York", " A | B "]),
                         [("Tokyo", "Asia/Tokyo"), ("New York", "America/New_York"), ("A", "B")])

    def test_format_time(self):
        now = datetime(2024, 1, 15, 15, 30, tzinfo=timezone.utc)
        self.assertEqual(worldclock.format_time(now, "Asia/Tokyo", True), "00:30")
        self.assertEqual(worldclock.format_time(now, "UTC", False), "3:30p")
        self.assertEqual(worldclock.format_time(now.replace(hour=0), "UTC", False), "12:30a")

    def test_invalid_zone_is_none_not_a_crash(self):
        now = datetime(2024, 1, 15, 15, 30, tzinfo=timezone.utc)
        for bad in ("Nowhere/City", "", "../../etc/passwd", "Europe/"):
            self.assertIsNone(worldclock.format_time(now, bad), bad)


class CountdownTests(unittest.TestCase):
    TODAY = date(2026, 11, 10)

    def test_parse_events_skips_invalid(self):
        lines = ["Navidad|2026-12-25", "bad", "x|2026-13-40", "|2026-01-01", "Ano|2027-01-01"]
        self.assertEqual([n for n, _ in countdown.parse_events(lines)], ["Navidad", "Ano"])

    def test_days_left(self):
        self.assertEqual(countdown.days_left(date(2026, 11, 10), self.TODAY), 0)
        self.assertEqual(countdown.days_left(date(2026, 12, 25), self.TODAY), 45)
        self.assertEqual(countdown.days_left(date(2026, 11, 9), self.TODAY), -1)
        self.assertEqual(countdown.days_left(date(2028, 3, 1), date(2028, 2, 28)), 2)  # leap year

    def test_build_rows_and_show_past(self):
        events = [("past", date(2026, 1, 1)), ("far", date(2027, 1, 1)),
                  ("today", self.TODAY), ("soon", date(2026, 11, 12))]
        self.assertEqual(countdown.build_rows(events, self.TODAY),
                         [("today", 0), ("soon", 2), ("far", 52)])
        with_past = countdown.build_rows(events, self.TODAY, show_past=True)
        self.assertEqual(with_past[-1][0], "past")

    def test_describe(self):
        self.assertEqual(countdown.describe(0)[0], "HOY")
        self.assertEqual(countdown.describe(1)[:2], ("1", "dia"))
        self.assertEqual(countdown.describe(5)[:2], ("5", "dias"))
        self.assertEqual(countdown.describe(-3)[:2], ("3", "dias atras"))


class ForecastTests(unittest.TestCase):
    def test_every_mapped_icon_exists(self):
        for code in list(forecast.WMO_ICONS) + [None, "x", 1234]:
            name = forecast.icon_for_code(code)
            self.assertTrue(os.path.exists(os.path.join(paths.WEATHER_DIR, name + ".PNG")), name)

    def test_unknown_code_falls_back(self):
        self.assertEqual(forecast.icon_for_code(1234), "NONE")
        self.assertEqual(forecast.icon_for_code(None), "NONE")
        self.assertEqual(forecast.icon_for_code(0), "SUNNY")

    def test_parse_geocode(self):
        data = {"results": [{"name": "Barcelona", "latitude": 41.38, "longitude": 2.17}]}
        self.assertEqual(forecast.parse_geocode(data), ("Barcelona", 41.38, 2.17))
        self.assertIsNone(forecast.parse_geocode({"generationtime_ms": 1}))  # no "results" key
        self.assertIsNone(forecast.parse_geocode({"results": [{"name": "x"}]}))

    def test_parse_daily(self):
        data = {"daily": {"time": ["a", "b", "c"], "weather_code": [0, 61, None],
                          "temperature_2m_max": [20.4, 18.0, 17.0],
                          "temperature_2m_min": [10.0, None]}}
        days = forecast.parse_daily(data, 2)
        self.assertEqual(len(days), 2)
        self.assertEqual(days[1]["code"], 61)
        self.assertIsNone(days[1]["tmin"])
        self.assertEqual(forecast.parse_daily({}, 3), [])
        self.assertEqual(forecast.fmt_temp(20.6), "21")
        self.assertEqual(forecast.fmt_temp(None), "--")


class NotifyTests(unittest.TestCase):
    def test_sanitize_message(self):
        self.assertEqual(notify.sanitize_message("  Hola\x00\x07 mundo\n\tlinea  "), "Hola mundo linea")
        self.assertEqual(notify.sanitize_message("ñandú ✓"), "nandu ?")
        self.assertEqual(len(notify.sanitize_message("x" * 1000)), notify.MAX_LENGTH)
        self.assertEqual(notify.sanitize_message(None), "")

    def test_clamp_seconds(self):
        self.assertEqual(notify.clamp_seconds("abc", 7), 7)
        self.assertEqual(notify.clamp_seconds("0"), 1.0)
        self.assertEqual(notify.clamp_seconds("9999"), 120.0)

    def test_plan_scroll_always_scrolls_fully(self):
        speed, total = notify.plan_scroll(1800, 64, 10)
        self.assertLessEqual(speed, notify.MAX_SPEED)
        self.assertGreaterEqual(total * speed, 1800 + 64 - 1e-6)
        speed, total = notify.plan_scroll(70, 64, 60)
        self.assertEqual(speed, notify.MIN_SPEED)
        self.assertEqual(total, 60)


class PixelartTests(unittest.TestCase):
    def test_sky_and_night(self):
        self.assertTrue(pixelart.is_night(2))
        self.assertTrue(pixelart.is_night(22))
        self.assertFalse(pixelart.is_night(12))
        for hour in (0, 3.3, 6.5, 12, 19, 23.99, 24, 30):
            self.assertTrue(all(0 <= c <= 255 for c in pixelart.sky_color(hour)))
        self.assertGreater(sum(pixelart.sky_color(12)), sum(pixelart.sky_color(1)))

    def test_body_arc_stays_on_screen(self):
        for tenth in range(0, 240):
            hour = tenth / 10.0
            kind, x, y = pixelart.body_position(hour, 64, 25, 11)
            self.assertIn(kind, ("sun", "moon"))
            self.assertTrue(0 <= x <= 63 and 11 <= y <= 25, (hour, x, y))
        self.assertEqual(pixelart.body_position(12, 64, 25, 11)[0], "sun")
        self.assertEqual(pixelart.body_position(12, 64, 25, 11)[2], 11)
        self.assertEqual(pixelart.body_position(0, 64, 25, 11)[0], "moon")

    def test_advance_rules(self):
        body = [(1, 0), (0, 0)]
        self.assertIsNone(pixelart.advance(body, (0, -1), None, 3, 1))   # wall
        self.assertEqual(pixelart.advance(body, (1, 0), None, 3, 1), ([(2, 0), (1, 0)], False))
        grown, ate = pixelart.advance(body, (1, 0), (2, 0), 3, 1)
        self.assertTrue(ate)
        self.assertEqual(len(grown), 3)
        loop = [(1, 1), (1, 0), (0, 0), (0, 1)]
        self.assertIsNotNone(pixelart.advance(loop, (-1, 0), None, 3, 3))  # into the vacating tail

    def test_ai_never_moves_into_itself_on_tiny_boards(self):
        for cols, rows in ((3, 1), (3, 2), (2, 2), (4, 3)):
            for seed in range(30):
                rng = random.Random(seed)
                game = pixelart.SnakeGame(cols, rows, rng)
                for _ in range(200):
                    if game.over:
                        game.reset()
                    d = pixelart.choose_direction(game.body, game.food, cols, rows, rng)
                    if d is None:
                        game.over = True
                        continue
                    head = game.body[0]
                    cell = (head[0] + d[0], head[1] + d[1])
                    self.assertTrue(0 <= cell[0] < cols and 0 <= cell[1] < rows)
                    ate = cell == game.food
                    blocked = game.body if ate else game.body[:-1]
                    self.assertNotIn(cell, blocked)
                    game.step()
                    self.assertEqual(len(set(game.body)), len(game.body))  # never overlaps

    def test_ai_reaches_food_on_open_board(self):
        rng = random.Random(1)
        game = pixelart.SnakeGame(32, 16, rng)
        for _ in range(400):
            if game.over:
                break
            game.step()
        self.assertGreater(len(game.body), 3)

    def test_stuck_snake_is_game_over(self):
        game = pixelart.SnakeGame(3, 1)
        game.body, game.food = [(0, 0)], (2, 0)
        game.step()
        game.step()   # eats the food (length 2 on a 3x1 board)
        game.step()
        game.step()
        self.assertTrue(game.over)

    def test_place_food_on_full_board(self):
        self.assertIsNone(pixelart.place_food([(0, 0), (1, 0)], 2, 1))


if __name__ == "__main__":
    unittest.main()
