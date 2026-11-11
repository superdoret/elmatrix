/* Christmas gallery, scenes 11-15: aurora over pines, penguins and polar bear, hot chocolate, hanging baubles, New Year. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  var L = E.navidadLib, FB = E.fb, Pen = L.Pen;
  function sky(ctx, p, y1, top, bot) { ctx.fb.vgradient(0, p.oy + y1, top, bot); }

  // Northern lights: curtains of vertical gradients that ripple with t. `k` scales the brightness.
  var AURORA = [0x30ff90, 0x20d8c8, 0xb060ff];
  function aurora(p, t, baseY, k) {
    for (var c = 0; c < 3; c++) {
      for (var x = -8; x < 200; x++) {
        var y0 = baseY + c * 7 + 7 * Math.sin(x * 0.03 + t * 0.3 + c * 1.7) + 4 * Math.sin(x * 0.09 - t * 0.55 + c),
            hgt = 20 + 9 * Math.sin(x * 0.045 + t * 0.2 + c * 2.1), it = (0.45 + 0.55 * Math.sin(x * 0.07 + t * 0.7 + c * 0.9)) * k;
        if (it <= 0.05) continue;
        for (var j = 0; j < hgt; j += 1) { var a = (1 - j / hgt); p.blend(x, y0 + j, AURORA[c], 0.5 * a * a * it); }
      }
    }
  }

  // ---- 11. Aurora over a snowy pine forest, with a fox -------------------------------------------------------------
  function fox(p, x, y, t) {
    var tail = Math.sin(t * 2) * 2, ear = (t % 6) > 5.6 ? 1 : 0, i;
    p.ell(x, y - 6, 7, 3, 0xd8702a); p.ell(x - 1, y - 5, 5, 2, 0xf0e0d0);
    p.ell(x + 8, y - 9, 3, 3, 0xd8702a); p.tri(x + 12, y - 8, 1, 3, 0x2a1a14);
    p.px(x + 10, y - 10, 0x101010); p.tri(x + 7, y - 14 + ear, 1, 3, 0xd8702a); p.tri(x + 9, y - 14, 1, 3, 0xd8702a); p.px(x + 12, y - 8, 0x101010);
    for (i = 0; i < 9; i++) p.px(x - 7 - i * 0.9, y - 5 - i * 0.2 + tail * (i / 9), i > 6 ? 0xf8f8f8 : 0xe0782a), p.px(x - 7 - i * 0.9, y - 6 - i * 0.2 + tail * (i / 9), i > 6 ? 0xf8f8f8 : 0xc86020);
    p.rect(x - 4, y - 3, 1, 3, 0x2a1a14); p.rect(x - 1, y - 3, 1, 3, 0x2a1a14); p.rect(x + 3, y - 3, 1, 3, 0x2a1a14); p.rect(x + 6, y - 3, 1, 3, 0x2a1a14);
  }
  L.register({
    id: 'aurora', name: 'Aurora boreal sobre pinos', fps: 15,
    make: function (ctx, rng) { return { p: new Pen(ctx.fb), stars: L.makeStars(rng, 90, ctx.w, ctx.h * 0.6), snow: L.makeSnow(rng, 40, ctx.w, ctx.h) }; },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x;
      sky(ctx, p, 78, 0x02030c, 0x0a2030);
      L.drawStars(fb, st.stars, t, 0xe0f0ff, 0.15);
      aurora(p, t, 14, 1);
      var ss = (t % 9) / 1.0;
      if (ss < 1) { p.line(150 - ss * 40, 8 + ss * 20, 158 - ss * 40, 5 + ss * 20, 0xffffff); p.px(150 - ss * 40, 8 + ss * 20, 0xc0ffff); }
      for (i = 0; i < 5; i++) { var mx = 6 + i * 44, mh = 24 + (i * 13) % 14; p.tri(mx, 76 - mh, mh * 0.95, mh, 0x16243e); p.tri(mx, 76 - mh, mh * 0.3, mh * 0.3, 0x8a9cc0); }
      // lake with reflected light
      p.rect(-10, 80, 212, 20, 0x0c2236);
      for (x = 0; x < 192; x += 1) { var rf = 0.5 + 0.5 * Math.sin(x * 0.08 + t * 0.8); for (i = 0; i < 6; i++) p.blend(x, 82 + i * 3, AURORA[x % 3 === 0 ? 1 : 0], 0.16 * rf * (1 - i / 6)); }
      p.rect(-10, 88, 212, 12, 0x9aacd0); p.hills(88, 2, 0.05, 0.1, 2, 0xb0c0e0, 94, 0);
      // forest layers
      for (x = -4; x < 200; x += 6) { var th = 14 + (x * 5) % 9, sw = Math.sin(t * 0.8 + x) * 0.4; p.tri(x + sw, 84 - th, 4, th, 0x081c1c); p.tri(x + sw, 84 - th, 4, 2, 0x6a7a9a); }
      for (x = 2; x < 200; x += 9) { var th2 = 22 + (x * 7) % 10; p.tri(x, 90 - th2, 6, th2, 0x0a2a24); for (i = 0; i < 4; i++) p.rect(x - 5 + i, 90 - th2 + 6 + i * 5, 3 + i, 1, 0x7a8cb0); p.rect(x, 90, 1, 4, 0x2a1a14); }
      fox(p, 44, 94, t);
      for (i = 0; i < 20; i++) p.px((i * 37) % 192, 92 + (i * 11) % 8, (Math.floor(t * 3) + i) % 5 ? 0x8a9cc0 : 0xe8f0ff);
      L.drawSnow(fb, st.snow, t, 0.3);
    }
  });

  // ---- 12. Penguins and a polar bear -------------------------------------------------------------------------------------
  function penguin(p, x, y, t, ph) {
    var wd = Math.sin(t * 4 + ph), fl = Math.sin(t * 4 + ph) * 2;
    p.ell(x, y - 7, 4, 6, 0x181c26); p.ell(x, y - 6, 2, 4, 0xf4f6fa); p.circ(x, y - 14, 3, 0x181c26);
    p.px(x - 1, y - 14, 0xffffff); p.px(x + 1, y - 14, 0xffffff); p.px(x, y - 13, 0xff9a20); p.px(x + 1, y - 13, 0xff9a20);
    p.line(x - 4, y - 9, x - 6, y - 6 + fl, 0x181c26); p.line(x + 4, y - 9, x + 6, y - 6 - fl, 0x181c26);
    p.rect(x - 3 + wd, y - 1, 3, 2, 0xff9a20); p.rect(x + 1 - wd, y - 1, 3, 2, 0xff9a20);
  }
  function slider(p, x, y, t) {
    p.ell(x, y - 3, 7, 3, 0x181c26); p.ell(x + 1, y - 2, 5, 1, 0xf4f6fa); p.circ(x + 7, y - 4, 2, 0x181c26); p.px(x + 9, y - 4, 0xff9a20); p.px(x + 8, y - 5, 0xffffff);
    p.rect(x - 9, y - 2, 3, 1, 0xff9a20); p.line(x - 2, y - 5, x - 4, y - 8 + Math.sin(t * 8) * 1.5, 0x181c26);
    for (var i = 0; i < 6; i++) p.px(x - 10 - i * 2, y + (i % 2), FB.mix(0xdfeaff, 0x9ec0e0, i / 6));
  }
  L.register({
    id: 'pinguinos', name: 'Pingüinos y osos polares', fps: 15,
    make: function (ctx, rng) { return { p: new Pen(ctx.fb), stars: L.makeStars(rng, 50, ctx.w, ctx.h * 0.4), snow: L.makeSnow(rng, 60, ctx.w, ctx.h) }; },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x;
      sky(ctx, p, 70, 0x0a2a5a, 0x7ec4e4);
      L.drawStars(fb, st.stars, t, 0xe8f4ff, 0.3);
      aurora(p, t, 6, 0.55);
      for (i = 0; i < 4; i++) { var bx = 20 + i * 52, bh = 18 + (i * 9) % 12; p.tri(bx, 70 - bh, bh * 0.8, bh, 0xb8dcf0); p.tri(bx + 3, 70 - bh * 0.7, bh * 0.45, bh * 0.7, 0x8ac0e0); }
      p.rect(-10, 66, 212, 14, 0x1a5a94); for (i = 0; i < 40; i++) { var wx = (i * 31 + Math.floor(t * 6)) % 192; p.px(wx, 68 + (i * 7) % 10, i % 3 ? 0x3a86c4 : 0x7ab8e8); p.px(wx + 1, 68 + (i * 7) % 10, 0x5a9ed4); }
      p.rect(-10, 78, 212, 22, 0xb4cce4); p.hills(78, 2, 0.05, 0.13, 3, 0xc8dcf0, 84, 0);
      for (i = 0; i < 8; i++) p.line(10 + i * 24, 84 + (i % 3) * 3, 22 + i * 24, 88 + (i % 2) * 4, 0x86a8d0);
      // igloo
      p.circ(24, 80, 12, 0xe4eefa); p.rect(12, 80, 25, 6, 0xc8d8ee); p.circ(24, 80, 12, 0xdce8f6);
      for (i = 0; i < 4; i++) p.line(14 + i * 3, 80 - Math.sqrt(144 - (14 + i * 3 - 24) * (14 + i * 3 - 24)), 14 + i * 3, 80, 0xa0b8d8);
      p.line(13, 76, 35, 76, 0xa0b8d8); p.line(15, 71, 33, 71, 0xa0b8d8); p.circ(24, 84, 4, 0x1a2a4a); p.rect(20, 84, 9, 3, 0x1a2a4a);
      // penguin group
      penguin(p, 62, 90, t, 0); penguin(p, 72, 88, t, 1.4); penguin(p, 82, 91, t, 2.6);
      // sliders crossing the ice
      slider(p, ((t * 14) % 260) - 40, 86, t); slider(p, ((t * 11 + 130) % 260) - 40, 94, t + 3);
      // polar bear
      var br = Math.sin(t * 1.4) * 0.7, hx = Math.sin(t * 0.5) * 1.2;
      p.ell(160, 76, 18, 10 + br, 0xe8eef8); p.ell(160, 83, 16, 4, 0xc4d4e8); p.ell(174, 85, 5, 4, 0xdce6f2); p.ell(150, 86, 5, 4, 0xdce6f2);
      p.ell(143 + hx, 67, 9, 7, 0xf0f4fc); p.ell(136 + hx, 70, 4, 3, 0xd4e0f0); p.px(133 + hx, 69, 0x14141c); p.px(134 + hx, 69, 0x14141c); p.px(141 + hx, 64, 0x14141c); p.px(146 + hx, 64, 0x14141c);
      p.circ(140 + hx, 61, 2, 0xdce6f4); p.circ(148 + hx, 61, 2, 0xdce6f4);
      L.drawSnow(fb, st.snow, t, 0.7);
      L.greet(ctx, p, 'Felices Fiestas', t, 2, 3, 0xe8f6ff);
    }
  });

  // ---- 13. Hot chocolate by a frosted window -------------------------------------------------------------------------------
  L.register({
    id: 'chocolate', name: 'Chocolate caliente',
    make: function (ctx, rng) { return { p: new Pen(ctx.fb), snow: L.makeSnow(rng, 60, 80, 50) }; },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x, y;
      fb.clear(0x2a1a14);
      p.rect(-10, 0, 212, 70, 0x3a2418); for (x = -10; x < 202; x += 10) p.rect(x, 0, 1, 70, 0x30200f);
      // window
      p.rect(40, 6, 112, 62, 0x6a4a2a); p.rect(43, 9, 106, 56, 0x0e1a3a);
      var wy;
      for (wy = 0; wy < 56; wy++) p.rect(43, 9 + wy, 106, 1, FB.mix(0x0a1432, 0x2a4a7a, wy / 56));
      for (i = 0; i < 40; i++) { var sy = ((st.snow[i * 5 + 1] + st.snow[i * 5 + 2] * t * 0.6) % 56), sx = (st.snow[i * 5] % 106 + Math.sin(t * 0.8 + st.snow[i * 5 + 3]) * 2 + 106) % 106; p.px(43 + sx, 9 + sy, i % 3 ? 0xdce8ff : 0xffffff); if (i % 4 === 0) p.px(44 + sx, 9 + sy, 0xc0d0f0); }
      p.rect(42 + 53, 9, 3, 56, 0x6a4a2a); p.rect(43, 36, 106, 3, 0x6a4a2a);
      p.circ(120, 56, 3, 0xffd070); p.glow(120, 56, 10, 0xffc040, 0.3); p.rect(116, 56, 8, 8, 0x3a2a3a);
      // frost
      for (i = 0; i < 26; i++) { p.px(43 + i, 9 + (i * 7) % 6, 0xdce8ff); p.px(43 + (i * 5) % 6, 9 + i, 0xc8d8f4); p.px(148 - i, 64 - (i * 7) % 6, 0xdce8ff); p.px(148 - (i * 5) % 6, 64 - i, 0xc8d8f4); }
      for (i = 0; i < 10; i++) { p.line(43, 9, 43 + i * 2, 9 + i * 2, 0x9ab4d8); p.line(148, 64, 148 - i * 2, 64 - i * 2, 0x9ab4d8); }
      p.rect(36, 64, 120, 4, 0x8a5a30);
      // curtains
      p.rect(28, 4, 12, 62, 0x8a2030); p.rect(152, 4, 12, 62, 0x8a2030); for (x = 29; x < 40; x += 3) { p.rect(x, 4, 1, 62, 0xa83040); p.rect(x + 124, 4, 1, 62, 0xa83040); }
      // table
      p.rect(-10, 70, 212, 30, 0x5a3418); for (y = 72; y < 100; y += 6) p.rect(-10, y, 212, 1, 0x4a2a12); p.rect(-10, 70, 212, 2, 0x9a6a38);
      // cookies and candy cane
      p.ell(40, 86, 16, 4, 0xe8e0d8); p.circ(34, 84, 5, 0xb87a38); p.circ(46, 85, 5, 0xc08840); p.px(33, 83, 0x3a2010); p.px(35, 85, 0x3a2010); p.px(45, 84, 0x3a2010); p.px(47, 86, 0x3a2010);
      cane2(p, 150, 92);
      // mug
      p.ell(96, 90, 24, 4, 0x2a1408); p.rect(78, 64, 36, 26, 0xf2eee8); p.ell(96, 90, 18, 3, 0xf2eee8); p.rect(78, 64, 4, 26, 0xd8d2cc); p.rect(110, 64, 4, 26, 0xc8c2bc);
      for (i = 0; i < 5; i++) { p.rect(79, 70 + i * 4, 34, 1, 0xd03030); }
      for (i = 0; i < 3; i++) { p.circ(92 + i * 6, 79, 1, 0xd03030); }
      p.ell(96, 64, 18, 4, 0xe8e2dc); p.ell(96, 64, 16, 3, 0x4a2412); p.ell(96, 64, 12, 2, 0x6a3418);
      p.ell(124, 76, 8, 8, 0xf2eee8); p.ell(124, 76, 5, 5, 0x5a3418);
      for (i = 0; i < 3; i++) { var mb = Math.sin(t * 1.5 + i * 2) * 0.8; p.rect(87 + i * 7, 61 + mb, 5, 4, 0xfdfaf6); p.rect(87 + i * 7, 64 + mb, 5, 1, 0xdcd4cc); }
      // steam
      for (i = 0; i < 3; i++) for (var j = 0; j < 22; j++) { var k = j / 22, sxp = 90 + i * 7 + Math.sin(j * 0.45 + t * 1.6 + i * 2) * (1.5 + k * 3); p.blend(sxp, 58 - j, 0xffffff, 0.5 * (1 - k)); p.blend(sxp + 1, 58 - j, 0xffffff, 0.3 * (1 - k)); }
      // candle
      p.rect(166, 74, 6, 18, 0xe8e0d0); p.rect(164, 90, 10, 2, 0xe8c040); p.rect(168, 72, 1, 3, 0x2a2a2a);
      var fl = Math.sin(t * 10) * 0.6 + Math.sin(t * 17) * 0.4;
      p.glow(169, 70, 18, 0xffa030, 0.3 + 0.05 * fl); p.ell(169 + fl * 0.3, 69, 1, 3, 0xff9a20); p.px(169, 70, 0xffee80);
    }
  });
  function cane2(p, x, y) { for (var i = 0; i < 16; i++) p.rect(x + i, y - Math.floor(i * 0.2), 1, 2, (i >> 1) % 2 ? 0xffffff : 0xe02030); p.rect(x + 15, y - 5, 2, 5, 0xe02030); p.rect(x + 13, y - 6, 4, 2, 0xffffff); }

  // ---- 14. Hanging baubles --------------------------------------------------------------------------------------------------------
  var BAUBLES = [[28, 20, 9, 0xd02030], [52, 34, 11, 0xe8c040], [76, 22, 8, 0x3a6ad8], [100, 40, 12, 0x28a050], [126, 24, 9, 0xa040c8], [150, 36, 11, 0xdce4f0], [172, 20, 8, 0xff70b0]];
  L.register({
    id: 'bolas', name: 'Bolas del árbol',
    make: function (ctx, rng) { return { p: new Pen(ctx.fb), bok: L.makeStars(rng, 30, 192, 100), sp: L.makeStars(rng, 40, 192, 90) }; },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x;
      sky(ctx, p, 100, 0x05030f, 0x1a0e2a);
      for (i = 0; i < st.bok.length; i += 3) p.glow(st.bok[i], st.bok[i + 1], 7, [0xff4060, 0xffd040, 0x40a0ff, 0x40ff90][(i / 3) % 4], 0.08 + 0.07 * Math.sin(t * 0.9 + st.bok[i + 2]));
      // pine garland + string lights along the top
      for (x = -8; x < 200; x += 1) { var gy = 3 + Math.round(3 * Math.sin(x * 0.12)); p.rect(x, gy - 3, 1, 5 + (x % 3), (x % 4) ? 0x1a6a30 : 0x2a8a40); }
      for (i = 0; i < 24; i++) { var lx = 4 + i * 8, ly = 7 + Math.round(3 * Math.sin(lx * 0.12)), on = (Math.floor(t * 3) + i) % 4; var lc = [0xff4040, 0xffd040, 0x40a0ff, 0x40ff90][i % 4]; p.px(lx, ly, on ? lc : FB.scaleColor(lc, 0.25)); if (on) p.glow(lx, ly + 1, 4, lc, 0.35); }
      for (i = 0; i < 7; i++) { var sy = 12 + i * 12; p.px(2, sy, [0xff4040, 0xffd040, 0x40a0ff][i % 3]); p.px(189, sy + 6, [0x40ff90, 0xff70b0, 0xffd040][i % 3]); }
      // baubles
      for (i = 0; i < BAUBLES.length; i++) {
        var b = BAUBLES[i], len = 24 + b[1], ang = Math.sin(t * (0.9 + i * 0.07) + i * 1.3) * 0.11, bx = b[0] + Math.sin(ang) * len, by = 8 + Math.cos(ang) * len, r = b[2];
        p.line(b[0], 8, bx, by - r - 2, 0xc0c0d0);
        p.rect(bx - 2, by - r - 3, 5, 3, 0xe8c040); p.px(bx, by - r - 4, 0xe8c040);
        p.circ(bx, by, r, FB.scaleColor(b[3], 0.55)); p.circ(bx - 1, by - 1, r - 1, b[3]); p.circ(bx - 2, by - 2, Math.max(1, r - 4), FB.mix(b[3], 0xffffff, 0.35));
        if (i % 2 === 0) { p.rect(bx - r + 1, by - 1, r * 2 - 2, 2, FB.mix(b[3], 0xffffff, 0.5)); } else { for (var d = 0; d < 5; d++) p.px(bx - r + 2 + d * (r / 2.5), by + 3 + (d % 2), 0xffffff); }
        p.rect(bx - 3, by - 4, 2, 2, 0xffffff); p.px(bx - 4, by - 3, 0xffffff);
        var tw = (Math.floor(t * 2 + i) % 5) === 0; if (tw) { p.px(bx + r - 2, by - r + 3, 0xffffff); p.px(bx + r - 3, by - r + 3, 0xffffff); p.px(bx + r - 2, by - r + 2, 0xffffff); p.px(bx + r - 2, by - r + 4, 0xffffff); }
      }
      for (i = 0; i < st.sp.length; i += 3) if (Math.sin(t * 2.2 + st.sp[i + 2]) > 0.93) { p.px(st.sp[i], st.sp[i + 1], 0xffffff); p.px(st.sp[i] + 1, st.sp[i + 1], 0xffe8c0); p.px(st.sp[i] - 1, st.sp[i + 1], 0xffe8c0); p.px(st.sp[i], st.sp[i + 1] + 1, 0xffe8c0); p.px(st.sp[i], st.sp[i + 1] - 1, 0xffe8c0); }
      L.greet(ctx, p, 'Feliz Navidad', t, 2, 80, 0xffd8e8);
    }
  });

  // ---- 15. New Year fireworks ------------------------------------------------------------------------------------------------------------------
  L.register({
    id: 'anonuevo', name: 'Año Nuevo',
    make: function (ctx, rng) {
      var FW = E.widgets.fireworks, bld = [], x = -2, i;
      while (x < 196) { var w = 8 + Math.floor(rng() * 12), h = 10 + Math.floor(rng() * 26); bld.push({ x: x, w: w, h: h, s: Math.floor(rng() * 90) }); x += w + Math.floor(rng() * 3); }
      var conf = []; for (i = 0; i < 60; i++) conf.push(rng(), rng(), 6 + rng() * 10, rng() * 6.28, Math.floor(rng() * 5));
      return { p: new Pen(ctx.fb), pool: FW.createPool(420), rockets: [], last: 0, next: 0.5, bld: bld, conf: conf, stars: L.makeStars(rng, 50, ctx.w, ctx.h * 0.6) };
    },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, FW = E.widgets.fireworks, rng = ctx.rng, i, dt = Math.min(0.08, t - st.last);
      st.last = t;
      sky(ctx, p, 86, 0x04030f, 0x2a1a4a);
      L.drawStars(fb, st.stars, t, 0xe0d8ff, 0.3);
      st.next -= dt;
      if (st.next <= 0 && st.rockets.length < 3) { st.rockets.push({ x: 30 + rng() * 130, y: 84, vy: -(55 + rng() * 25), top: 14 + rng() * 26, hue: rng() * 360 }); st.next = 0.7 + rng() * 1.1; }
      for (i = st.rockets.length - 1; i >= 0; i--) {
        var r = st.rockets[i]; r.y += r.vy * dt; r.vy += 18 * dt;
        p.px(r.x, r.y, 0xffe8b0); p.px(r.x, r.y + 1, 0xff9030);
        if (r.y <= r.top || r.vy > -10) { FW.explode(st.pool, r.x + p.ox, r.y + p.oy, 70 + Math.floor(rng() * 50), r.hue, rng, rng() < 0.35); st.rockets.splice(i, 1); }
      }
      FW.stepParticles(st.pool, dt);
      var pool = st.pool;
      for (i = 0; i < pool.n; i++) {
        var life = pool.life[i]; if (life <= 0) continue;
        var f = life / pool.max[i], col = FB.hsv(pool.hue[i], f > 0.3 ? 1 : 0.5, Math.min(1, 0.25 + f * 1.1)), px = pool.x[i], py = pool.y[i];
        fb.setPixel(px, py, col); if (f > 0.3) { fb.setPixel(px + 1, py, col); fb.setPixel(px, py + 1, col); }
      }
      // skyline
      for (i = 0; i < st.bld.length; i++) {
        var b = st.bld[i]; p.rect(b.x, 98 - b.h, b.w, b.h + 2, 0x0a0816);
        for (var wy = 98 - b.h + 2; wy < 96; wy += 4) for (var wx = b.x + 1; wx < b.x + b.w - 1; wx += 3) if ((wx * 5 + wy * 3 + b.s) % 7 < 2) p.px(wx, wy, (Math.floor(t * 0.5) + wx + wy) % 9 ? 0xffd060 : 0x6a4a20);
      }
      // confetti
      for (i = 0; i < 60; i++) { var o = i * 5; var cx = (st.conf[o] * 192 + Math.sin(t + st.conf[o + 3]) * 6), cy = ((st.conf[o + 1] * 100 + st.conf[o + 2] * t) % 104) - 2; p.px(cx, cy, [0xff4060, 0xffd030, 0x40d0ff, 0x70ff90, 0xff80d0][st.conf[o + 4]]); }
      // headline: "Feliz <year>" with a sweeping highlight
      var yr = E.widgets.navidad.newYear(ctx.date()), txt = 'Feliz ' + yr, f2 = ctx.fit(txt, ['10x20', '9x18B'], ctx.w - 16, 60, 3);
      var tx = Math.round((ctx.w - f2.width) / 2), ty = p.oy + 34, sweep = ((t * 0.5) % 2.2 - 0.3) * ctx.w;
      fb.drawText(f2.font, txt, tx + 1, ty + 2, 0x120a02, f2.scale);
      fb.drawText(f2.font, txt, tx, ty, 0, f2.scale, { colorFn: function (px, py) { var d = Math.abs(px - sweep), k = d < 14 ? 1 - d / 14 : 0; return FB.mix(FB.mix(0xffc030, 0xfff0a0, (py - ty) / f2.height), 0xffffff, k * 0.8); } });
    }
  });
})(typeof window !== 'undefined' ? window : global);
