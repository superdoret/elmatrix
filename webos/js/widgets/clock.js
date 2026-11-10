/* Clock: big digits, seconds bar and date. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  function timeText(date, h24) {
    var h = date.getHours();
    var ampm = '';
    if (!h24) { ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return { hh: h24 ? pad(h) : String(h), mm: pad(date.getMinutes()), ampm: ampm };
  }

  var widget = {
    id: 'clock',
    timeText: timeText,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, U = E.util, w = ctx.w, h = ctx.h, cfg = ctx.cfg;
      var hue = ctx.rand(360);
      var main = FB.hsv(hue, 0.15, 1), accent = FB.hsv(hue, 0.9, 1), dateCol = FB.hsv(hue + 40, 0.55, 1);
      await ctx.loop(cfg.duration, 5, function (t) {
        var d = ctx.date();
        fb.clear(0);
        var tt = timeText(d, cfg.format24h);
        var sample = '88:88';
        var fit = ctx.fit(sample, ['10x20', '9x18B'], w - 16, Math.floor(h * 0.56), 5);
        var dateH = cfg.show_date ? 22 : 0;
        var vis = fit.font.ascent * fit.scale;
        var total = vis + 6 + 4 + (cfg.show_date ? 8 + dateH : 0);
        var y = Math.max(2, Math.floor((h - total) / 2));
        var blinkOn = d.getSeconds() % 2 === 0;
        var str = tt.hh + (blinkOn ? ':' : ' ') + tt.mm;
        var tw = fit.font.measure(str) * fit.scale;
        var x = Math.floor((w - tw) / 2);
        fb.drawText(fit.font, str, x, y, main, fit.scale);
        if (tt.ampm) ctx.drawText('9x18B', tt.ampm, x + tw + 2, y + vis - 36, accent, 1);
        // seconds bar: one LED column group per second with a fading head
        var by = y + vis + 8, bw = w - 16, bx = 8, sec = d.getSeconds() + d.getMilliseconds() / 1000;
        fb.fillRect(bx, by, bw, 2, 0x181820);
        var filled = Math.round(bw * sec / 60);
        for (var i = 0; i < filled; i++) fb.fillRect(bx + i, by, 1, 2, FB.hsv(hue + i * 0.8, 0.85, 1));
        for (var m = 0; m <= 60; m += 5) fb.fillRect(bx + Math.round(bw * m / 60), by + 3, 1, m % 15 === 0 ? 2 : 1, 0x505060);
        if (cfg.show_date) {
          ctx.drawFit(U.formatDateEs(d), { fonts: ['9x18B', '7x14B', '6x13'], x: 4, y: by + 8, w: w - 8, h: dateH, align: 'center', color: dateCol, maxScale: 2 });
        }
        void accent; void t;
      });
    }
  };
  E.widgets.clock = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
