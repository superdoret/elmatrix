/* World clock: one row per zone (label | zone). Offline: uses Intl time zones only. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  function util() { return E.util || require('../util.js'); }

  /* ['Label|Zone'] -> [{label, zone}] keeping only valid IANA zones (max 6). */
  function parseZones(list) {
    var U = util();
    return U.parsePairs(list).filter(function (p) { return U.zoneValid(p.value); })
      .map(function (p) { return { label: p.label, zone: p.value }; }).slice(0, 6);
  }

  /* Clock reading of `date` in `zone`: {hh, mm, ampm, dayDiff (days vs local date), hour}. */
  function zoneClock(date, zone, h24, localDate) {
    var U = util();
    var p = U.zoneParts(date, zone);
    var local = U.ymdOfDate(localDate || date);
    var dayDiff = U.daysBetween(local, { y: p.y, m: p.m, d: p.d });
    var h = p.h, ampm = '';
    if (!h24) { ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
    return { hh: h24 ? U.pad2(h) : String(h), mm: U.pad2(p.mi), ampm: ampm, dayDiff: dayDiff, hour: p.h, sec: p.s };
  }

  var widget = {
    id: 'worldclock',
    parseZones: parseZones,
    zoneClock: zoneClock,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, cfg = ctx.cfg;
      var zones = parseZones(cfg.zones);
      var colors = [0x6cd0ff, 0xffc84a, 0xff7ab8, 0x7dffb0, 0xc49cff, 0xffa060];
      await ctx.loop(cfg.duration, 2, function () {
        var d = ctx.date();
        fb.clear(0);
        ctx.drawText('5x8', 'RELOJ MUNDIAL', 4, 2, 0x707088, 1);
        if (!zones.length) {
          ctx.drawFit('Sin zonas válidas', { fonts: ['9x18B', '7x14B'], x: 4, y: 0, w: w - 8, h: h, align: 'center', valign: 'middle', color: 0xffb020, maxScale: 2 });
          return;
        }
        var cols = zones.length > 3 ? 2 : 1;
        var rowsPer = Math.ceil(zones.length / cols);
        var top = 14, cellW = Math.floor(w / cols), cellH = Math.floor((h - top) / rowsPer);
        zones.forEach(function (z, i) {
          var col = Math.floor(i / rowsPer), row = i % rowsPer;
          var x0 = col * cellW, y0 = top + row * cellH, color = colors[i % colors.length];
          var c = zoneClock(d, z.zone, cfg.format24h, d);
          if (row % 2 === 0) fb.fillRect(x0 + 2, y0, cellW - 4, cellH - 2, 0x0c0c14);
          var pad = 6;
          // day/night dot
          var day = c.hour >= 7 && c.hour < 19;
          fb.fillCircle(x0 + pad + 2, y0 + Math.floor(cellH / 2) - 1, 2, day ? 0xffd23c : 0x6070b0);
          var labelW = Math.floor((cellW - pad * 2) * (cols === 1 ? 0.46 : 0.38)) - 8;
          var timeStr = c.hh + (Math.floor(d.getTime() / 1000) % 2 ? ':' : ' ') + c.mm;
          var tf = ctx.fit('88:88', ['10x20', '9x18B', '7x14B'], cellW - pad * 2 - labelW - 12, cellH - 4, 3);
          var tx = x0 + cellW - pad - tf.font.measure(timeStr) * tf.scale;
          fb.drawText(tf.font, timeStr, tx, y0 + Math.floor((cellH - 2 - tf.height) / 2), color, tf.scale);
          if (c.ampm) ctx.drawText('5x8', c.ampm, tx - 14, y0 + 2, 0x909098, 1);
          var note = c.dayDiff === 0 ? '' : c.dayDiff > 0 ? 'MAÑANA' : 'AYER';
          var lf = ctx.drawFit(z.label.toUpperCase(), { fonts: ['9x18B', '7x14B', '6x13', '5x8'], x: x0 + pad + 10, y: y0, w: labelW, h: note ? cellH - 14 : cellH - 2, align: 'left', valign: 'middle', color: 0xf0f0ff, maxScale: 2 });
          if (note && lf) ctx.drawText('5x8', note, x0 + pad + 10, y0 + cellH - 11, 0xff9a40, 1);
          void FB;
        });
      });
    }
  };
  E.widgets.worldclock = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
