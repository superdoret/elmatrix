/* Plasma: classic sine-sum colour field, computed at half resolution with lookup tables. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  var SIN = new Uint8Array(256), PAL = [];
  (function init() {
    for (var i = 0; i < 256; i++) SIN[i] = Math.round(127.5 + 127.5 * Math.sin(i * Math.PI * 2 / 256));
    for (var p = 0; p < 256; p++) {
      var a = p / 256 * Math.PI * 2;
      var r = Math.round(127.5 + 127.5 * Math.sin(a)), gg = Math.round(127.5 + 127.5 * Math.sin(a + 2.1)), b = Math.round(127.5 + 127.5 * Math.sin(a + 4.2));
      PAL.push((r << 16) | (gg << 8) | b);
    }
  })();

  // Distance-from-centre table (Uint8Array pw*ph) for the radial term.
  function distTable(pw, ph) {
    var d = new Uint8Array(pw * ph), cx = pw / 2, cy = ph / 2;
    for (var y = 0; y < ph; y++) for (var x = 0; x < pw; x++) d[y * pw + x] = Math.min(255, Math.floor(Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) * 5));
    return d;
  }

  /* Palette index (0..255) of cell (x, y) at phase `ph` (integer steps). */
  function plasmaIndex(dist, pw, x, y, ph) {
    var v = SIN[(x * 5 + ph) & 255] + SIN[(y * 7 - ph * 2) & 255] + SIN[((x + y) * 3 + ph) & 255] + SIN[(dist[y * pw + x] * 2 + ph * 3) & 255];
    return (v >> 2) & 255;
  }

  var widget = {
    id: 'plasma',
    SIN: SIN, PAL: PAL, distTable: distTable, plasmaIndex: plasmaIndex,
    run: async function (ctx) {
      var fb = ctx.fb, w = ctx.w, h = ctx.h, pw = Math.floor(w / 2), ph = Math.floor(h / 2), dist = distTable(pw, ph);
      await ctx.loop(ctx.cfg.duration, 20, function (t) {
        var phase = Math.floor(t * 40), shift = Math.floor(t * 12), data = fb.data;
        for (var y = 0; y < ph; y++) {
          var row = y * 2 * w;
          for (var x = 0; x < pw; x++) {
            var c = PAL[(plasmaIndex(dist, pw, x, y, phase) + shift) & 255], o = row + x * 2;
            data[o] = c; data[o + 1] = c; data[o + w] = c; data[o + w + 1] = c;
          }
        }
      });
    }
  };
  E.widgets.plasma = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
