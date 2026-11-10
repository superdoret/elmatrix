/* Countdown: days left to important dates. Calendar-day maths, no network. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  function util() { return E.util || require('../util.js'); }

  /* ['Name|YYYY-MM-DD'] -> [{name, date:{y,m,d}}] (invalid dates dropped). */
  function parseEvents(list) {
    var U = util(), out = [];
    U.parsePairs(list).forEach(function (p) {
      var d = U.parseYMD(p.value);
      if (d) out.push({ name: p.label, date: d });
    });
    return out;
  }

  /* -> [{name, days}] sorted by proximity: upcoming first (ascending), then past ones if shown. */
  function buildCountdown(events, today, showPast) {
    var U = util();
    var rows = events.map(function (e) { return { name: e.name, days: U.daysBetween(today, e.date) }; });
    var future = rows.filter(function (r) { return r.days >= 0; }).sort(function (a, b) { return a.days - b.days; });
    var past = showPast ? rows.filter(function (r) { return r.days < 0; }).sort(function (a, b) { return b.days - a.days; }) : [];
    return future.concat(past);
  }

  function daysLabel(days) {
    if (days === 0) return '¡HOY!';
    if (days === 1) return 'MAÑANA';
    if (days === -1) return 'AYER';
    return days > 0 ? 'DÍAS' : 'DÍAS ATRÁS';
  }

  var widget = {
    id: 'countdown',
    parseEvents: parseEvents,
    buildCountdown: buildCountdown,
    daysLabel: daysLabel,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, cfg = ctx.cfg, U = E.util;
      var colors = [0xffc84a, 0x6cd0ff, 0xff7ab8, 0x7dffb0];
      await ctx.loop(cfg.duration, 2, function () {
        fb.clear(0);
        var rows = buildCountdown(parseEvents(cfg.events), U.ymdOfDate(ctx.date()), cfg.show_past).slice(0, 4);
        ctx.drawText('5x8', 'CUENTA REGRESIVA', 4, 2, 0x707088, 1);
        if (!rows.length) {
          ctx.drawFit('Sin eventos', { fonts: ['9x18B', '7x14B'], x: 4, y: 0, w: w - 8, h: h, align: 'center', valign: 'middle', color: 0xffb020, maxScale: 3 });
          return;
        }
        var top = 14;
        if (rows.length === 1) {
          var r = rows[0], num = String(Math.abs(r.days));
          var special = r.days === 0 ? '¡HOY!' : null;
          ctx.drawFit(r.name.toUpperCase(), { fonts: ['9x18B', '7x14B', '6x13'], x: 4, y: top + 2, w: w - 8, h: 24, align: 'center', color: 0xf0f0ff, maxScale: 2 });
          if (special) {
            ctx.drawFit(special, { fonts: ['10x20', '9x18B'], x: 4, y: top + 28, w: w - 8, h: h - top - 36, align: 'center', valign: 'middle', color: 0x7dffb0, maxScale: 5 });
          } else {
            var big = ctx.drawFit(num, { fonts: ['10x20', '9x18B'], x: 4, y: top + 28, w: w - 8, h: h - top - 56, align: 'center', color: colors[0], maxScale: 5 });
            ctx.drawFit(daysLabel(r.days), { fonts: ['9x18B', '7x14B', '6x13'], x: 4, y: h - 24, w: w - 8, h: 20, align: 'center', color: 0xa0a0b8, maxScale: 2 });
            void big;
          }
          return;
        }
        var rowH = Math.floor((h - top) / rows.length);
        rows.forEach(function (r, i) {
          var y0 = top + i * rowH, color = colors[i % colors.length];
          if (i % 2 === 0) fb.fillRect(2, y0, w - 4, rowH - 2, 0x0c0c14);
          var numStr = r.days === 0 ? '¡HOY!' : String(Math.abs(r.days));
          var nf = ctx.fit(numStr, ['10x20', '9x18B', '7x14B'], Math.floor(w * 0.34), rowH - 4, 3);
          var unit = r.days === 0 ? '' : daysLabel(r.days);
          var uw = unit ? ctx.fonts['6x13'].measure(unit) + 4 : 0;
          var nx = w - 6 - uw - nf.width;
          fb.drawText(nf.font, numStr, nx, y0 + Math.floor((rowH - 2 - nf.height) / 2), r.days === 0 ? 0x7dffb0 : color, nf.scale);
          if (unit) ctx.drawText('6x13', unit, w - 6 - uw + 4, y0 + Math.floor((rowH - 2) / 2) + nf.height / 2 - 13, 0xa0a0b8, 1);
          ctx.drawFit(r.name.toUpperCase(), { fonts: ['9x18B', '7x14B', '6x13', '5x8'], x: 8, y: y0, w: nx - 14, h: rowH - 2, align: 'left', valign: 'middle', color: 0xf0f0ff, maxScale: 2 });
        });
        void FB;
      });
    }
  };
  E.widgets.countdown = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
