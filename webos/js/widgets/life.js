/* Conway's Game of Life on a toroidal grid (2x2 LED cells) with auto-reseed when it stagnates. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  // One generation: reads `cur`, writes `next` (both Uint8Array w*h, wrapping edges). Returns the population.
  function lifeStep(cur, next, w, h) {
    var pop = 0;
    for (var y = 0; y < h; y++) {
      var ym = ((y + h - 1) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
      for (var x = 0; x < w; x++) {
        var xm = (x + w - 1) % w, xp = (x + 1) % w;
        var n = cur[ym + xm] + cur[ym + x] + cur[ym + xp] + cur[y0 + xm] + cur[y0 + xp] + cur[yp + xm] + cur[yp + x] + cur[yp + xp];
        var alive = n === 3 || (n === 2 && cur[y0 + x] === 1) ? 1 : 0;
        next[y0 + x] = alive; pop += alive;
      }
    }
    return pop;
  }

  function checksum(cells) {
    var h = 0;
    for (var i = 0; i < cells.length; i++) if (cells[i]) h = (Math.imul(h, 31) + i + 1) | 0;
    return h;
  }

  /* Detects a dead, static or short-period board: true once a state hash has been seen `times` times
   * within the last `window` generations. */
  function Stagnation(window, times) {
    this.window = window || 24; this.times = times || 3; this.hist = [];
  }
  Stagnation.prototype.push = function (hash, pop) {
    if (pop === 0) return true;
    var seen = 0;
    for (var i = 0; i < this.hist.length; i++) if (this.hist[i] === hash) seen++;
    this.hist.push(hash);
    if (this.hist.length > this.window) this.hist.shift();
    return seen + 1 >= this.times;
  };
  Stagnation.prototype.reset = function () { this.hist = []; };

  function seed(cells, rng, density) {
    for (var i = 0; i < cells.length; i++) cells[i] = rng() < density ? 1 : 0;
  }

  var widget = {
    id: 'life',
    lifeStep: lifeStep, checksum: checksum, Stagnation: Stagnation, seed: seed,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, gw = Math.floor(w / 2), gh = Math.floor(h / 2);
      var cur = new Uint8Array(gw * gh), nxt = new Uint8Array(gw * gh), age = new Uint8Array(gw * gh);
      var stag = new Stagnation(30, 3), lastGen = -1, flash = 0;
      var pal = []; for (var a = 0; a < 40; a++) pal.push(FB.hsv(190 - a * 4, 0.8, a < 3 ? 1 : 0.9));
      seed(cur, ctx.rng, 0.3);
      await ctx.loop(ctx.cfg.duration, 20, function (t) {
        var gen = Math.floor(t * 12);
        if (gen !== lastGen) {
          lastGen = gen;
          var pop = lifeStep(cur, nxt, gw, gh);
          for (var i = 0; i < cur.length; i++) age[i] = nxt[i] ? Math.min(39, cur[i] ? age[i] + 1 : 0) : 0;
          var tmp = cur; cur = nxt; nxt = tmp;
          if (stag.push(checksum(cur), pop)) { seed(cur, ctx.rng, 0.3); age.fill(0); stag.reset(); flash = 6; }
        }
        for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) {
          var k = y * gw + x, c = cur[k] ? pal[age[k]] : 0, o = y * 2 * w + x * 2;
          fb.data[o] = c; fb.data[o + 1] = c; fb.data[o + w] = c; fb.data[o + w + 1] = c;
        }
        if (flash > 0) { flash--; ctx.drawText('5x8', 'NUEVA SEMILLA', 4, h - 10, 0x8090b0, 1); }
      });
    }
  };
  E.widgets.life = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
