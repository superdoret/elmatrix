/* Framebuffer: w*h packed 0xRRGGBB pixels. Widgets draw here; the renderer only reads it. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  function rgb(r,gr, b) {
    return ((clamp8(r) << 16) | (clamp8(gr) << 8) | clamp8(b)) >>> 0;
  }
  function clamp8(v) { v = Math.round(v); return v < 0 ? 0 : v > 255 ? 255 : v; }
  function unpack(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }

  function parseHex(str, fallback) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(str || ''));
    return m ? parseInt(m[1], 16) : (fallback === undefined ? 0xffffff : fallback);
  }

  function mix(a, b, f) {
    if (f <= 0) return a;
    if (f >= 1) return b;
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return rgb(ar + (br - ar) * f, ag + (bg - ag) * f, ab + (bb - ab) * f);
  }

  function scaleColor(c, f) {
    return rgb(((c >> 16) & 255) * f, ((c >> 8) & 255) * f, (c & 255) * f);
  }

  // HSV (h 0..360, s,v 0..1) -> packed colour
  function hsv(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c, r = 0, gg = 0, b = 0;
    if (h < 60) { r = c; gg = x; } else if (h < 120) { r = x; gg = c; } else if (h < 180) { gg = c; b = x; }
    else if (h < 240) { gg = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return rgb((r + m) * 255, (gg + m) * 255, (b + m) * 255);
  }

  function Framebuffer(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h);
  }

  Framebuffer.prototype.resize = function (w, h) {
    this.w = w; this.h = h; this.data = new Uint32Array(w * h);
  };

  Framebuffer.prototype.clear = function (c) {
    this.data.fill(c || 0);
  };

  Framebuffer.prototype.setPixel = function (x, y, c) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  };

  Framebuffer.prototype.getPixel = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  };

  // Blend colour c over the existing pixel with alpha 0..1.
  Framebuffer.prototype.blendPixel = function (x, y, c, alpha) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    var i = y * this.w + x;
    this.data[i] = mix(this.data[i], c, alpha);
  };

  Framebuffer.prototype.fillRect = function (x, y, w, h, c) {
    x = x | 0; y = y | 0; w = w | 0; h = h | 0;
    var x0 = Math.max(0, x), y0 = Math.min(this.h, y + h), x1 = Math.min(this.w, x + w);
    for (var yy = Math.max(0, y); yy < y0; yy++) {
      if (x1 > x0) this.data.fill(c, yy * this.w + x0, yy * this.w + x1);
    }
  };

  Framebuffer.prototype.rect = function (x, y, w, h, c) {
    this.fillRect(x, y, w, 1, c);
    this.fillRect(x, y + h - 1, w, 1, c);
    this.fillRect(x, y, 1, h, c);
    this.fillRect(x + w - 1, y, 1, h, c);
  };

  Framebuffer.prototype.hline = function (x, y, len, c) { this.fillRect(x, y, len, 1, c); };
  Framebuffer.prototype.vline = function (x, y, len, c) { this.fillRect(x, y, 1, len, c); };

  Framebuffer.prototype.line = function (x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (var n = 0; n < 10000; n++) {
      this.setPixel(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  Framebuffer.prototype.fillCircle = function (cx, cy, r, c) {
    var r2 = r * r + r * 0.8;
    for (var dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (var dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy <= r2) this.setPixel(cx + dx, cy + dy, c);
      }
    }
  };

  Framebuffer.prototype.circle = function (cx, cy, r, c) {
    var outer = r * r + r * 0.8, inner = (r - 1) * (r - 1) + (r - 1) * 0.8;
    for (var dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (var dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        var d = dx * dx + dy * dy;
        if (d <= outer && d > inner) this.setPixel(cx + dx, cy + dy, c);
      }
    }
  };

  // Vertical gradient between two colours over the whole framebuffer (or a band).
  Framebuffer.prototype.vgradient = function (y0, y1, ca, cb) {
    for (var y = Math.max(0, y0); y < Math.min(this.h, y1); y++) {
      this.fillRect(0, y, this.w, 1, mix(ca, cb, (y - y0) / Math.max(1, y1 - y0 - 1)));
    }
  };

  /* Draw text. (x, y) = top-left of the line box; returns the advance width drawn.
   * opts.colorFn(px, py, index) can override the colour per lit pixel (effects). */
  Framebuffer.prototype.drawText = function (font, text, x, y, color, scale, opts) {
    scale = scale || 1;
    text = String(text);
    var colorFn = opts && opts.colorFn;
    var penX = x;
    var baseline = y + font.ascent * scale;
    for (var i = 0; i < text.length; i++) {
      var gl = font.glyph(text.charCodeAt(i));
      if (!gl) { penX += font.width * scale; continue; }
      // Skip glyphs fully outside the buffer (cheap marquee clipping).
      var gx = penX + gl.xo * scale, gw = gl.w * scale;
      if (gx < this.w && gx + gw > 0) {
        var top = baseline - (gl.yo + gl.h) * scale;
        for (var r = 0; r < gl.h; r++) {
          for (var cc = 0; cc < gl.w; cc++) {
            if (!gl.pix[r * gl.w + cc]) continue;
            var px = gx + cc * scale, py = top + r * scale;
            var col = colorFn ? colorFn(px, py, i) : color;
            if (scale === 1) this.setPixel(px, py, col);
            else this.fillRect(px, py, scale, scale, col);
          }
        }
      }
      penX += gl.dw * scale;
    }
    return penX - x;
  };

  Framebuffer.prototype.textWidth = function (font, text, scale) {
    return font.measure(text) * (scale || 1);
  };

  /* Bitmap from string rows. palette maps a char to a colour; '.' and ' ' are transparent. */
  Framebuffer.prototype.drawBitmap = function (rows, x, y, palette, scale) {
    scale = scale || 1;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        var ch = row.charAt(c);
        if (ch === '.' || ch === ' ') continue;
        var col = palette[ch];
        if (col === undefined) continue;
        this.fillRect(x + c * scale, y + r * scale, scale, scale, col);
      }
    }
  };

  // Small filled triangle (trend arrows). dir: 'up' | 'down'. Size s = base width (odd).
  Framebuffer.prototype.arrow = function (x, y, s, dir, c) {
    var rows = (s + 1) >> 1;
    for (var i = 0; i < rows; i++) {
      var half = dir === 'up' ? i : rows - 1 - i;
      this.fillRect(x + ((s - 1) >> 1) - half, y + i, half * 2 + 1, 1, c);
    }
  };

  var api = {
    Framebuffer: Framebuffer, rgb: rgb, unpack: unpack, parseHex: parseHex,
    mix: mix, scaleColor: scaleColor, hsv: hsv
  };
  E.fb = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
