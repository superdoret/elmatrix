/* Matrix rain: columns of falling glyphs with fading green tails. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  var GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-*<>=:;#$%&';
  var CELL_W = 6, CELL_H = 8;

  // Colour of a tail cell: dist = rows behind the head, len = tail length. Head is near white.
  function trailColor(dist, len) {
    if (dist <= 0.5) return 0xdcffdc;
    var b = 1 - dist / len;
    if (b <= 0.04) return 0;
    return (Math.round(40 * b * b) << 16) | (Math.round(255 * b) << 8) | Math.round(70 * b * b);
  }

  function resetColumn(col, rows, rng, initial) {
    col.len = 7 + Math.floor(rng() * 12);
    col.speed = 7 + rng() * 14;
    col.head = initial ? rng() * rows : -rng() * rows * 0.25;
  }

  // Advances one column; restarts it once its whole tail has left the bottom. Returns true on restart.
  function stepColumn(col, dt, rows, rng) {
    col.head += col.speed * dt;
    if (col.head - col.len > rows) { resetColumn(col, rows, rng, false); return true; }
    return false;
  }

  var widget = {
    id: 'matrixrain',
    trailColor: trailColor, resetColumn: resetColumn, stepColumn: stepColumn, GLYPHS: GLYPHS,
    run: async function (ctx) {
      var fb = ctx.fb, w = ctx.w, h = ctx.h, font = ctx.fonts['5x8'];
      var cols = Math.floor(w / CELL_W), rows = Math.ceil(h / CELL_H), i, r;
      var cs = [];
      for (i = 0; i < cols; i++) {
        var chars = [];
        for (r = 0; r < rows + 2; r++) chars.push(GLYPHS.charAt(ctx.rand(GLYPHS.length)));
        var col = { head: 0, len: 0, speed: 0, chars: chars };
        resetColumn(col, rows, ctx.rng, true);
        cs.push(col);
      }
      var offX = Math.floor((w - cols * CELL_W) / 2), last = 0;
      await ctx.loop(ctx.cfg.duration, 20, function (t) {
        var dt = Math.min(0.1, t - last); last = t;
        fb.clear(0x000300);
        for (var c = 0; c < cols; c++) {
          var col = cs[c];
          stepColumn(col, dt, rows, ctx.rng);
          var headRow = Math.floor(col.head);
          if (headRow >= 0 && headRow < rows) col.chars[headRow] = GLYPHS.charAt(ctx.rand(GLYPHS.length));
          if (ctx.rng() < 0.15) col.chars[ctx.rand(rows)] = GLYPHS.charAt(ctx.rand(GLYPHS.length));
          var x = offX + c * CELL_W;
          for (var k = 0; k < col.len; k++) {
            var row = headRow - k;
            if (row < 0 || row >= rows) continue;
            var color = trailColor(col.head - row, col.len);
            if (color) fb.drawText(font, col.chars[row], x, row * CELL_H, color, 1);
          }
        }
      });
    }
  };
  E.widgets.matrixrain = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
