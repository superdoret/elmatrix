"""CPU / temperature / RAM / disk usage and an optional TCP ping."""
import os
import socket
import time

from widget_base import Widget, run_widget, GREEN, YELLOW, RED, WHITE, CYAN

THERMAL_FILE = "/sys/class/thermal/thermal_zone0/temp"
PREFERRED_SENSORS = ("coretemp", "cpu_thermal", "k10temp", "cpu-thermal", "acpitz", "soc_thermal")
REFRESH_SECONDS = 2.0
PING_TIMEOUT = 1.5


def parse_thermal_text(text):
    """Contents of a thermal_zone 'temp' file (millidegrees) -> degrees C or None."""
    try:
        value = float(str(text).strip())
    except ValueError:
        return None
    if value > 1000:
        value /= 1000.0
    return value if -50 < value < 200 else None


def read_temperature(psutil_module=None):
    """CPU temperature in C, or None when the platform does not expose one."""
    sensors = getattr(psutil_module, "sensors_temperatures", None)
    if sensors:
        try:
            groups = sensors() or {}
        except Exception:
            groups = {}
        ordered = [groups[n] for n in PREFERRED_SENSORS if n in groups]
        ordered += [v for k, v in groups.items() if k not in PREFERRED_SENSORS]
        for entries in ordered:
            for entry in entries:
                current = getattr(entry, "current", None)
                if isinstance(current, (int, float)) and -50 < current < 200:
                    return float(current)
    try:
        with open(THERMAL_FILE, "r", encoding="utf-8") as fh:
            return parse_thermal_text(fh.read())
    except OSError:
        return None


def parse_host_port(text, default_port=443):
    """'host', 'host:port' or '[v6]:port' -> (host, port) or None."""
    text = (text or "").strip()
    if not text:
        return None
    host, port = text, default_port
    if text.startswith("["):
        end = text.find("]")
        if end < 0:
            return None
        host = text[1:end]
        rest = text[end + 1:]
        if rest.startswith(":"):
            port = rest[1:]
    elif text.count(":") == 1:
        host, port = text.split(":")
    try:
        port = int(port)
    except ValueError:
        return None
    if not host or not 0 < port < 65536:
        return None
    return host, port


def tcp_ping(host, port, timeout=PING_TIMEOUT):
    """Milliseconds to open a TCP connection, or None."""
    start = time.monotonic()
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
    except (OSError, ValueError):
        return None
    sock.close()
    return (time.monotonic() - start) * 1000.0


def collect_stats(psutil_module, cfg):
    """Raw numbers; None means unavailable."""
    stats = {"cpu": None, "temp": None, "ram": None, "disk": None}
    if psutil_module is None:
        stats["temp"] = read_temperature(None) if cfg.get("show_temp") else None
        return stats
    try:
        if cfg.get("show_cpu"):
            stats["cpu"] = psutil_module.cpu_percent(interval=None)
        if cfg.get("show_ram"):
            stats["ram"] = psutil_module.virtual_memory().percent
        if cfg.get("show_disk"):
            root = os.path.abspath(os.sep)
            stats["disk"] = psutil_module.disk_usage(root).percent
    except Exception:
        pass
    if cfg.get("show_temp"):
        stats["temp"] = read_temperature(psutil_module)
    return stats


def level_color(fraction):
    if fraction < 0.6:
        return GREEN
    return YELLOW if fraction < 0.85 else RED


def build_lines(stats, cfg, ping_ms=None, ping_wanted=False):
    """-> [(label, value text, fraction 0..1 or None)] in display order."""
    lines = []

    def pct(label, value):
        if value is None:
            lines.append((label, "N/A", None))
        else:
            lines.append((label, "%d%%" % round(value), value / 100.0))

    if cfg.get("show_cpu"):
        pct("CPU", stats.get("cpu"))
    if cfg.get("show_temp"):
        t = stats.get("temp")
        lines.append(("TMP", "N/A" if t is None else "%dC" % round(t),
                      None if t is None else t / 90.0))
    if cfg.get("show_ram"):
        pct("RAM", stats.get("ram"))
    if cfg.get("show_disk"):
        pct("DSK", stats.get("disk"))
    if ping_wanted:
        if ping_ms is None:
            lines.append(("PNG", "ERR", None))
        else:
            lines.append(("PNG", "%dms" % round(ping_ms), min(1.0, ping_ms / 300.0)))
    return lines


class SysInfo(Widget):
    widget_id = "sysinfo"

    def render(self):
        cfg = self.cfg()
        try:
            import psutil
        except ImportError:
            psutil = None
        target = parse_host_port(cfg.get("ping_host"))
        if psutil is not None:
            psutil.cpu_percent(interval=None)  # prime the counter
        probe = {"at": -REFRESH_SECONDS, "lines": []}

        def refresh(t):
            if t - probe["at"] < REFRESH_SECONDS:
                return
            probe["at"] = t
            ping = tcp_ping(*target) if target else None
            probe["lines"] = build_lines(collect_stats(psutil, cfg), cfg, ping, target is not None)

        # warm-up so the first frame already has a CPU delta
        time.sleep(0.4)
        refresh(0)
        if not probe["lines"]:
            self.show_message(["Nada que", "mostrar"], color=CYAN, seconds=3)
            return
        font = self.load_font("5x8.bdf" if len(probe["lines"]) <= 4 else "4x6.bdf")

        def draw(canvas, t):
            refresh(t)
            lines = probe["lines"]
            line_h = font.height
            top0 = max(0, (canvas.height - line_h * len(lines)) // 2)
            cw = self.text_width(font, "0")
            bar_x = 3 * cw + 4
            bar_w = canvas.width - bar_x - 5 * cw - 3
            for i, (label, value, frac) in enumerate(lines):
                top = top0 + i * line_h
                self.draw_text(canvas, font, label, CYAN, x=1, top=top)
                self.draw_text(canvas, font, value, WHITE, x=0, top=top, align="right",
                               width=canvas.width - 1)
                if frac is not None:
                    self.draw_bar(canvas, bar_x, top + 1, bar_w, max(3, line_h - 3), frac,
                                  level_color(frac))

        self.play(max(1.0, self.remaining()), draw, fps=4)


if __name__ == "__main__":
    run_widget(SysInfo)
