/* Reloj Tetris: the time is built out of falling Tetris pieces, ported from src/tetris_led.py (the Raspberry clock).
 * The piece lists below are the original "number" data: [shape, colour index, x, bottom edge, final rotation] per piece,
 * in block units; each digit is 6 x 10 blocks. Pieces of one digit fall one after another (the original rotates them
 * one step per block while falling), all digits at once. On a minute change the pieces of the digits that changed
 * drop out of the field and the new ones fall in. Pure layout logic is exported for tests. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  // SHAPES[shape][rotation] = rects [x1, x2, y1, y2] (x2/y2 exclusive) in block units, as drawn by draw_shape()
  var SHAPES = [
    [[[0,2,0,2]],[[0,2,0,2]],[[0,2,0,2]],[[0,2,0,2]]],
    [[[0,1,0,3],[1,2,2,3]],[[0,3,1,2],[0,1,2,3]],[[0,2,1,2],[1,2,2,4]],[[2,3,1,2],[0,3,2,3]]],
    [[[0,1,2,3],[1,2,0,3]],[[0,1,1,2],[0,3,2,3]],[[0,2,0,1],[0,1,0,3]],[[0,3,1,2],[2,3,2,3]]],
    [[[0,4,2,3]],[[0,1,0,4]],[[0,4,2,3]],[[0,1,0,4]]],
    [[[0,1,0,2],[1,2,1,3]],[[1,3,0,1],[0,2,1,2]],[[0,1,0,2],[1,2,1,3]],[[1,3,0,1],[0,2,1,2]]],
    [[[0,1,1,3],[1,2,0,2]],[[0,2,0,1],[1,3,1,2]],[[0,1,1,3],[1,2,0,2]],[[0,2,0,1],[1,3,1,2]]],
    [[[1,2,0,1],[0,3,1,2]],[[0,1,0,3],[1,2,1,2]],[[0,3,0,1],[1,2,1,2]],[[0,1,1,2],[1,2,0,3]]],
    [[[0,1,0,1],[0,2,1,2]],[[0,2,0,1],[0,1,1,2]],[[0,2,0,1],[1,2,1,2]],[[1,2,0,1],[0,2,1,2]]]
  ];
  var DIGITS = [
    [[2,5,4,16,0],[4,7,2,16,1],[3,4,0,16,1],[6,6,1,16,1],[5,1,4,14,0],[6,6,0,13,3],[5,1,4,12,0],[5,1,0,11,0],[6,6,4,10,1],[6,6,0,9,1],[5,1,1,8,1],[2,5,3,8,3]],
    [[2,5,4,16,0],[3,4,4,15,1],[3,4,5,13,3],[2,5,4,11,2],[0,0,4,8,0]],
    [[0,0,4,16,0],[3,4,0,16,1],[1,2,1,16,3],[1,2,1,15,0],[3,4,1,12,2],[1,2,0,12,1],[2,5,3,12,3],[0,0,4,10,0],[3,4,1,8,0],[2,5,3,8,3],[1,2,0,8,1]],
    [[1,2,3,16,3],[2,5,0,16,1],[3,4,1,15,2],[0,0,4,14,0],[3,4,1,12,2],[1,2,0,12,1],[3,4,5,12,3],[2,5,3,11,0],[3,4,1,8,0],[1,2,0,8,1],[2,5,3,8,3]],
    [[0,0,4,16,0],[0,0,4,14,0],[3,4,1,12,0],[1,2,0,12,1],[2,5,0,10,0],[2,5,3,12,3],[3,4,4,10,3],[2,5,0,9,2],[3,4,5,10,1]],
    [[0,0,0,16,0],[2,5,2,16,1],[2,5,3,15,0],[3,4,5,16,1],[3,4,1,12,0],[1,2,0,12,1],[2,5,3,12,3],[0,0,0,10,0],[3,4,1,8,2],[1,2,0,8,1],[2,5,3,8,3]],
    [[2,5,0,16,1],[5,1,2,16,1],[6,6,0,15,3],[6,6,4,16,3],[5,1,4,14,0],[3,4,1,12,2],[2,5,0,13,2],[3,4,2,11,0],[0,0,0,10,0],[3,4,1,8,0],[1,2,0,8,1],[2,5,3,8,3]],
    [[0,0,4,16,0],[1,2,4,14,0],[3,4,5,13,1],[2,5,4,11,2],[3,4,1,8,2],[2,5,3,8,3],[1,2,0,8,1]],
    [[3,4,1,16,0],[6,6,0,16,1],[3,4,5,16,1],[1,2,2,15,3],[4,7,0,14,0],[1,2,1,12,3],[6,6,4,13,1],[2,5,0,11,1],[4,7,0,10,0],[4,7,4,11,0],[5,1,0,8,1],[5,1,2,8,1],[1,2,4,9,2]],
    [[0,0,0,16,0],[3,4,2,16,0],[1,2,2,15,3],[1,2,4,15,2],[3,4,1,12,2],[3,4,5,12,3],[5,1,0,12,0],[1,2,2,11,3],[5,1,4,9,0],[6,6,0,10,1],[5,1,0,8,1],[6,6,2,8,2]]
  ];
  // colour index -> RGB: red, green, blue, white, yellow, cyan, magenta, grey (the original palette)
  var COLORS = [0xff3b3b, 0x3bd65a, 0x3a6aff, 0xf2f2f8, 0xffd83a, 0x3ad8ff, 0xd83aff, 0x7a7a8c];

  var FIELD_W = 31, FIELD_H = 16;          // playfield in blocks
  var SLOT_X = [1, 8, 17, 24];             // digit slots: H H : M M
  var FALL_SPEED = 38;                     // blocks per second
  var GRAVITY = 90;                        // blocks / s^2 for pieces falling out of the field
  var AWAY_STAGGER = 0.05;

  // Final cells of a piece in digit-local block coordinates plus its landing top row.
  function pieceCells(p) {
    var rects = SHAPES[p[0]][p[4] % 4], maxY = 0, i, x, y, cells = [];
    for (i = 0; i < rects.length; i++) if (rects[i][3] > maxY) maxY = rects[i][3];
    var top = p[3] - maxY;
    for (i = 0; i < rects.length; i++) {
      var r = rects[i];
      for (y = r[2]; y < r[3]; y++) for (x = r[0]; x < r[1]; x++) cells.push([p[2] + x, top + y]);
    }
    return { cells: cells, top: top };
  }

  /* Pieces of a digit ('0'..'9') as [{color, rot, x, top, cells:[[x,y]...] (final), bounds}]. The original data has a few pieces
   * that overlap by one block (the later piece is drawn over the earlier one): the earlier piece loses that block, so no two
   * pieces share a cell and the union is the same glyph. */
  function digitPieces(ch) {
    var list = DIGITS[ch.charCodeAt(0) - 48], owner = {}, pieces = [], i, k;
    for (i = 0; i < list.length; i++) {
      var pc = pieceCells(list[i]);
      var piece = { color: list[i][1], shape: list[i][0], finalRot: list[i][4], x: list[i][2], top: pc.top, bottom: list[i][3], cells: [] };
      pieces.push(piece);
      for (k = 0; k < pc.cells.length; k++) {
        var key = pc.cells[k][0] + ',' + pc.cells[k][1];
        if (owner[key] !== undefined) { // later piece wins
          var prev = pieces[owner[key]];
          prev.cells = prev.cells.filter(function (c) { return c[0] + ',' + c[1] !== key; });
        }
        owner[key] = i; piece.cells.push(pc.cells[k]);
      }
    }
    return pieces;
  }

  // 6x10 bitmap (array of strings) of a digit built from its pieces
  function glyph(ch) {
    var rows = [], y, x;
    for (y = 0; y < 10; y++) { rows.push([]); for (x = 0; x < 6; x++) rows[y].push('.'); }
    digitPieces(ch).forEach(function (p) { p.cells.forEach(function (c) { rows[c[1] - 6][c[0]] = '#'; }); });
    return rows.map(function (r) { return r.join(''); });
  }

  /* Characters of the four slots for a date: '0'-'9', or null for a blank slot (12h format, hours below 10). */
  function digitsFor(date, h24) {
    var h = date.getHours(), m = date.getMinutes(), hh;
    if (h24) hh = (h < 10 ? '0' : '') + h; else { var h12 = h % 12 || 12; hh = (h12 < 10 ? ' ' : '') + h12; }
    var mm = (m < 10 ? '0' : '') + m, s = hh + mm, out = [];
    for (var i = 0; i < 4; i++) out.push(s.charAt(i) === ' ' ? null : s.charAt(i));
    return out;
  }

  /* One digit slot: pieces fall sequentially (build), rest, then drop away when the target changes. State is advanced from
   * the absolute time `t` (seconds), so it is deterministic and frame-rate independent. */
  function makeSlot() { return { inited: false, shown: null, pieces: [], target: null, away: false, doneAt: 0 }; }

  function startBuild(slot, ch, t) {
    slot.pieces = ch === null ? [] : digitPieces(ch).map(function (p) { return { p: p, phase: 'wait', y: -4, t0: 0, landedAt: 0, landedY: p.top, rot: 0, tAway: 0 }; });
    slot.shown = ch; slot.target = ch; slot.away = false; slot.inited = true;
    if (slot.pieces.length) { slot.pieces[0].phase = 'fall'; slot.pieces[0].t0 = t; }
  }

  // Advances the slot to time `t` (seconds); returns how many pieces landed in this step (used for the score).
  function stepSlot(slot, target, t) {
    var landed = 0, i, pc, n = slot.pieces.length;
    if (!slot.inited) { startBuild(slot, target, t); n = slot.pieces.length; }
    else if (!slot.away && target !== slot.target) {
      // the digit changed: resting pieces drop out of the field top-first, pieces that had not landed yet just vanish
      slot.away = true; slot.target = target;
      var order = 0;
      for (i = n - 1; i >= 0; i--) {
        pc = slot.pieces[i];
        if (pc.phase === 'rest') { pc.phase = 'away'; pc.tAway = t + order * AWAY_STAGGER; order++; } else pc.phase = 'gone';
      }
    }
    if (slot.away) {
      var gone = true;
      for (i = 0; i < n; i++) {
        pc = slot.pieces[i];
        if (pc.phase !== 'away') continue;
        var dt = Math.max(0, t - pc.tAway);
        pc.y = pc.p.top + 0.5 * GRAVITY * dt * dt;
        if (pc.y < FIELD_H + 4) gone = false;
      }
      if (gone) startBuild(slot, slot.target, t);
      return 0;
    }
    var cur = -1;
    for (i = 0; i < n; i++) if (slot.pieces[i].phase === 'fall') { cur = i; break; }
    while (cur >= 0) {
      pc = slot.pieces[cur];
      var y = Math.max(-4, -4 + FALL_SPEED * (t - pc.t0));
      if (y >= pc.p.top) {
        pc.y = pc.p.top; pc.phase = 'rest'; pc.landedAt = pc.t0 + (pc.p.top + 4) / FALL_SPEED; landed++;
        if (cur + 1 < n) { slot.pieces[cur + 1].phase = 'fall'; slot.pieces[cur + 1].t0 = pc.landedAt + 0.03; cur++; }
        else { slot.doneAt = pc.landedAt; cur = -1; }
      } else {
        pc.y = y; pc.rot = Math.min(pc.p.finalRot, Math.floor((y + 4) / 1.5));
        cur = -1;
      }
    }
    return landed;
  }

  // ---- drawing ------------------------------------------------------------------------------------------------------
  function shade(c, k) { return E.fb.scaleColor(c, k); }

  // Beveled block of u x u LEDs at (px, py), clipped to the playfield rectangle clip = [x0, y0, x1, y1]
  function block(fb, px, py, u, color, clip) {
    var x0 = Math.max(px, clip[0]), x1 = Math.min(px + u, clip[2]), y0 = Math.max(py, clip[1]), y1 = Math.min(py + u, clip[3]);
    if (x1 <= x0 || y1 <= y0) return;
    fb.fillRect(x0, y0, x1 - x0, y1 - y0, shade(color, 0.78));
    var hi = E.fb.mix(color, 0xffffff, 0.45), lo = shade(color, 0.45), d = fb.data, w = fb.w, x, y;
    for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) {
      var lx = x - px, ly = y - py, v;
      if (ly === 0 || lx === 0) v = hi; else if (ly === u - 1 || lx === u - 1) v = lo; else if (lx <= 1 && ly <= 1) v = hi; else v = color;
      d[y * w + x] = v;
    }
  }

  function playfield(ctx, L) {
    var u = Math.max(2, Math.min(Math.floor((ctx.w - 36) / (FIELD_W + 1)), Math.floor((ctx.h - 26) / (FIELD_H + 2))));
    var fw = FIELD_W * u, fh = FIELD_H * u;
    var fx = Math.floor((ctx.w - fw) / 2), fy = ctx.h - fh - Math.max(5, Math.floor((ctx.h - fh - 24) / 2)) ;
    return { u: u, fx: fx, fy: fy, fw: fw, fh: fh };
  }

  function drawFrame(fb, f) {
    var x = f.fx - 3, y = f.fy - 3, w = f.fw + 6, h = f.fh + 6, i;
    fb.fillRect(x, y, w, h, 0x2a2c48);
    fb.rect(x, y, w, h, 0x7a80c8); fb.rect(x + 1, y + 1, w - 2, h - 2, 0x4a4e88); fb.rect(x + 2, y + 2, w - 4, h - 4, 0x181a30);
    fb.fillRect(f.fx, f.fy, f.fw, f.fh, 0x07070f);
    for (i = 1; i < FIELD_W; i++) for (var j = 1; j < FIELD_H; j++) fb.setPixel(f.fx + i * f.u, f.fy + j * f.u, 0x1a1a2c);
  }

  var TITLE = [['T', 0xff3b3b], ['E', 0xff9a2a], ['T', 0xffd83a], ['R', 0x3bd65a], ['I', 0x3ad8ff], ['S', 0xd83aff]];

  var widget = {
    id: 'tetris',
    SHAPES: SHAPES, DIGITS: DIGITS, COLORS: COLORS, FIELD_W: FIELD_W, FIELD_H: FIELD_H, SLOT_X: SLOT_X,
    pieceCells: pieceCells, digitPieces: digitPieces, glyph: glyph, digitsFor: digitsFor, makeSlot: makeSlot, stepSlot: stepSlot,
    run: async function (ctx) {
      var fb = ctx.fb, cfg = ctx.cfg, f = playfield(ctx), u = f.u, slots = [makeSlot(), makeSlot(), makeSlot(), makeSlot()];
      var clip = [f.fx, f.fy, f.fx + f.fw, f.fy + f.fh], score = 0, scoreShown = 0, next = ctx.rand(8), nextAt = 0, last = 0;
      var titleFont = ctx.fonts['9x18B'], small = ctx.fonts['5x8'];
      await ctx.loop(cfg.duration, 30, function (t) {
        var d = ctx.date(), chars = digitsFor(d, cfg.format24h), i, k, dt = Math.min(0.1, t - last);
        last = t;
        for (i = 0; i < 4; i++) { var landed = stepSlot(slots[i], chars[i], t); score += landed * 10; }
        if (scoreShown < score) scoreShown = Math.min(score, scoreShown + Math.max(1, Math.round(dt * 400)));
        if (t - nextAt > 3) { nextAt = t; next = ctx.rand(7); }
        fb.vgradient(0, ctx.h, 0x05050c, 0x10102a);
        // title: one colour per letter
        var tw = 6 * titleFont.measure('T'), tx = Math.floor((ctx.w - tw) / 2), ty = Math.max(1, f.fy - 3 - 18 - 3);
        for (i = 0; i < 6; i++) ctx.drawText('9x18B', TITLE[i][0], tx + i * titleFont.measure('T'), ty, TITLE[i][1], 1);
        // score (left) and next piece preview (right)
        var sy = Math.max(1, ty + 2);
        ctx.drawText('5x8', 'PUNTOS', 4, sy, 0x8a90d0, 1);
        var sc = String(scoreShown); while (sc.length < 6) sc = '0' + sc;
        ctx.drawText('5x8', sc, 4, sy + 10, 0xffffff, 1);
        ctx.drawText('5x8', 'SIGUIENTE', ctx.w - 4 - small.measure('SIGUIENTE'), sy, 0x8a90d0, 1);
        var rects = SHAPES[next][Math.floor(t * 1.2) % 4], nu = Math.max(2, u), nx = ctx.w - 4 - 4 * nu - 4, ny = sy + 16;
        fb.rect(nx - 4, ny - 4, 4 * nu + 8, 4 * nu + 8, 0x3a3e70);
        for (k = 0; k < rects.length; k++) for (var yy = rects[k][2]; yy < rects[k][3]; yy++) for (var xx = rects[k][0]; xx < rects[k][1]; xx++) block(fb, nx + xx * nu, ny + yy * nu, nu, COLORS[(next + 1) % 8], [0, 0, ctx.w, ctx.h]);
        drawFrame(fb, f);
        // pieces
        for (i = 0; i < 4; i++) {
          var slot = slots[i], ox = SLOT_X[i];
          for (k = 0; k < slot.pieces.length; k++) {
            var pc = slot.pieces[k];
            if (pc.phase === 'wait' || pc.phase === 'gone') continue;
            var col = COLORS[pc.p.color];
            if (pc.phase === 'rest' || pc.phase === 'away') {
              var dy = pc.y - pc.p.top;
              for (var c = 0; c < pc.p.cells.length; c++) block(fb, f.fx + (ox + pc.p.cells[c][0]) * u, f.fy + Math.round((pc.p.cells[c][1] + dy) * u), u, col, clip);
            } else { // falling: rotating tetromino at the current rotation (the final one is reached while falling)
              var rr = SHAPES[pc.p.shape][pc.rot % 4], q;
              var topNow = pc.y; // pc.y is the current top row of the falling piece
              for (q = 0; q < rr.length; q++) for (var by = rr[q][2]; by < rr[q][3]; by++) for (var bx = rr[q][0]; bx < rr[q][1]; bx++) {
                block(fb, f.fx + (ox + pc.p.x + bx) * u, f.fy + Math.round((topNow + by) * u), u, col, clip);
              }
            }
          }
        }
        // colon: two blocks blinking once a second
        if (d.getSeconds() % 2 === 0) { block(fb, f.fx + 15 * u, f.fy + 8 * u, u, 0xffd83a, clip); block(fb, f.fx + 15 * u, f.fy + 12 * u, u, 0xffd83a, clip); }
        // drifting dust inside the field (the original has none; keeps the empty top alive)
        for (i = 0; i < 6; i++) { var dx = (i * 37 + Math.floor(t * 4)) % (FIELD_W * u), dyy = (i * 19 + Math.floor(t * 9 + i * 7)) % (6 * u); if ((i + Math.floor(t * 2)) % 3) fb.setPixel(f.fx + dx, f.fy + dyy, 0x22223a); }
      });
    }
  };
  E.widgets.tetris = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
