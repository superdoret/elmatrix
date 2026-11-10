#!/usr/bin/env python3
"""eLMaTrIx: runs the enabled widgets forever and serves the web panel.

    sudo python3 main.py [flags] [extra panel args]   # real panel (Raspberry Pi)
    python3 simulator/run.py [flags] [extra args]     # on-screen simulator

Web panel flags:
    --web-host HOST    bind address (default 0.0.0.0: reachable from the local network;
                       use 127.0.0.1 to keep it on this machine only)
    --web-port PORT    port (default 8080)
    --web-user USER    login user (or env ELMATRIX_USER; default "admin")
    --web-password PW  login password (or env ELMATRIX_PASSWORD; prefer the env var,
                       command-line arguments are visible in `ps`). If neither is set,
                       a random one is generated once and saved in data/web_password
    --no-web           do not start the web panel

Any other argument is passed through to every widget, so it overrides the
defaults (for example --led-brightness=50 or --led-cols=32).
"""
import argparse
import os
import socket
import sys

import paths
from runner import ModeRunner
from scheduler import Scheduler
from webpanel.auth import DEFAULT_USER, PASSWORD_FILE, resolve_password

SIMULATOR = os.environ.get("ELMATRIX_SIMULATOR") == "1"
LOOPBACK = ("127.0.0.1", "localhost", "::1")


def parse_args(argv):
    parser = argparse.ArgumentParser(description="eLMaTrIx", allow_abbrev=False)
    parser.add_argument("--web-host", default="0.0.0.0")
    parser.add_argument("--web-port", type=int, default=8080)
    parser.add_argument("--web-user", default=None)
    parser.add_argument("--web-password", default=None)
    parser.add_argument("--no-web", action="store_true")
    args, extra = parser.parse_known_args(argv)
    # flags win over the environment, which wins over the built-in default user.
    # The password has no default: see start_web() / resolve_password().
    args.web_user = args.web_user or os.environ.get("ELMATRIX_USER") or DEFAULT_USER
    args.web_password = args.web_password or os.environ.get("ELMATRIX_PASSWORD") or None
    return args, extra


def simulator_frame():
    """Current simulated panel frame as (w, h, rgb bytes), or None before the first run."""
    import rgbmatrix  # the simulated package (simulator/run.py put it first on sys.path)
    display = getattr(rgbmatrix, "_display", None)
    return display.snapshot() if display is not None else None


def lan_ip():
    """Best-effort LAN address of this machine (no packet is actually sent)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("10.255.255.255", 1))
        return sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()


def start_web(args, scheduler, runner):
    from webpanel.server import PanelServer
    password_path = os.path.join(paths.data_dir(), PASSWORD_FILE)
    password, source = resolve_password(args.web_password, password_path)
    try:
        server = PanelServer(scheduler, runner, host=args.web_host, port=args.web_port,
                             user=args.web_user, password=password,
                             frame_provider=simulator_frame if SIMULATOR else None,
                             simulator=SIMULATOR)
    except OSError as ex:
        print("Web panel NOT started (%s:%s): %s" % (args.web_host, args.web_port, ex))
        return None
    server.start()
    print("Web panel: http://localhost:%d/" % server.port)
    if args.web_host not in LOOPBACK:
        ip = lan_ip()
        if ip:
            print("Web panel (local network): http://%s:%d/" % (ip, server.port))
    if source == "generated":
        print("Web login: user '%s', password '%s' (generated, saved in %s)."
              % (args.web_user, password, password_path))
        print("Set your own with ELMATRIX_PASSWORD or --web-password.")
    elif source == "saved":
        print("Web login: user '%s', password saved in %s." % (args.web_user, password_path))
    return server


def main(argv=None):
    args, extra = parse_args(sys.argv[1:] if argv is None else argv)
    runner = ModeRunner(SIMULATOR, extra)
    scheduler = Scheduler(runner)
    server = None if args.no_web else start_web(args, scheduler, runner)
    try:
        scheduler.loop()
    finally:
        scheduler.stop()
        if server is not None:
            server.stop()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
