/* Shared drawing helpers for the christmas gallery scenes. Scenes are designed on a 192x100 "design grid" that is
 * centred in the framebuffer (Pen adds the offset), so they look right at 192x101 and at the
 * smaller 182x93 grid of a 720p window. Everything is procedural, deterministic and allocation-free per frame. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.navidadScenes = E.navidadScenes || [];

  var DW = 192, DH = 100;

  function Pen(fb) {
    this.fb = fb;
    this.ox = Math.round((fb.w - DW) / 2);
    this.oy = Math.round((fb.h - DH) / 2);
  }
  Pen.prototype.px = function (x, y, c) { this.fb.setPixel(Math.round(x) + this.ox, Math.round(y) + this.oy, c); };
  Pen.prototype.rect = function (x, y, w, h, c) { this.fb.fillRect(Math.round(x) + this.ox, Math.round(y) + this.oy, Math.round(w), Math.round(h), c); };
  Pen.prototype.blend = function (x, y, c, a) { this.fb.blendPixel(Math.round(x) + this.ox, Math.round(y) + this.oy, c, a); };
  Pen.prototype.circ = function (cx, cy, r, c) { this.fb.fillCircle(Math.round(cx) + this.ox, Math.round(cy) + this.oy, r, c); };
  Pen.prototype.line = function (x0, y0, x1, y1, c) { this.fb.line(x0 + this.ox, y0 + this.oy, x1 + this.ox, y1 + this.oy, c); };
  Pen.prototype.ell = function (cx, cy, rx, ry, c) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (var dy = -ry; dy <= ry; dy++) {
      var k = 1 - (dy * dy) / (ry * ry + 0.5), half = Math.round(rx * Math.sqrt(k < 0 ? 0 : k));
      this.rect(cx - half, cy + dy, half * 2 + 1, 1, c);
    }
  };
  // filled triangle with the apex up: apex (cx, y), half width `hw` at the bottom, height h
  Pen.prototype.tri = function (cx, y, hw, h, c) {
    for (var i = 0; i < h; i++) { var half = Math.round(hw * i / Math.max(1, h - 1)); this.rect(cx - half, y + i, half * 2 + 1, 1, c); }
  };
  // soft radial light: blends colour c with alpha a at the centre fading to 0 at radius r
  Pen.prototype.glow = function (cx, cy, r, c, a) {
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r) { var k = 1 - d / r; this.blend(cx + dx, cy + dy, c, a * k * k); }
    }
  };
  // sprite from string rows; palette maps chars to colours; '.' transparent
  Pen.prototype.spr = function (rows, x, y, pal, flip) {
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r], n = row.length;
      for (var i = 0; i < n; i++) {
        var ch = row.charAt(flip ? n - 1 - i : i);
        if (ch === '.' || ch === ' ') continue;
        var col = pal[ch];
        if (col !== undefined) this.px(x + i, y + r, col);
      }
    }
  };
  // sine silhouette (hills/dunes) across the whole width, filled down to `bottom`
  Pen.prototype.hills = function (baseY, amp, f1, f2, ph, c, bottom, drift) {
    for (var x = -this.ox; x < DW + this.ox; x++) {
      var y = baseY - Math.round(amp * Math.sin(x * f1 + ph + drift) + amp * 0.45 * Math.sin(x * f2 + ph * 1.7 + drift * 0.6));
      this.rect(x, y, 1, bottom - y, c);
    }
  };

  // ---- cheap stateless particles ----------------------------------------------------------------
  function makeStars(rng, n, w, maxY) {
    var a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { a[i * 3] = Math.floor(rng() * w); a[i * 3 + 1] = Math.floor(rng() * maxY); a[i * 3 + 2] = rng() * 6.28; }
    return a;
  }
  function drawStars(fb, stars, t, c, minV) {
    for (var i = 0; i < stars.length; i += 3) {
      var v = 0.5 + 0.5 * Math.sin(t * 1.6 + stars[i + 2]);
      if (v > (minV === undefined ? 0.25 : minV)) fb.setPixel(stars[i], stars[i + 1], v > 0.85 ? 0xffffff : E.fb.scaleColor(c, 0.45 + 0.55 * v));
    }
  }
  // snow: positions are a pure function of t (no per-frame state). layer 0 = far (dim, slow), 2 = near (bright, fast, 2 px)
  function makeSnow(rng, n, w, h) {
    var a = new Float32Array(n * 5);
    for (var i = 0; i < n; i++) {
      var layer = i % 3;
      a[i * 5] = rng() * w; a[i * 5 + 1] = rng() * h; a[i * 5 + 2] = 3 + layer * 4 + rng() * 3; a[i * 5 + 3] = rng() * 6.28; a[i * 5 + 4] = layer;
    }
    return a;
  }
  function drawSnow(fb, snow, t, wind) {
    var w = fb.w, h = fb.h;
    for (var i = 0; i < snow.length; i += 5) {
      var layer = snow[i + 4], y = (snow[i + 1] + snow[i + 2] * t) % (h + 2) - 1;
      var x = ((snow[i] + Math.sin(t * (0.6 + layer * 0.2) + snow[i + 3]) * (1.5 + layer) + (wind || 0) * t * (1 + layer * 0.5)) % w + w) % w;
      var c = layer === 0 ? 0x8a9cc8 : layer === 1 ? 0xc8d6f4 : 0xffffff;
      fb.setPixel(x, y, c);
      if (layer === 2) { fb.setPixel(x + 1, y, 0xdfe8ff); fb.setPixel(x, y + 1, 0xdfe8ff); fb.setPixel(x + 1, y + 1, 0xc0d0f0); }
    }
  }
  // rising smoke puffs from (x, y): grey circles that drift right and fade
  function drawSmoke(p, x, y, t, color, n) {
    for (var i = 0; i < n; i++) {
      var k = ((t * 0.22 + i / n) % 1), py = y - k * 22, px = x + Math.sin(k * 5 + i) * 2 + k * 7;
      p.circ(px, py, 1 + Math.floor(k * 3), E.fb.mix(color, 0x20283c, Math.min(1, k * 1.1)));
    }
  }
  function smooth(a, b, v) { var k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); }

  // soft greeting text: fades in after `t0`, gently pulses; y in design coordinates
  function greet(ctx, p, text, t, t0, y, color) {
    var k = smooth(t0, t0 + 1.5, t) * (0.72 + 0.28 * Math.sin(t * 1.1));
    if (k <= 0.02) return;
    var f = ctx.fit(text, ['9x18B', '7x14B', '6x13'], ctx.w - 24, 20, 1), x = Math.round((ctx.w - f.width) / 2), yy = y + p.oy;
    var FB = E.fb;
    ctx.fb.drawText(f.font, text, x + 1, yy + 1, FB.scaleColor(0x100810, k), f.scale);
    ctx.fb.drawText(f.font, text, x, yy, 0, f.scale, { colorFn: function (px, py) { return FB.scaleColor(FB.mix(color, 0xffffff, 0.25 + 0.4 * ((py - yy) / f.height)), k); } });
  }

  function fadeFb(fb, k) {
    if (k >= 0.999) return;
    var d = fb.data, n = d.length, i, c;
    if (k <= 0) { d.fill(0); return; }
    var q = Math.round(k * 256);
    for (i = 0; i < n; i++) {
      c = d[i];
      if (c) d[i] = ((((c >> 16) & 255) * q >> 8) << 16) | ((((c >> 8) & 255) * q >> 8) << 8) | ((c & 255) * q >> 8);
    }
  }

  function register(scene) { E.navidadScenes.push(scene); }

  var api = { DW: DW, DH: DH, Pen: Pen, makeStars: makeStars, drawStars: drawStars, makeSnow: makeSnow, drawSnow: drawSnow, drawSmoke: drawSmoke,
    smooth: smooth, greet: greet, fadeFb: fadeFb, register: register };
  E.navidadLib = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
