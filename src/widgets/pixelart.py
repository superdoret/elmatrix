"""Pixel art: a day/night scene driven by the local hour, or a self-playing Snake."""
import math
import random
import time

from rgbmatrix import graphics
from widget_base import Widget, run_widget, WHITE

# ---- scene logic (pure) ------------------------------------------------------

SKY_KEYS = (  # (hour, (r, g, b))
    (0.0, (4, 4, 28)), (5.0, (8, 8, 50)), (6.5, (230, 120, 70)), (8.0, (90, 170, 255)),
    (17.0, (90, 170, 255)), (19.0, (230, 100, 60)), (20.5, (8, 8, 50)), (24.0, (4, 4, 28)),
)


def lerp_color(a, b, f):
    return tuple(int(round(a[i] + (b[i] - a[i]) * f)) for i in range(3))


def sky_color(hour):
    hour = hour % 24.0
    for (h0, c0), (h1, c1) in zip(SKY_KEYS, SKY_KEYS[1:]):
        if h0 <= hour <= h1:
            return lerp_color(c0, c1, (hour - h0) / (h1 - h0))
    return SKY_KEYS[0][1]


def is_night(hour):
    hour = hour % 24.0
    return hour < 6.0 or hour >= 19.5


def body_position(hour, width, horizon, peak):
    """('sun'|'moon', x, y): an arc from the left to the right edge between rise and set."""
    hour = hour % 24.0
    if 6.0 <= hour < 18.0:
        kind, t = "sun", (hour - 6.0) / 12.0
    else:
        kind, t = "moon", ((hour - 18.0) % 24.0) / 12.0
    x = int(round(t * (width - 1)))
    y = int(round(horizon - math.sin(math.pi * t) * (horizon - peak)))
    return kind, x, y


# ---- snake logic (pure) -------------------------------------------------------

DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _inside(cell, cols, rows):
    return 0 <= cell[0] < cols and 0 <= cell[1] < rows


def legal_moves(body, food, cols, rows):
    """Directions the head (body[0]) can take without hitting a wall or the body.

    The tail cell counts as free unless the snake eats (then it does not move).
    """
    head = body[0]
    moves = []
    for d in DIRS:
        cell = (head[0] + d[0], head[1] + d[1])
        if not _inside(cell, cols, rows):
            continue
        if len(body) > 1 and cell == body[1]:
            continue  # never reverse
        blocked = body if cell == food else body[:-1]
        if cell in blocked:
            continue
        moves.append(d)
    return moves


def choose_direction(body, food, cols, rows, rng=random):
    """Greedy and non suicidal: closest to the food, preferring roomy cells. None = stuck."""
    moves = legal_moves(body, food, cols, rows)
    if not moves:
        return None
    occupied = set(body)

    def score(d):
        cell = (body[0][0] + d[0], body[0][1] + d[1])
        room = sum(1 for e in DIRS
                   if _inside((cell[0] + e[0], cell[1] + e[1]), cols, rows)
                   and (cell[0] + e[0], cell[1] + e[1]) not in occupied)
        dist = abs(cell[0] - food[0]) + abs(cell[1] - food[1]) if food else 0
        return (0 if room > 0 else 1, dist, -room, rng.random())

    return min(moves, key=score)


def advance(body, direction, food, cols, rows):
    """-> (new body, ate) or None if the move hits a wall or the snake itself."""
    cell = (body[0][0] + direction[0], body[0][1] + direction[1])
    if not _inside(cell, cols, rows):
        return None
    ate = cell == food
    blocked = body if ate else body[:-1]
    if cell in blocked:
        return None
    new_body = [cell] + (body if ate else body[:-1])
    return new_body, ate


def place_food(body, cols, rows, rng=random):
    taken = set(body)
    free = [(x, y) for x in range(cols) for y in range(rows) if (x, y) not in taken]
    return rng.choice(free) if free else None


class SnakeGame(object):
    def __init__(self, cols, rows, rng=random):
        self.cols, self.rows, self.rng = cols, rows, rng
        self.reset()

    def reset(self):
        self.body = [(self.cols // 2, self.rows // 2)]
        self.food = place_food(self.body, self.cols, self.rows, self.rng)
        self.over = False

    def step(self):
        """One AI move. Sets `over` when the snake is stuck or the board is full."""
        if self.over:
            return
        d = choose_direction(self.body, self.food, self.cols, self.rows, self.rng)
        result = advance(self.body, d, self.food, self.cols, self.rows) if d else None
        if result is None:
            self.over = True
            return
        self.body, ate = result
        if ate:
            self.food = place_food(self.body, self.cols, self.rows, self.rng)
            if self.food is None:
                self.over = True  # board full: the snake won


# ---- drawing --------------------------------------------------------------------

CELL = 2


class PixelArt(Widget):
    widget_id = "pixelart"

    def render(self):
        cfg = self.cfg()
        style = cfg["style"]
        if style == "random":
            style = random.choice(("scene", "snake"))
        total = max(2.0, self.remaining())
        if style == "snake":
            self.play_snake(total)
        else:
            self.play_scene(total, cfg["show_clock"])

    # -- scene ---------------------------------------------------------------
    def play_scene(self, seconds, show_clock):
        w, h = self.canvas.width, self.canvas.height
        horizon = h - 7
        peak = 11 if show_clock else 4
        rng = random.Random(7)
        stars = [(rng.randrange(w), rng.randrange(0, horizon - 4), rng.randrange(8)) for _ in range(28)]
        clouds = [(rng.uniform(0, w + 16), rng.randrange(2, 12), rng.uniform(1.5, 4.0)) for _ in range(3)]
        font = self.load_font("5x8.bdf")

        def draw(canvas, t):
            now = time.localtime()
            hour = now.tm_hour + now.tm_min / 60.0 + now.tm_sec / 3600.0
            night = is_night(hour)
            sky = sky_color(hour)
            horizon_sky = lerp_color(sky, (255, 190, 120) if not night else (20, 20, 70), 0.35)
            for y in range(h):
                rgb = lerp_color(sky, horizon_sky, y / float(h))
                graphics.DrawLine(canvas, 0, y, w - 1, y, self.color(rgb))
            if night:
                for sx, sy, phase in stars:
                    if (int(t * 2) + phase) % 4:
                        canvas.SetPixel(sx, sy, 230, 230, 255)
            kind, bx, by = body_position(hour, w, horizon, peak)
            self.draw_body(canvas, kind, bx, by)
            cloud_rgb = (70, 70, 95) if night else (250, 250, 255)
            for x0, y0, speed in clouds:
                x = int((x0 + t * speed) % (w + 20)) - 10
                self.draw_cloud(canvas, x, y0, cloud_rgb)
            ground = (8, 34, 16) if night else (40, 140, 55)
            for x in range(w):
                depth = 4 + int(round(2 * math.sin(x / 7.0)))
                for y in range(h - depth, h):
                    canvas.SetPixel(x, y, *ground)
            if show_clock:
                text = time.strftime("%H:%M", now)
                self.draw_text(canvas, font, text, (230, 230, 255) if night else WHITE,
                               top=0, align="center")

        self.play(seconds, draw, fps=8)

    def draw_body(self, canvas, kind, cx, cy):
        r = 3
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dx * dx + dy * dy > r * r + 1:
                    continue
                if kind == "moon" and (dx + 2) ** 2 + (dy - 1) ** 2 <= 5:
                    continue  # crescent
                rgb = (255, 215, 60) if kind == "sun" else (235, 235, 210)
                canvas.SetPixel(cx + dx, cy + dy, *rgb)

    def draw_cloud(self, canvas, x, y, rgb):
        for dy, (dx0, length) in enumerate(((4, 4), (2, 8), (0, 12))):
            for i in range(length):
                canvas.SetPixel(x + dx0 + i, y + dy, *rgb)

    # -- snake ---------------------------------------------------------------
    def play_snake(self, seconds):
        cols, rows = self.canvas.width // CELL, self.canvas.height // CELL
        game = SnakeGame(cols, rows)
        state = {"last": -1, "pause_until": 0.0}

        def cell(canvas, c, rgb):
            for dy in range(CELL):
                for dx in range(CELL):
                    canvas.SetPixel(c[0] * CELL + dx, c[1] * CELL + dy, *rgb)

        def draw(canvas, t):
            tick = int(t * 12)
            if tick != state["last"]:
                state["last"] = tick
                if game.over:
                    if t >= state["pause_until"]:
                        game.reset()
                else:
                    game.step()
                    if game.over:
                        state["pause_until"] = t + 1.2
            dead = game.over
            if game.food:
                cell(canvas, game.food, (230, 50, 50))
            for i, c in enumerate(game.body):
                if dead:
                    rgb = (200, 60, 60) if int(t * 6) % 2 else (90, 30, 30)
                else:
                    rgb = (190, 255, 120) if i == 0 else (40, 200, 90)
                cell(canvas, c, rgb)

        self.play(seconds, draw, fps=12)


if __name__ == "__main__":
    run_widget(PixelArt)
