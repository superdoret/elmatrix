/* Pixel art: day/night scene driven by the local hour, or a self-playing Snake. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  // ---- scene logic (pure) ---------------------------------------------------
  var SKY_KEYS = [
    [0, [4, 4, 28]], [5, [8, 8, 50]], [6.5, [230, 120, 70]], [8, [90, 170, 255]],
    [17, [90, 170, 255]], [19, [230, 100, 60]], [20.5, [8, 8, 50]], [24, [4, 4, 28]]
  ];

  function lerpColor(a, b, f) {
    return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * f); });
  }
  function pack(c) { return (c[0] << 16) | (c[1] << 8) | c[2]; }

  // hour: 0..24 float -> [r,g,b]
  function skyColor(hour) {
    hour = ((hour % 24) + 24) % 24;
    for (var i = 0; i < SKY_KEYS.length - 1; i++) {
      var a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
      if (hour >= a[0] && hour <= b[0]) return lerpColor(a[1], b[1], (hour - a[0]) / (b[0] - a[0]));
    }
    return SKY_KEYS[0][1];
  }

  function isNight(hour) { hour = ((hour % 24) + 24) % 24; return hour < 6 || hour >= 19.5; }

  // Sun (06-18) or moon (18-06) travelling an arc from the left to the right edge.
  function bodyPosition(hour, width, horizon, peak) {
    hour = ((hour % 24) + 24) % 24;
    var kind, t;
    if (hour >= 6 && hour < 18) { kind = 'sun'; t = (hour - 6) / 12; } else { kind = 'moon'; t = (((hour - 18) % 24) + 24) % 24 / 12; }
    return { kind: kind, x: Math.round(t * (width - 1)), y: Math.round(horizon - Math.sin(Math.PI * t) * (horizon - peak)) };
  }

  // ---- snake logic (pure; port of src/widgets/pixelart.py) -------------------
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function inside(c, cols, rows) { return c[0] >= 0 && c[0] < cols && c[1] >= 0 && c[1] < rows; }
  function same(a, b) { return !!a && !!b && a[0] === b[0] && a[1] === b[1]; }
  function contains(list, c) { for (var i = 0; i < list.length; i++) if (same(list[i], c)) return true; return false; }

  // Directions the head can take without hitting a wall or its own body (never reverse).
  function legalMoves(body, food, cols, rows) {
    var head = body[0], moves = [];
    DIRS.forEach(function (d) {
      var cell = [head[0] + d[0], head[1] + d[1]];
      if (!inside(cell, cols, rows)) return;
      if (body.length > 1 && same(cell, body[1])) return;
      var blocked = same(cell, food) ? body : body.slice(0, -1);
      if (contains(blocked, cell)) return;
      moves.push(d);
    });
    return moves;
  }

  // Greedy, non suicidal: closest to the food, preferring roomy cells. null = stuck.
  function chooseDirection(body, food, cols, rows, rng) {
    rng = rng || Math.random;
    var moves = legalMoves(body, food, cols, rows);
    if (!moves.length) return null;
    var best = null, bestScore = null;
    moves.forEach(function (d) {
      var cell = [body[0][0] + d[0], body[0][1] + d[1]], room = 0;
      DIRS.forEach(function (e) {
        var n = [cell[0] + e[0], cell[1] + e[1]];
        if (inside(n, cols, rows) && !contains(body, n)) room++;
      });
      var dist = food ? Math.abs(cell[0] - food[0]) + Math.abs(cell[1] - food[1]) : 0;
      var score = [room > 0 ? 0 : 1, dist, -room, rng()];
      if (!bestScore || cmp(score, bestScore) < 0) { best = d; bestScore = score; }
    });
    return best;
  }
  function cmp(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

  // -> {body, ate} or null when the move hits a wall or the snake itself.
  function advance(body, dir, food, cols, rows) {
    var cell = [body[0][0] + dir[0], body[0][1] + dir[1]];
    if (!inside(cell, cols, rows)) return null;
    var ate = same(cell, food);
    if (contains(ate ? body : body.slice(0, -1), cell)) return null;
    return { body: [cell].concat(ate ? body : body.slice(0, -1)), ate: ate };
  }

  function placeFood(body, cols, rows, rng) {
    rng = rng || Math.random;
    var free = [];
    for (var x = 0; x < cols; x++) for (var y = 0; y < rows; y++) if (!contains(body, [x, y])) free.push([x, y]);
    return free.length ? free[Math.floor(rng() * free.length)] : null;
  }

  function SnakeGame(cols, rows, rng) {
    this.cols = cols; this.rows = rows; this.rng = rng || Math.random;
    this.reset();
  }
  SnakeGame.prototype.reset = function () {
    this.body = [[this.cols >> 1, this.rows >> 1]];
    this.food = placeFood(this.body, this.cols, this.rows, this.rng);
    this.over = false;
    this.eaten = 0;
  };
  SnakeGame.prototype.step = function () {
    if (this.over) return;
    var d = chooseDirection(this.body, this.food, this.cols, this.rows, this.rng);
    var res = d ? advance(this.body, d, this.food, this.cols, this.rows) : null;
    if (!res) { this.over = true; return; }
    this.body = res.body;
    if (res.ate) {
      this.eaten++;
      this.food = placeFood(this.body, this.cols, this.rows, this.rng);
      if (!this.food) this.over = true;
    }
  };

  // ---- drawing --------------------------------------------------------------
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function drawScene(ctx, st, t, hour, showClock) {
    var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, night = isNight(hour);
    var sky = skyColor(hour), horizonSky = lerpColor(sky, night ? [20, 20, 70] : [255, 190, 120], 0.35);
    var groundY = h - Math.round(h * 0.14);
    for (var y = 0; y < groundY; y++) fb.fillRect(0, y, w, 1, pack(lerpColor(sky, horizonSky, y / groundY)));
    if (night) {
      st.stars.forEach(function (s) { if ((Math.floor(t * 2) + s.p) % 4) fb.setPixel(s.x, s.y, 0xe6e6ff); });
    }
    var b = bodyPosition(hour, w, groundY - 6, showClock ? Math.round(h * 0.3) : Math.round(h * 0.1));
    var r = Math.max(5, Math.round(h * 0.07));
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue;
      if (b.kind === 'moon' && (dx + r * 0.6) * (dx + r * 0.6) + (dy - r * 0.3) * (dy - r * 0.3) <= r * r * 0.55) continue;
      fb.setPixel(b.x + dx, b.y + dy, b.kind === 'sun' ? 0xffd73c : 0xebebd2);
    }
    // hills
    var hill = night ? 0x0c2418 : 0x2c9a52, hill2 = night ? 0x081a10 : 0x378f50;
    for (var x = 0; x < w; x++) {
      var hy = groundY - 8 - Math.round(7 * Math.sin(x / 16 + 1) + 4 * Math.sin(x / 7));
      fb.fillRect(x, hy, 1, groundY - hy + 1, hill);
    }
    // skyline with windows
    st.buildings.forEach(function (bd) {
      var col = night ? 0x181830 : 0x7a7f9a;
      fb.fillRect(bd.x, groundY - bd.h, bd.w, bd.h, col);
      for (var wy = groundY - bd.h + 3; wy < groundY - 3; wy += 5) for (var wx = bd.x + 2; wx < bd.x + bd.w - 2; wx += 4) {
        var lit = night && ((wx * 7 + wy * 13 + bd.seed) % 5 < 3);
        fb.fillRect(wx, wy, 2, 2, lit ? 0xffd25a : (night ? 0x10101e : 0xb8d4f0));
      }
    });
    // clouds
    var cloudCol = night ? 0x46465f : 0xfafaff;
    st.clouds.forEach(function (c) {
      var cx = Math.floor((c.x + t * c.speed) % (w + 50)) - 25;
      fb.fillRect(cx + 6, c.y, 12, 3, cloudCol); fb.fillRect(cx + 2, c.y + 3, 22, 3, cloudCol); fb.fillRect(cx, c.y + 6, 26, 3, cloudCol);
      fb.fillRect(cx + 10, c.y - 3, 8, 3, cloudCol);
    });
    // ground and trees
    fb.fillRect(0, groundY, w, h - groundY, night ? 0x08220f : 0x2a8c3c);
    for (var gx = 0; gx < w; gx += 2) fb.setPixel(gx, groundY + ((gx >> 1) % 3), night ? 0x0c3016 : 0x3aa84c);
    st.trees.forEach(function (tr) {
      fb.fillRect(tr.x, groundY - tr.h, 2, tr.h, 0x5a3a1c);
      fb.fillCircle(tr.x + 1, groundY - tr.h - 3, 4, night ? 0x0e3a1c : 0x2fbf55);
    });
    if (showClock) {
      var d = ctx.date(), txt = ctx.TL.pad2(d.getHours()) + ':' + ctx.TL.pad2(d.getMinutes());
      var f = ctx.fit(txt, ['10x20', '9x18B'], Math.floor(w * 0.5), Math.floor(h * 0.3), 3);
      fb.drawText(f.font, txt, Math.floor((w - f.width) / 2) + 1, 5 + 1, 0x000018, f.scale);
      fb.drawText(f.font, txt, Math.floor((w - f.width) / 2), 5, night ? 0xe6e6ff : 0xffffff, f.scale);
    }
    void FB;
  }

  function sceneState(ctx) {
    var w = ctx.w, h = ctx.h, rng = mulberry(7), groundY = h - Math.round(h * 0.14), i;
    var st = { stars: [], clouds: [], buildings: [], trees: [] };
    for (i = 0; i < 70; i++) st.stars.push({ x: Math.floor(rng() * w), y: Math.floor(rng() * (groundY - 10)), p: Math.floor(rng() * 8) });
    for (i = 0; i < 4; i++) st.clouds.push({ x: rng() * (w + 40), y: 8 + Math.floor(rng() * h * 0.25), speed: 1.5 + rng() * 3 });
    for (var x = 4; x < w - 10;) {
      var bw = 8 + Math.floor(rng() * 10), bh = 10 + Math.floor(rng() * Math.round(h * 0.2));
      if (rng() < 0.8) st.buildings.push({ x: x, w: bw, h: bh, seed: Math.floor(rng() * 100) });
      x += bw + 2 + Math.floor(rng() * 8);
    }
    for (i = 0; i < Math.round(w / 12); i++) st.trees.push({ x: Math.floor(rng() * w), h: 4 + Math.floor(rng() * 5) });
    return st;
  }

  var CELL = 3;
  function drawSnake(ctx, game, t, state) {
    var fb = ctx.fb, w = ctx.w, h = ctx.h;
    var ox = Math.floor((w - game.cols * CELL) / 2), oy = h - game.rows * CELL - 4;
    fb.clear(0x04060a);
    fb.rect(ox - 2, oy - 2, game.cols * CELL + 4, game.rows * CELL + 4, 0x2a3a5a);
    var cell = function (c, col) { fb.fillRect(ox + c[0] * CELL, oy + c[1] * CELL, CELL - 0, CELL - 0, col); };
    if (game.food) cell(game.food, Math.floor(t * 4) % 2 ? 0xff3c3c : 0xc82828);
    game.body.forEach(function (c, i) {
      var col = game.over ? (Math.floor(t * 6) % 2 ? 0xc83c3c : 0x5a1e1e) : (i === 0 ? 0xbeff78 : 0x28c85a);
      cell(c, col);
    });
    ctx.drawText('5x8', 'LARGO ' + game.body.length, 4, 2, 0x8090b0, 1);
    void state;
  }

  var widget = {
    id: 'pixelart',
    skyColor: skyColor, isNight: isNight, bodyPosition: bodyPosition,
    legalMoves: legalMoves, chooseDirection: chooseDirection, advance: advance, placeFood: placeFood, SnakeGame: SnakeGame,
    drawScene: drawScene, sceneState: sceneState,
    run: async function (ctx) {
      var cfg = ctx.cfg, style = cfg.style;
      if (style === 'random') style = ctx.pick(['scene', 'snake']);
      if (style === 'snake') {
        var game = new SnakeGame(Math.floor(ctx.w / CELL) - 4, Math.floor((ctx.h - 20) / CELL), ctx.rng), last = -1, pauseUntil = 0;
        await ctx.loop(cfg.duration, 30, function (t) {
          var tick = Math.floor(t * 14);
          if (tick !== last) {
            last = tick;
            if (game.over) { if (t >= pauseUntil) game.reset(); } else { game.step(); if (game.over) pauseUntil = t + 1.4; }
          }
          drawSnake(ctx, game, t);
        });
      } else {
        var st = sceneState(ctx);
        await ctx.loop(cfg.duration, 8, function (t) {
          var d = ctx.date();
          drawScene(ctx, st, t, d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600, cfg.show_clock);
        });
      }
    }
  };
  E.widgets.pixelart = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
