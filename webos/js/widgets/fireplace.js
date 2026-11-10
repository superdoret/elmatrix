/* Fireplace: classic heat-propagation fire inside a brick hearth, with logs and rising embers. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  // 256-entry fire palette: black -> deep red -> orange -> yellow -> pale yellow.
  function firePalette() {
    var stops = [[0, 0, 0, 0], [60, 120, 10, 0], [110, 230, 60, 0], [170, 255, 150, 10], [220, 255, 220, 80], [255, 255, 255, 190]], p = [];
    for (var i = 0; i < 256; i++) {
      var a = stops[0], b = stops[1];
      for (var s = 0; s < stops.length - 1; s++) if (i >= stops[s][0]) { a = stops[s]; b = stops[s + 1]; }
      var f = (i - a[0]) / Math.max(1, b[0] - a[0]);
      p.push((Math.round(a[1] + (b[1] - a[1]) * f) << 16) | (Math.round(a[2] + (b[2] - a[2]) * f) << 8) | Math.round(a[3] + (b[3] - a[3]) * f));
    }
    return p;
  }

  /* One propagation step on a w*h Uint8Array (row h-1 is the fuel bed). Heat rises (towards row 0),
   * averages with its neighbours and cools by a random amount. `fuel` 0..1 feeds the bottom row. */
  function fireStep(heat, w, h, rng, cooling, fuel) {
    var x, y;
    for (x = 0; x < w; x++) {
      var edge = w > 1 ? 1 - Math.pow(Math.abs(2 * x / (w - 1) - 1), 3) : 1; // flames taper towards the sides
      heat[(h - 1) * w + x] = rng() < fuel * edge ? 200 + Math.floor(rng() * 56) : Math.floor(rng() * 40);
    }
    for (y = 0; y < h - 1; y++) {
      var row = y * w, below = (y + 1) * w, below2 = Math.min(h - 1, y + 2) * w;
      for (x = 0; x < w; x++) {
        var l = x > 0 ? x - 1 : x, r = x < w - 1 ? x + 1 : x;
        var v = (heat[below + l] + heat[below + x] + heat[below + r] + heat[below2 + x]) / 4 - rng() * cooling;
        heat[row + x] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }

  var BRICK = [0x6b2f22, 0x7d3a2b, 0x5a281d], MORTAR = 0x2a2420;

  var widget = {
    id: 'fireplace',
    firePalette: firePalette, fireStep: fireStep,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, pal = firePalette(), i;
      // hearth geometry
      var left = Math.floor(w * 0.2), right = Math.floor(w * 0.8), top = Math.floor(h * 0.1), floorY = h - Math.floor(h * 0.1);
      var inL = left + 12, inR = right - 12, inT = top + 14, inB = floorY - 4;
      var cell = 2, fw = Math.floor((inR - inL) / cell), fh = Math.floor((inB - inT) / cell);
      var heat = new Uint8Array(fw * fh);
      var embers = [];
      for (i = 0; i < 28; i++) embers.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
      var last = 0, acc = 0, flicker = 0.8;
      await ctx.loop(ctx.cfg.duration, 24, function (t) {
        var dt = Math.min(0.1, t - last); last = t; acc += dt;
        // room wall, with a warm glow that follows the flame intensity
        fb.clear(0x1a1410);
        fb.vgradient(0, h, 0x241812, 0x120d0a);
        var glow = 0.5 + 0.5 * flicker;
        // brick surround
        for (var y = top; y < floorY; y++) for (var x = left; x < right; x++) {
          if (x >= inL && x < inR && y >= inT) continue;
          var rowI = Math.floor((y - top) / 4), off = (rowI & 1) * 5, bx = Math.floor((x - left + off) / 10);
          var mortar = ((y - top) % 4 === 3) || ((x - left + off) % 10 === 9);
          fb.data[y * w + x] = mortar ? MORTAR : FB.scaleColor(BRICK[(bx * 7 + rowI * 3) % 3], 0.8 + 0.25 * glow);
        }
        fb.fillRect(left - 6, top - 5, right - left + 12, 6, 0x4a3a2c); // mantel
        fb.fillRect(left - 6, top - 5, right - left + 12, 1, 0x6a5440);
        fb.fillRect(inL - 3, inT - 3, inR - inL + 6, 3, 0x1a1210); // opening lintel
        // fire
        var steps = 0;
        while (acc >= 1 / 24 && steps++ < 3) { acc -= 1 / 24; flicker = 0.7 + 0.3 * ctx.rng(); fireStep(heat, fw, fh, ctx.rng, 30 + 14 * (1 - flicker), 0.7 * flicker + 0.3); }
        fb.fillRect(inL, inT, fw * cell, fh * cell, 0x0a0604);
        for (var fy = 0; fy < fh; fy++) for (var fx = 0; fx < fw; fx++) {
          var hv = heat[fy * fw + fx];
          if (hv < 6) continue;
          var px = inL + fx * cell, py = inT + fy * cell, col = pal[hv];
          fb.data[py * w + px] = col; fb.data[py * w + px + 1] = col; fb.data[(py + 1) * w + px] = col; fb.data[(py + 1) * w + px + 1] = col;
        }
        // logs
        fb.fillRect(inL + 6, inB - 6, inR - inL - 12, 8, 0x3a2312);
        fb.fillRect(inL + 6, inB - 6, inR - inL - 12, 1, 0x6b4224);
        fb.fillRect(inL + 14, inB - 11, inR - inL - 40, 6, 0x2e1c0e);
        fb.fillRect(inL + 14, inB - 11, inR - inL - 40, 1, 0x5a3a1c);
        fb.fillCircle(inL + 8, inB - 2, 3, 0x8a5a30); fb.fillCircle(inR - 8, inB - 2, 3, 0x8a5a30);
        fb.fillRect(inL, inB + 1, inR - inL, 3, 0x120c08);
        // embers
        for (i = 0; i < embers.length; i++) {
          var e = embers[i];
          if (e.life <= 0) {
            if (ctx.rng() < 0.08) { e.x = inL + 12 + ctx.rng() * (inR - inL - 24); e.y = inB - 14; e.vx = (ctx.rng() - 0.5) * 6; e.vy = -(8 + ctx.rng() * 16); e.life = 1 + ctx.rng() * 1.5; }
            continue;
          }
          e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
          if (e.y < inT - 6) e.life = 0;
          fb.setPixel(e.x, e.y, FB.mix(0x802000, 0xffc040, Math.min(1, e.life)));
        }
        // floor
        fb.fillRect(0, floorY, w, h - floorY, 0x2a1e16);
        fb.fillRect(0, floorY, w, 1, 0x4a3828);
        // decoration: stocking + candle on the mantel
        fb.fillRect(left + 8, top - 9, 3, 4, 0xe8e0d0); fb.fillRect(left + 8, top - 5, 3, 1, 0xc83030);
        fb.fillRect(right - 14, top - 12, 2, 7, 0xf4ecd0); fb.setPixel(right - 13, top - 14 - ((t * 6) & 1), 0xffc040);
      });
    }
  };
  E.widgets.fireplace = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
