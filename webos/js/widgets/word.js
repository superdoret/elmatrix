/* Word: a random positive word that slides in from a random side and holds. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  // Ease-out cubic, t in 0..1
  function easeOut(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }

  /* Offset (dx, dy) of the word at time t for a slide direction: starts off-screen and ends at (0,0). */
  function slideOffset(dir, t, slideSecs, w, h) {
    var k = 1 - easeOut(t / slideSecs);
    var mx = Math.round(w * k) + 0, my = Math.round(h * k) + 0;
    switch (dir) {
      case 'left': return { dx: -mx || 0, dy: 0 };
      case 'right': return { dx: mx, dy: 0 };
      case 'top': return { dx: 0, dy: -my || 0 };
      default: return { dx: 0, dy: my };
    }
  }

  var widget = {
    id: 'word',
    easeOut: easeOut, slideOffset: slideOffset,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, cfg = ctx.cfg;
      var word = ctx.pick(E.data.words);
      var dir = ctx.pick(['left', 'right', 'top', 'bottom']);
      var hue = ctx.rand(360);
      var fit = ctx.fit(word, ['10x20', '9x18B', '7x14B'], w - 12, Math.floor(h * 0.7), 6);
      var x0 = Math.floor((w - fit.width) / 2), y0 = Math.floor((h - fit.height) / 2);
      var stars = [];
      for (var i = 0; i < 50; i++) stars.push({ x: ctx.rand(w), y: ctx.rand(h), p: ctx.rand(10) });
      await ctx.loop(cfg.duration, 24, function (t) {
        fb.clear(0);
        stars.forEach(function (s) {
          var v = 0.15 + 0.25 * Math.max(0, Math.sin(t * 2 + s.p));
          fb.setPixel(s.x, s.y, FB.hsv(hue, 0.4, v));
        });
        var o = slideOffset(dir, t, 1.1, w, h);
        var top = y0 + o.dy, hh = fit.height;
        fb.drawText(fit.font, word, x0 + o.dx, top, 0, fit.scale, {
          colorFn: function (px, py) { return FB.hsv(hue + (py - top) / hh * 70, 0.75, 1); }
        });
      });
    }
  };
  E.widgets.word = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
