"""Crypto prices (CoinGecko) and Argentine dollar (dolarapi.com), paged."""
import re
import urllib.parse

import net
from widget_base import Widget, run_widget, GREEN, RED, GREY, WHITE, YELLOW

COINGECKO = ("https://api.coingecko.com/api/v3/simple/price"
             "?ids=%s&vs_currencies=%s&include_24hr_change=true")
DOLAR = "https://dolarapi.com/v1/dolares/%s"
CACHE_SECONDS = 60
PER_PAGE = 4

SYMBOLS = {
    "bitcoin": "BTC", "ethereum": "ETH", "solana": "SOL", "dogecoin": "DOGE",
    "cardano": "ADA", "ripple": "XRP", "litecoin": "LTC", "tether": "USDT",
    "binancecoin": "BNB", "polkadot": "DOT", "tron": "TRX", "monero": "XMR",
}
DOLAR_LABELS = {"blue": "BLUE", "oficial": "OFIC", "bolsa": "MEP",
                "contadoconliqui": "CCL", "tarjeta": "TARJ"}


def clean_ids(values):
    """CoinGecko ids: lowercase letters, digits and dashes only; no duplicates."""
    out = []
    for v in values:
        v = str(v).strip().lower()
        if re.fullmatch(r"[a-z0-9-]{1,60}", v) and v not in out:
            out.append(v)
    return out


def symbol_for(coin_id):
    return SYMBOLS.get(coin_id, coin_id[:4].upper())


def format_price(value):
    """At most 6 characters, whatever the magnitude."""
    value = float(value)
    if value >= 100000:
        return "%dk" % round(value / 1000)
    if value >= 1000:
        return "%d" % round(value)
    if value >= 1:
        return "%.2f" % value
    return "%.4f" % value


def parse_crypto(data, ids, vs):
    """CoinGecko simple/price JSON -> [(label, price text, 24h change or None)]."""
    rows = []
    if not isinstance(data, dict):
        return rows
    for coin in ids:
        entry = data.get(coin)
        if not isinstance(entry, dict) or not isinstance(entry.get(vs), (int, float)):
            continue
        change = entry.get(vs + "_24h_change")
        change = float(change) if isinstance(change, (int, float)) else None
        rows.append((symbol_for(coin), format_price(entry[vs]), change))
    return rows


def parse_dolar(data, kind):
    """dolarapi.com JSON -> (label, price text, None) or None."""
    if not isinstance(data, dict) or not isinstance(data.get("venta"), (int, float)):
        return None
    return (DOLAR_LABELS.get(kind, str(kind)[:4].upper()), format_price(data["venta"]), None)


def paginate(rows, per_page=PER_PAGE):
    return [rows[i:i + per_page] for i in range(0, len(rows), per_page)]


def arrow_for(change):
    """(direction, color) from the 24h change."""
    if change is None or abs(change) < 0.005:
        return 0, GREY
    return (1, GREEN) if change > 0 else (-1, RED)


class Rates(Widget):
    widget_id = "rates"

    def fetch_rows(self, cfg):
        rows = []
        ids = clean_ids(cfg["assets"])
        vs = cfg["vs_currency"]
        if ids:
            url = COINGECKO % (urllib.parse.quote(",".join(ids), safe=","), vs)
            try:
                rows += parse_crypto(net.get_json(url, cache_seconds=CACHE_SECONDS), ids, vs)
            except net.NetError as ex:
                print("rates: crypto: %s" % ex)
        if cfg["show_dolar"]:
            kind = cfg["dolar_type"]
            try:
                row = parse_dolar(net.get_json(DOLAR % urllib.parse.quote(kind),
                                               cache_seconds=CACHE_SECONDS), kind)
                if row:
                    rows.append(row)
            except net.NetError as ex:
                print("rates: dolar: %s" % ex)
        return rows

    def render(self):
        rows = self.fetch_rows(self.cfg())
        if not rows:
            self.show_message(["Sin conexion"], seconds=max(2, min(4, self.remaining())))
            return
        pages = paginate(rows)
        page_seconds = max(3.0, self.duration() / len(pages))
        font = self.load_font("5x8.bdf")
        total = max(1.0, self.remaining())

        def draw(canvas, t):
            page = pages[int(t / page_seconds) % len(pages)]
            line_h = font.height
            top0 = (canvas.height - line_h * len(page)) // 2
            for i, (label, price, change) in enumerate(page):
                top = top0 + i * line_h
                direction, color = arrow_for(change)
                self.draw_text(canvas, font, label, YELLOW, x=1, top=top)
                self.draw_text(canvas, font, price, WHITE, x=0, top=top, align="right",
                               width=canvas.width - 9)
                self.draw_arrow(canvas, canvas.width - 7, top + 2, direction, color)

        self.play(total, draw, fps=2)


if __name__ == "__main__":
    run_widget(Rates)
