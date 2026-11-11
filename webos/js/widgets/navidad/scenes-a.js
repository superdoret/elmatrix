/* Christmas gallery, scenes 1-5: tree, snowman, Santa over the rooftops, fireplace with stockings, nativity. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  var L = E.navidadLib, FB = E.fb, Pen = L.Pen;

  function sky(ctx, p, y1, top, bot) { ctx.fb.vgradient(0, p.oy + y1, top, bot); }

  // ---- 1. Christmas tree (the original pixelart navidad scene) ------------------------------------------
  L.register({
    id: 'arbol', name: 'Árbol de Navidad',
    make: function (ctx) { return { s: E.widgets.pixelart.navidadState(ctx) }; },
    draw: function (ctx, st, t) { E.widgets.pixelart.drawNavidad(ctx, st.s, t, false); }
  });

  // ---- 2. Snowman ----------------------------------------------------------------------------------------
  function ball(p, cx, cy, r) {
    p.circ(cx, cy, r, 0x9fb4dc); p.circ(cx - 1, cy - 1, r - 1, 0xdde8ff); p.circ(cx - 2, cy - 2, Math.max(1, r - 4), 0xffffff);
  }
  L.register({
    id: 'muneco', name: 'Muñeco de nieve',
    make: function (ctx, rng) {
      return { p: new Pen(ctx.fb), stars: L.makeStars(rng, 40, ctx.w, ctx.h * 0.5), snow: L.makeSnow(rng, 90, ctx.w, ctx.h) };
    },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p;
      sky(ctx, p, 80, 0x1a1848, 0x7a4a8c);
      L.drawStars(fb, st.stars, t, 0xd8d8ff);
      p.circ(30, 18, 9, 0xf4eed0); p.circ(34, 16, 8, 0x28265a); // crescent moon
      p.hills(66, 5, 0.035, 0.09, 1, 0x8a7ab8, 100, t * 0.02);
      p.hills(74, 4, 0.05, 0.11, 3, 0xb4aad8, 100, -t * 0.03);
      for (var i = 0; i < 6; i++) { var tx = 128 + i * 11 + (i % 2) * 3, th = 14 + (i * 7) % 8; p.tri(tx, 70 - th + 8, 5, th, 0x1c4a3c); p.tri(tx, 70 - th + 8, 5, 3, 0xe8f0ff); p.rect(tx, 78, 1, 3, 0x3a2a20); }
      p.rect(0, 80, 192, 20, 0xb4c2e4);
      for (i = 0; i < 40; i++) p.px((i * 53) % 192, 82 + (i * 29) % 18, (Math.floor(t * 2) + i) % 5 ? 0x9cadd4 : 0xe8f0ff);
      p.ell(96, 90, 70, 6, 0xc8d4f0);
      // snowman
      p.ell(96, 90, 17, 3, 0xb4c4e8);
      ball(p, 96, 74, 15); ball(p, 96, 53, 11); ball(p, 96, 37, 8);
      for (i = 0; i < 3; i++) p.circ(96, 49 + i * 7, 1, 0x1a1a22);
      p.circ(93, 35, 1, 0x1a1a22); p.circ(99, 35, 1, 0x1a1a22);
      for (i = 0; i < 6; i++) p.rect(96 + i, 38 + (i > 3 ? 0 : 0), 1, 1, i < 4 ? 0xff8a1a : 0xe06a10);
      for (i = -2; i <= 2; i++) p.px(96 + i, 42 + (Math.abs(i) > 1 ? -1 : 0), 0x1a1a22);
      // hat
      p.rect(86, 29, 20, 2, 0x16161c); p.rect(89, 18, 14, 11, 0x1a1a22); p.rect(89, 26, 14, 2, 0xc02828);
      // scarf and its waving tail
      p.rect(87, 44, 20, 3, 0xd03030); for (i = 0; i < 20; i += 4) p.rect(88 + i, 44, 2, 3, 0xffffff);
      for (i = 0; i < 12; i++) { var sw = Math.sin(t * 3 + i * 0.5) * (1 + i * 0.15); p.rect(104 + i + sw * 0.3, 46 + i * 0.6 + sw * 0.4, 2, 2, i % 4 < 2 ? 0xd03030 : 0xffffff); }
      // arms (waving right)
      var wave = Math.sin(t * 1.8) * 4;
      p.line(86, 52, 66, 44, 0x5a3a20); p.line(66, 44, 62, 40, 0x5a3a20); p.line(66, 44, 61, 45, 0x5a3a20);
      p.line(106, 52, 126, 42 + wave, 0x5a3a20); p.line(126, 42 + wave, 131, 37 + wave, 0x5a3a20); p.line(126, 42 + wave, 132, 43 + wave, 0x5a3a20);
      // little robin on the left arm
      var hop = (Math.floor(t * 1.5) % 6 === 0) ? -1 : 0, bx = 64, by = 38 + hop;
      p.ell(bx, by + 2, 3, 2, 0x7a5a3a); p.circ(bx - 2, by, 1, 0x7a5a3a); p.px(bx - 3, by + 1, 0xe05a2a); p.px(bx - 2, by + 2, 0xe05a2a); p.px(bx - 4, by, 0xffb02a); p.px(bx - 2, by - 1, 0x101010);
      p.line(bx + 3, by + 2, bx + 6, by + (Math.sin(t * 4) > 0.8 ? 0 : 1), 0x5a4228);
      L.drawSnow(fb, st.snow, t, 1.5);
      L.greet(ctx, p, 'Felices Fiestas', t, 1.5, 4, 0xffd0d8);
    }
  });

  // ---- 3. Santa and the sleigh over the rooftops -----------------------------------------------------------
  function reindeer(p, x, y, t, ph, nose) {
    var s = Math.sin(t * 7 + ph), c = 0x8a5a30;
    p.rect(x, y, 9, 3, c); p.rect(x + 1, y + 3, 7, 1, 0xd8c0a0);
    p.rect(x + 8, y - 3, 3, 3, c); p.rect(x + 10, y - 1, 2, 2, 0xa07040);
    p.px(x + 9, y - 2, 0x101010);
    p.line(x + 9, y - 4, x + 8, y - 7, 0x5a3a20); p.line(x + 10, y - 4, x + 11, y - 7, 0x5a3a20); p.line(x + 8, y - 6, x + 6, y - 7, 0x5a3a20);
    p.line(x + 1, y + 3, x + 1 + s * 2.2, y + 7, 0x5a3a20); p.line(x + 3, y + 3, x + 3 - s * 2.2, y + 7, 0x5a3a20);
    p.line(x + 6, y + 3, x + 6 + s * 2.2, y + 7, 0x5a3a20); p.line(x + 8, y + 3, x + 8 - s * 2.2, y + 7, 0x5a3a20);
    p.px(x - 1, y, 0xf0f0f0);
    if (nose) { p.px(x + 12, y, 0xff2a2a); p.px(x + 12, y + 1, 0xff4a4a); p.glow(x + 12, y, 5, 0xff3030, 0.5 + 0.3 * Math.sin(t * 6)); }
  }
  L.register({
    id: 'santa', name: 'Papá Noel sobre los tejados',
    make: function (ctx, rng) {
      var houses = [], x = -4, i;
      for (i = 0; i < 9; i++) { var w = 18 + Math.floor(rng() * 12), h = 12 + Math.floor(rng() * 12); houses.push({ x: x, w: w, h: h, ch: 3 + Math.floor(rng() * (w - 8)), lit: rng() < 0.7, smoke: rng() < 0.5, ph: rng() * 6 }); x += w + 2; }
      return { p: new Pen(ctx.fb), houses: houses, stars: L.makeStars(rng, 70, ctx.w, ctx.h * 0.6), snow: L.makeSnow(rng, 70, ctx.w, ctx.h) };
    },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i;
      sky(ctx, p, 82, 0x040820, 0x1e4468);
      L.drawStars(fb, st.stars, t, 0xe8eaff, 0.15);
      p.glow(150, 24, 26, 0x6a8ac8, 0.28); p.circ(150, 24, 12, 0xf4f0d8); p.circ(146, 21, 2, 0xd8d4bc); p.circ(154, 28, 3, 0xe0dcc4); p.circ(153, 19, 1, 0xd8d4bc);
      // shooting star every 11 s
      var ss = (t % 11) / 1.2;
      if (ss < 1) { p.line(40 - ss * 30, 10 + ss * 12, 52 - ss * 30, 7 + ss * 12 - 3, 0xffffff); p.px(40 - ss * 30, 10 + ss * 12, 0xffffd0); }
      // rooftops
      for (i = 0; i < st.houses.length; i++) {
        var h = st.houses[i], by = 100, top = by - h.h;
        p.rect(h.x, top, h.w, h.h + 2, 0x101a34);
        for (var r = 0; r < 8; r++) p.rect(h.x - 1 + r, top - 1 - r, h.w + 2 - r * 2, 1, 0x182244);
        for (r = 0; r < 4; r++) p.rect(h.x + r, top - 1 - r, h.w - r * 2, 1, 0xdde8ff);
        p.rect(h.x + h.ch, top - 12, 4, 7, 0x2a1a22); p.rect(h.x + h.ch - 1, top - 13, 6, 2, 0xdde8ff);
        if (h.smoke) L.drawSmoke(p, h.x + h.ch + 2, top - 14, t + h.ph, 0xaab4c8, 5);
        var wl = h.lit ? FB.scaleColor(0xffc860, 0.85 + 0.15 * Math.sin(t * 2 + h.ph)) : 0x1a2444;
        p.rect(h.x + 4, top + 5, 4, 5, wl); p.rect(h.x + h.w - 8, top + 5, 4, 5, h.lit ? wl : 0x1a2444);
        if (h.lit) p.glow(h.x + 6, top + 8, 6, 0xffb040, 0.2);
      }
      // sleigh flight: every 18 s a pass of ~13 s
      var cyc = (t % 18) - 2;
      if (cyc > 0 && cyc < 13) {
        var q = cyc / 13, sx = -70 + q * 270, sy = 30 + Math.sin(q * 6.28) * 4 - q * 8;
        for (i = 0; i < 3; i++) { var rx = sx + 40 + i * 14; reindeer(p, rx, sy + 2 + (i % 2) * 1 - Math.sin(t * 7 + i) * 1, t, i * 1.3, i === 2); p.line(rx - 3, sy + 3, rx - 12, sy + 6, 0xc8a040); }
        // sleigh
        p.rect(sx, sy + 4, 22, 5, 0xc02828); p.rect(sx, sy + 3, 22, 1, 0xe8c040); p.line(sx - 2, sy + 12, sx + 24, sy + 12, 0xe8c040); p.line(sx + 2, sy + 9, sx + 2, sy + 12, 0xe8c040); p.line(sx + 20, sy + 9, sx + 20, sy + 12, 0xe8c040);
        p.line(sx + 24, sy + 12, sx + 27, sy + 9, 0xe8c040);
        p.circ(sx + 7, sy + 1, 4, 0x6a4a2a); p.rect(sx + 3, sy - 1, 3, 3, 0x28a050); p.rect(sx + 7, sy - 2, 3, 3, 0x2a58c8);
        p.rect(sx + 13, sy - 2, 5, 6, 0xd02020); p.circ(sx + 15, sy - 4, 2, 0xf0c8a0); p.rect(sx + 13, sy - 7, 5, 3, 0xd02020); p.px(sx + 18, sy - 6, 0xffffff); p.rect(sx + 14, sy - 3, 3, 2, 0xffffff);
        for (i = 0; i < 12; i++) { var k = (t * 5 + i * 0.37) % 1; p.px(sx - 3 - k * 26 + Math.sin(i) * 2, sy + 8 + Math.sin(i * 2 + t * 3) * 3 + k * 5, FB.mix(0xfff0a0, 0x203050, k)); }
      }
      L.drawSnow(fb, st.snow, t, 1);
    }
  });

  // ---- 4. Fireplace with stockings, a sleeping cat and a clock --------------------------------------------------
  var STOCK = [0xd02828, 0x28a050, 0xe8c040, 0x3a78d8];
  L.register({
    id: 'chimenea', name: 'Chimenea con medias',
    make: function (ctx) {
      return { p: new Pen(ctx.fb), heat: new Uint8Array(30 * 18), pal: E.widgets.fireplace.firePalette(), acc: 0, last: 0, fl: 0.8 };
    },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x, y, dt = Math.min(0.1, t - st.last); st.last = t; st.acc += dt;
      var rng = ctx.rng, FP = E.widgets.fireplace;
      while (st.acc >= 1 / 20) { st.acc -= 1 / 20; st.fl = 0.7 + 0.3 * rng(); FP.fireStep(st.heat, 30, 18, rng, 18 + 10 * (1 - st.fl), 0.8 * st.fl + 0.2); }
      fb.clear(0x24160e);
      p.rect(-20, 0, 232, 82, 0x3c2418);
      for (x = -20; x < 212; x += 8) p.rect(x, 0, 1, 82, 0x2e1a10);
      p.rect(-20, 82, 232, 18, 0x4a2c18); for (y = 82; y < 100; y += 5) p.rect(-20, y, 232, 1, 0x38200e);
      // clock on the wall
      p.circ(96, 15, 9, 0x6a4a28); p.circ(96, 15, 8, 0xf0e8d0);
      for (i = 0; i < 12; i++) { var a = i * 0.5236; p.px(96 + Math.sin(a) * 7, 15 - Math.cos(a) * 7, 0x3a2a1a); }
      var d = ctx.date(), mm = d.getMinutes() + d.getSeconds() / 60, hh = (d.getHours() % 12) + mm / 60;
      p.line(96, 15, 96 + Math.sin(mm * 0.1047) * 6, 15 - Math.cos(mm * 0.1047) * 6, 0x3a2a1a);
      p.line(96, 15, 96 + Math.sin(hh * 0.5236) * 4, 15 - Math.cos(hh * 0.5236) * 4, 0x20140a);
      p.px(96, 15, 0xc02828);
      // brick surround
      for (y = 30; y < 86; y++) for (x = 56; x < 136; x++) {
        if (x >= 68 && x < 124 && y >= 46) continue;
        var row = Math.floor((y - 30) / 4), off = (row & 1) * 5, mortar = ((y - 30) % 4 === 3) || ((x - 56 + off) % 10 === 9);
        p.px(x, y, mortar ? 0x2a2420 : FB.scaleColor([0x8a3a28, 0x9a4630, 0x7a3222][(((x - 56 + off) / 10 | 0) + row) % 3], 0.8 + 0.3 * st.fl));
      }
      p.rect(48, 26, 96, 5, 0x5a3a20); p.rect(48, 26, 96, 1, 0x8a5a30);
      p.rect(66, 44, 60, 3, 0x14100c);
      // fire
      p.rect(68, 47, 56, 36, 0x0a0604);
      for (y = 0; y < 18; y++) for (x = 0; x < 30; x++) { var hv = st.heat[y * 30 + x]; if (hv > 5) { var c = st.pal[hv], ax = 68 + x * 2 - 2, ay = 47 + y * 2; p.rect(ax + 2, ay, 2, 2, c); } }
      p.rect(72, 77, 48, 5, 0x3a2312); p.rect(78, 73, 36, 5, 0x2e1c0e); p.circ(73, 80, 2, 0x8a5a30); p.circ(119, 80, 2, 0x8a5a30);
      p.glow(96, 70, 30, 0xff8a30, 0.18 * st.fl);
      // garland with blinking lights on the mantel
      for (x = 50; x < 142; x += 2) p.px(x, 28 + Math.round(2 * Math.sin(x * 0.35)), 0x1f7a3a);
      for (i = 0; i < 11; i++) { var lx = 52 + i * 8, on = (Math.floor(t * 2) + i) % 3; p.px(lx, 30 + Math.round(2 * Math.sin(lx * 0.35)), on ? [0xff4040, 0xffd040, 0x40a0ff][i % 3] : 0x402020); }
      // stockings
      for (i = 0; i < 4; i++) {
        var sx = 58 + i * 21, sw = Math.sin(t * 1.3 + i) * 0.8, col = STOCK[i];
        p.rect(sx - 4, 32, 8, 3, 0xf0f0f0); p.rect(sx - 3 + sw * 0.2, 35, 6, 9, col); p.rect(sx - 3 + sw * 0.5, 44, 9, 4, col); p.rect(sx - 3, 38, 6, 1, 0xf0f0f0);
        p.px(sx + 4, 47, 0xf0f0f0);
      }
      // gifts, rug and cat
      p.ell(100, 95, 46, 5, 0x7a1a22); p.ell(100, 95, 40, 3, 0x9a2a30);
      p.rect(26, 82, 13, 10, 0xd02828); p.rect(31, 82, 3, 10, 0xe8c040); p.rect(26, 86, 13, 2, 0xe8c040); p.rect(30, 80, 5, 2, 0xe8c040);
      p.rect(40, 86, 10, 7, 0x2a58c8); p.rect(44, 86, 2, 7, 0xffffff);
      p.rect(14, 87, 10, 6, 0x28a050); p.rect(18, 87, 2, 6, 0xff7a7a);
      var br = Math.sin(t * 1.6) * 0.6;
      p.ell(152, 92, 11, 5 + br, 0xe08a3a); p.ell(152, 93, 8, 3, 0xf0d8b0); p.circ(142, 90, 4, 0xe08a3a); p.px(141, 86, 0xe08a3a); p.px(143, 86, 0xe08a3a); p.px(141, 90, 0x3a2418); p.px(143, 90, 0x3a2418);
      for (i = -4; i <= 4; i += 4) p.rect(152 + i, 87 + (i === 0 ? 0 : 1), 1, 3, 0xb86a22);
      p.ell(164, 91, 4, 2, 0xe08a3a); p.line(164, 93, 160, 96 + Math.sin(t) , 0xe08a3a);
      if ((t % 4) > 3.6) p.px(150, 83 - ((t % 4) - 3.6) * 8, 0xffffff);
    }
  });

  // ---- 5. Nativity -----------------------------------------------------------------------------------------------
  L.register({
    id: 'belen', name: 'Belén',
    make: function (ctx, rng) {
      return { p: new Pen(ctx.fb), stars: L.makeStars(rng, 80, ctx.w, ctx.h * 0.6), sheep: [[150, 82], [160, 85], [172, 83]] };
    },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x;
      sky(ctx, p, 85, 0x040828, 0x3a3a78);
      L.drawStars(fb, st.stars, t, 0xe0e0ff, 0.2);
      // star of Bethlehem and its beam
      var pulse = 0.8 + 0.2 * Math.sin(t * 2.2);
      p.glow(96, 14, 22, 0xffe890, 0.35 * pulse);
      for (i = 1; i < 24; i++) { p.px(96 - i, 14, FB.scaleColor(0xffe890, (1 - i / 24) * pulse)); p.px(96 + i, 14, FB.scaleColor(0xffe890, (1 - i / 24) * pulse)); }
      for (i = 1; i < 18; i++) { p.px(96, 14 - i, FB.scaleColor(0xffe890, (1 - i / 18) * pulse)); p.px(96, 14 + i, FB.scaleColor(0xffe890, (1 - i / 18) * pulse)); }
      p.circ(96, 14, 3, 0xfff4c0); p.circ(96, 14, 1, 0xffffff);
      for (i = 0; i < 40; i++) { var by = 18 + i * 1.4, half = i * 0.45; p.blend(96 - half, by, 0xffe890, 0.05); p.blend(96 + half, by, 0xffe890, 0.05); p.rect(96 - half, by, half * 2, 1, FB.mix(0x10186a, 0xffe890, 0.04)); }
      // hills and palms
      p.hills(70, 6, 0.03, 0.08, 2, 0x1a1a3c, 100, 0);
      p.hills(80, 4, 0.05, 0.1, 5, 0x2a2438, 100, 0);
      for (x = 8; x < 40; x += 14) { p.line(x, 76, x + 1, 62, 0x1a1420); for (i = 0; i < 5; i++) p.line(x + 1, 62, x + 1 + (i - 2) * 4, 62 + Math.abs(i - 2) * 2 + 2 + Math.sin(t + x + i) * 0.5, 0x143a24); }
      // stable
      p.rect(64, 56, 4, 32, 0x4a3018); p.rect(124, 56, 4, 32, 0x4a3018);
      p.rect(68, 60, 56, 28, 0x20122a);
      p.glow(96, 76, 24, 0xffb040, 0.5 + 0.1 * Math.sin(t * 5)); p.rect(68, 60, 56, 28, 0x5a3a20); p.glow(96, 78, 26, 0xffc860, 0.55);
      for (i = 0; i < 14; i++) p.rect(60 + i, 58 - i, 72 - i * 2, 1, i % 3 ? 0xb8923a : 0x9a7a2c);
      p.rect(68, 59, 56, 2, 0x6a4a20);
      p.rect(64, 87, 64, 3, 0x6a4a20);
      // manger and baby
      p.rect(90, 80, 12, 4, 0x6a4020); p.rect(89, 84, 14, 1, 0x3a2410); p.rect(91, 78, 10, 3, 0xe8d090);
      p.ell(96, 78, 3, 2, 0xfff4e0); p.glow(96, 78, 9, 0xfff0b0, 0.55 + 0.1 * Math.sin(t * 3));
      // Mary and Joseph
      p.ell(82, 80, 5, 7, 0x2a58c8); p.circ(82, 71, 3, 0xf0c8a0); p.ell(82, 71, 4, 4, 0xe8e8f4); p.circ(82, 72, 2, 0xf0c8a0);
      p.ell(110, 80, 5, 7, 0x8a5a30); p.circ(110, 71, 3, 0xf0c8a0); p.rect(107, 68, 7, 2, 0x4a3018); p.line(116, 66, 116, 86, 0x5a3a20);
      // ox and donkey
      p.ell(74, 84, 5, 3, 0x7a6a5a); p.rect(70, 85, 1, 4, 0x5a4a3a); p.rect(78, 85, 1, 4, 0x5a4a3a); p.circ(69, 82, 2, 0x7a6a5a);
      p.ell(120, 84, 5, 3, 0x8a7a6a); p.rect(117, 85, 1, 4, 0x5a4a3a); p.rect(123, 85, 1, 4, 0x5a4a3a); p.circ(125, 81, 2, 0x8a7a6a); p.px(125, 79, 0x8a7a6a); p.px(126, 79, 0x8a7a6a);
      // angel
      var ay = 34 + Math.sin(t * 1.2) * 2;
      p.glow(48, ay, 12, 0xfff0c0, 0.35); p.ell(48, ay + 5, 3, 5, 0xf8f8ff); p.circ(48, ay, 2, 0xf0d0b0); p.ell(43, ay + 3, 4, 2 + Math.sin(t * 4) * 1, 0xe8ecff); p.ell(53, ay + 3, 4, 2 + Math.sin(t * 4) * 1, 0xe8ecff);
      // shepherds, sheep and a campfire
      for (i = 0; i < 3; i++) { var sx = st.sheep[i][0], sy = st.sheep[i][1]; p.ell(sx, sy, 4, 3, 0xf0f0e8); p.circ(sx + 4, sy, 2, 0x2a2a2a); p.rect(sx - 2, sy + 3, 1, 2, 0x2a2a2a); p.rect(sx + 2, sy + 3, 1, 2, 0x2a2a2a); }
      p.rect(142, 76, 4, 10, 0x6a3a2a); p.circ(144, 73, 2, 0xf0c8a0); p.rect(141, 71, 6, 2, 0xc8a050); p.line(149, 72, 149, 88, 0x5a3a20);
      p.rect(178, 86, 5, 1, 0x3a2a1a);
      var fl = Math.sin(t * 9) * 1;
      p.glow(181, 84, 10, 0xff8a30, 0.35); p.tri(181, 80 - fl, 2, 5 + fl, 0xff8a20); p.tri(181, 82, 1, 3, 0xffe060);
    }
  });
})(typeof window !== 'undefined' ? window : global);
