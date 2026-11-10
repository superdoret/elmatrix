"""Multi-day forecast (Open-Meteo geocoding + daily forecast) with weather icons."""
import os
import urllib.parse

from PIL import Image

import net
import paths
from widget_base import Widget, run_widget, ascii_fold, WHITE, CYAN, YELLOW

GEOCODE = "https://geocoding-api.open-meteo.com/v1/search?name=%s&count=1"
FORECAST = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
            "&daily=weather_code,temperature_2m_max,temperature_2m_min"
            "&timezone=auto&forecast_days=%d")
GEO_CACHE = 7 * 86400
FORECAST_CACHE = 1800
ICON_SIZE = 15
FALLBACK_ICON = "NONE"

# WMO weather interpretation codes -> icon file names in assets/img/weather (without .PNG)
WMO_ICONS = {
    0: "SUNNY", 1: "SUNNY", 2: "PARTLY_CLOUDY", 3: "VERY_CLOUDY",
    45: "FOG", 48: "FOG",
    51: "LIGHT_RAIN", 53: "LIGHT_RAIN", 55: "LIGHT_RAIN",
    56: "LIGHT_FREEZING_RAIN", 57: "LIGHT_FREEZING_RAIN",
    61: "LIGHT_RAIN", 63: "HEAVY_RAIN_AT_TIMES", 65: "HEAVY_RAIN",
    66: "LIGHT_FREEZING_RAIN", 67: "MODERATE_OR_HEAVY_FREEZING_RAIN",
    71: "MODERATE_SNOW", 73: "MODERATE_SNOW", 75: "HEAVY_SNOW", 77: "MODERATE_SNOW",
    80: "LIGHT_RAIN", 81: "HEAVY_RAIN_AT_TIMES", 82: "HEAVY_RAIN",
    85: "MODERATE_SNOW", 86: "HEAVY_SNOW",
    95: "THUNDERY_OUTBREAKS_POSSIBLE", 96: "PATCHY_LIGHT_RAIN_WITH_THUNDER",
    99: "MODERATE_OR_HEAVY_RAIN_WITH_THUNDER",
}


def icon_for_code(code):
    try:
        return WMO_ICONS.get(int(code), FALLBACK_ICON)
    except (TypeError, ValueError):
        return FALLBACK_ICON


def parse_geocode(data):
    """-> (name, lat, lon) or None."""
    results = data.get("results") if isinstance(data, dict) else None
    if not results or not isinstance(results[0], dict):
        return None
    r = results[0]
    if not isinstance(r.get("latitude"), (int, float)) or not isinstance(r.get("longitude"), (int, float)):
        return None
    return str(r.get("name") or ""), float(r["latitude"]), float(r["longitude"])


def parse_daily(data, days):
    """-> [{'date', 'code', 'tmax', 'tmin'}] for up to `days` days; missing values are None."""
    daily = data.get("daily") if isinstance(data, dict) else None
    if not isinstance(daily, dict):
        return []
    dates = daily.get("time") or []
    codes = daily.get("weather_code") or []
    tmax = daily.get("temperature_2m_max") or []
    tmin = daily.get("temperature_2m_min") or []

    def at(seq, i):
        return seq[i] if i < len(seq) and isinstance(seq[i], (int, float)) else None

    return [{"date": dates[i], "code": at(codes, i), "tmax": at(tmax, i), "tmin": at(tmin, i)}
            for i in range(min(days, len(dates)))]


def fmt_temp(value):
    return "--" if value is None else "%d" % round(value)


def load_icon(name):
    path = os.path.join(paths.WEATHER_DIR, name + ".PNG")
    if not os.path.exists(path):
        path = os.path.join(paths.WEATHER_DIR, FALLBACK_ICON + ".PNG")
    image = Image.open(path)
    resample = getattr(Image, "LANCZOS", None) or Image.Resampling.LANCZOS
    image.thumbnail((ICON_SIZE, ICON_SIZE), resample)
    return image.convert("RGB")


class Forecast(Widget):
    widget_id = "forecast"

    def fetch(self, cfg):
        city = cfg["city"].strip()
        geo = parse_geocode(net.get_json(GEOCODE % urllib.parse.quote(city),
                                         cache_seconds=GEO_CACHE))
        if geo is None:
            return None, []
        _, lat, lon = geo
        days = int(cfg["days"])
        data = net.get_json(FORECAST % (lat, lon, days), cache_seconds=FORECAST_CACHE)
        return geo[0], parse_daily(data, days)

    def render(self):
        cfg = self.cfg()
        if not cfg["city"].strip():
            self.show_message(["Sin ciudad"], seconds=3)
            return
        try:
            name, days = self.fetch(cfg)
        except net.NetError as ex:
            print("forecast: %s" % ex)
            self.show_message(["Sin conexion"], seconds=max(2, min(4, self.remaining())))
            return
        if name is None:
            self.show_message(["Ciudad no", "encontrada"], seconds=3)
            return
        if not days:
            self.show_message(["Sin datos"], seconds=3)
            return
        icons = [load_icon(icon_for_code(d["code"])) for d in days]
        font = self.load_font("5x8.bdf")
        col_w = self.canvas.width // len(days)
        hot, cold = (255, 160, 60), (90, 170, 255)
        # first second: city name, then the forecast for the rest of the time
        title = ascii_fold(name)

        def draw(canvas, t):
            if t < 1.5:
                self.draw_text(canvas, font, self.fit_text(font, title, canvas.width - 2), YELLOW,
                               top=12, align="center")
                return
            for i, day in enumerate(days):
                x0 = i * col_w
                canvas.SetImage(icons[i], x0 + (col_w - icons[i].width) // 2, 0)
                self.draw_text(canvas, font, fmt_temp(day["tmax"]), hot, x=x0, top=16,
                               align="center", width=col_w)
                self.draw_text(canvas, font, fmt_temp(day["tmin"]), cold, x=x0, top=24,
                               align="center", width=col_w)

        self.play(max(2.0, self.remaining()), draw, fps=2)


if __name__ == "__main__":
    run_widget(Forecast)
