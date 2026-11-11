"""Widget catalog: every display mode the scheduler can run.

Pure data (no imports from the rest of the app) so that settings, scheduler,
runner and the web panel can all depend on it. User-facing texts are Spanish.

Field types: text, number, bool, select, list, color.
"""
from dataclasses import dataclass, asdict
from typing import Any, Optional, Tuple

FIELD_TYPES = ("text", "number", "bool", "select", "list", "color")


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    type: str
    default: Any
    help: str = ""
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    # select only: [{"value": ..., "label": "..."}]
    options: Tuple[dict, ...] = ()

    def to_dict(self):
        d = asdict(self)
        d["options"] = [dict(o) for o in self.options]
        if isinstance(self.default, list):
            d["default"] = list(self.default)
        return d


@dataclass(frozen=True)
class Widget:
    id: str
    name: str
    description: str
    category: str
    script: str = ""            # legacy: python file under src/
    module: str = ""            # new widgets: python module run with -m
    args: Tuple[str, ...] = ()  # fixed extra CLI args for this widget
    default_enabled: bool = True
    rotation: bool = True       # False: only run when triggered through the API
    uses_network: bool = False
    settings: Tuple[Field, ...] = ()

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "default_enabled": self.default_enabled,
            "rotation": self.rotation,
            "uses_network": self.uses_network,
            "settings": [f.to_dict() for f in self.settings],
        }

    def defaults(self):
        out = {}
        for f in self.settings:
            out[f.key] = list(f.default) if isinstance(f.default, list) else f.default
        return out


def _opts(*pairs):
    return tuple({"value": v, "label": l} for v, l in pairs)


def _duration(default, lo=3, hi=120):
    return Field("duration", "Duración (segundos)", "number", default,
                 "Cuánto tiempo se muestra el widget.", min=lo, max=hi, step=1)


WIDGETS: Tuple[Widget, ...] = (
    # ---- legacy modes -------------------------------------------------
    Widget("phrases", "Frases positivas", "Frases positivas con efectos de color.",
           "Texto", script="positive-phrases.py"),
    Widget("word", "Palabra", "Una palabra aleatoria que entra deslizándose.",
           "Texto", script="text.py"),
    Widget("clock", "Reloj", "Palabra aleatoria con la hora.",
           "Reloj", script="text.py", args=("--show-clock=True",)),
    Widget("weather", "Clima", "Temperatura actual de una ciudad.",
           "Información", script="weather.py", uses_network=True,
           settings=(
               Field("city", "Ciudad", "text", "",
                     "Déjala vacía para elegir una ciudad al azar."),
           )),
    Widget("commands", "Comandos", "Comandos de terminal parpadeando.",
           "Texto", script="commands.py"),
    Widget("images", "Imágenes", "Un GIF animado al azar.",
           "Entretenimiento", script="images.py",
           settings=(
               Field("duration", "Duración (segundos)", "number", 30,
                     "Cuánto tiempo se muestra el GIF.", min=5, max=300, step=1),
           )),
    Widget("tetris", "Tetris", "Tetris jugando solo.",
           "Entretenimiento", script="tetris.py"),
    # ---- new widgets --------------------------------------------------
    Widget("rates", "Cotizaciones", "Precio de criptomonedas y dólar en Argentina.",
           "Finanzas", module="widgets.rates", uses_network=True,
           settings=(
               Field("assets", "Criptomonedas", "list", ["bitcoin", "ethereum"],
                     "Un id de CoinGecko por línea (por ejemplo: bitcoin)."),
               Field("vs_currency", "Moneda de referencia", "select", "usd",
                     "Moneda en la que se muestran los precios.",
                     options=_opts(("usd", "USD"), ("eur", "EUR"))),
               Field("show_dolar", "Mostrar dólar", "bool", True,
                     "Muestra también la cotización del dólar argentino."),
               Field("dolar_type", "Tipo de dólar", "select", "blue",
                     "Cotización de dolarapi.com.",
                     options=_opts(("blue", "Blue"), ("oficial", "Oficial"),
                                   ("bolsa", "Bolsa"),
                                   ("contadoconliqui", "Contado con liqui"),
                                   ("tarjeta", "Tarjeta"))),
               _duration(12),
           )),
    Widget("sysinfo", "Sistema", "Uso de CPU, temperatura, memoria, disco y ping.",
           "Sistema", module="widgets.sysinfo",
           settings=(
               Field("show_cpu", "Mostrar CPU", "bool", True),
               Field("show_temp", "Mostrar temperatura", "bool", True),
               Field("show_ram", "Mostrar memoria", "bool", True),
               Field("show_disk", "Mostrar disco", "bool", True),
               Field("ping_host", "Host para ping", "text", "",
                     "Formato host o host:puerto (conexión TCP). Vacío para omitir."),
               _duration(10),
           )),
    Widget("sports", "Deportes", "Último resultado y próximo partido de un equipo.",
           "Información", module="widgets.sports", uses_network=True,
           settings=(
               Field("team", "Equipo", "text", "Barcelona",
                     "Nombre del equipo en TheSportsDB."),
               Field("api_key", "Clave de API", "text", "123",
                     "Clave de TheSportsDB (la gratuita actual es 123)."),
               _duration(12),
           )),
    Widget("worldclock", "Reloj mundial", "Hora actual en varias ciudades.",
           "Reloj", module="widgets.worldclock",
           settings=(
               Field("zones", "Zonas horarias", "list",
                     ["Barcelona|Europe/Madrid",
                      "Rosario|America/Argentina/Cordoba",
                      "Tokyo|Asia/Tokyo"],
                     "Una por línea con el formato Etiqueta|Zona."),
               Field("format24h", "Formato 24 horas", "bool", True),
               _duration(10),
           )),
    Widget("countdown", "Cuenta regresiva", "Días que faltan para tus fechas importantes.",
           "Reloj", module="widgets.countdown",
           settings=(
               Field("events", "Eventos", "list", ["Ano nuevo|2027-01-01"],
                     "Uno por línea con el formato Nombre|AAAA-MM-DD."),
               Field("show_past", "Mostrar eventos pasados", "bool", False),
               _duration(8),
           )),
    Widget("forecast", "Pronóstico", "Pronóstico de los próximos días.",
           "Información", module="widgets.forecast", uses_network=True,
           settings=(
               Field("city", "Ciudad", "text", "Barcelona"),
               Field("days", "Días", "select", 3, "Cantidad de días a mostrar.",
                     options=_opts((2, "2 días"), (3, "3 días"))),
               _duration(12),
           )),
    Widget("notifications", "Notificaciones", "Mensajes enviados por la API o el panel web.",
           "Sistema", module="widgets.notify", default_enabled=False, rotation=False,
           settings=(
               Field("default_color", "Color por defecto", "color", "#ffffff"),
               Field("default_seconds", "Duración por defecto (segundos)", "number", 10,
                     min=1, max=120, step=1),
               Field("max_queue", "Máximo de mensajes en cola", "number", 5,
                     min=1, max=50, step=1),
           )),
    Widget("pixelart", "Pixel art", "Escena de día y noche o un Snake que juega solo.",
           "Entretenimiento", module="widgets.pixelart",
           settings=(
               Field("style", "Estilo", "select", "random",
                     options=_opts(("scene", "Escena"), ("snake", "Snake"),
                                   ("random", "Al azar"))),
               Field("show_clock", "Mostrar hora", "bool", True),
               _duration(20),
           )),
)

_BY_ID = {w.id: w for w in WIDGETS}


def get(widget_id) -> Optional[Widget]:
    return _BY_ID.get(widget_id)


def to_dict():
    return {"widgets": [w.to_dict() for w in WIDGETS]}
