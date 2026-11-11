/* Christmas gallery, scenes 6-10: Three Kings, snowy village, gingerbread house, snow globe, advent wreath. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  var L = E.navidadLib, FB = E.fb, Pen = L.Pen;
  function sky(ctx, p, y1, top, bot) { ctx.fb.vgradient(0, p.oy + y1, top, bot); }

  // ---- 6. The Three Kings following the star across the desert ----------------------------------------------------
  function camel(p, x, y, t, ph, robe, crown) {
    var bob = Math.sin(t * 4 + ph) * 0.8, by = y + bob, i;
    for (i = 0; i < 4; i++) { var lx = x - 7 + i * 4.5, sw = Math.sin(t * 4 + ph + i * 1.6) * 2.4; p.line(lx, by - 6, lx + sw, y + 2, 0x3a2010); p.px(lx + sw, y + 2, 0x1a1008); }
    p.ell(x, by - 9, 10, 4, 0x5a3418); p.ell(x - 2, by - 13, 3, 3, 0x6a4020); p.ell(x - 5, by - 8, 4, 2, 0x7a4a26);
    p.line(x + 8, by - 11, x + 12, by - 18, 0x5a3418); p.line(x + 9, by - 11, x + 13, by - 18, 0x5a3418);
    p.ell(x + 15, by - 18, 3, 2, 0x6a4020); p.px(x + 16, by - 19, 0xffe0a0); p.line(x - 10, by - 9, x - 12, by - 4 + Math.sin(t * 3 + ph) * 2, 0x3a2010);
    p.rect(x - 4, by - 14, 9, 3, robe === 0xc02828 ? 0xe8c040 : 0xb8302a); // saddle blanket
    // king
    p.rect(x - 2, by - 22, 5, 8, robe); p.rect(x - 2, by - 22, 5, 1, 0xf0e0b0);
    p.circ(x, by - 25, 2, 0xe0b890); p.rect(x - 2, by - 29, 5, 2, crown); p.px(x - 2, by - 30, crown); p.px(x, by - 30, crown); p.px(x + 2, by - 30, crown);
    p.rect(x + 3, by - 20, 4, 4, 0xf0c840); p.rect(x + 4, by - 20, 1, 4, 0xc02828); p.px(x + 5, by - 21, 0xffe890);
    for (i = 0; i < 6; i++) p.px(x - 3 - i, by - 20 + Math.sin(t * 3 + i * 0.7 + ph) * 1, FB.scaleColor(robe, 1 - i * 0.1));
  }
  L.register({
    id: 'reyes', name: 'Reyes Magos',
    make: function (ctx, rng) { return { p: new Pen(ctx.fb), stars: L.makeStars(rng, 70, ctx.w, ctx.h * 0.55) }; },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x;
      sky(ctx, p, 78, 0x070730, 0xd0703a);
      L.drawStars(fb, st.stars, t, 0xf0e8ff, 0.2);
      // the star with a comet tail
      var pulse = 0.85 + 0.15 * Math.sin(t * 2);
      p.glow(150, 34, 20, 0xfff0a0, 0.4 * pulse);
      for (i = 1; i < 46; i++) p.blend(150 - i * 0.9, 34 + i * 0.35 + Math.sin(i * 0.4 + t * 2) * 0.6, 0xffe890, 0.5 * (1 - i / 46) * pulse);
      for (i = 1; i < 14; i++) { var rc = FB.scaleColor(0xfff0a0, (1 - i / 14) * pulse); p.px(150 - i, 34, rc); p.px(150 + i, 34, rc); p.px(150, 34 - i, rc); p.px(150, 34 + i, rc); }
      p.circ(150, 34, 3, 0xfffbe0); p.circ(150, 34, 1, 0xffffff);
      // dunes (parallax), palms
      p.hills(66, 5, 0.03, 0.07, 1, 0x7a3a48, 100, t * 0.02);
      p.hills(76, 4, 0.04, 0.09, 4, 0x96503c, 100, -t * 0.035);
      for (x = 162; x < 186; x += 12) { p.line(x, 80, x + 1, 62, 0x2a1a18); for (i = 0; i < 6; i++) p.line(x + 1, 62, x + 1 + (i - 2.5) * 4.5, 62 + Math.abs(i - 2.5) * 2 + 3 + Math.sin(t * 1.2 + x + i) * 0.7, 0x1c3a20); }
      p.hills(88, 3, 0.05, 0.12, 2.5, 0xc08040, 100, t * 0.06);
      for (i = 0; i < 36; i++) p.px((i * 47 + Math.floor(t * 3)) % 192, 90 + (i * 13) % 10, (i + Math.floor(t * 4)) % 6 ? 0xd89850 : 0xffe0a0);
      // caravan walking right
      var cols = [[0xc02828, 0xf0c840], [0x2a58c8, 0xe0e0f0], [0x28a050, 0xe8a030]];
      for (i = 0; i < 3; i++) { var cx = ((t * 5.5 + 180 - i * 38) % 330) - 60; camel(p, cx, 86 + i * 1, t, i * 1.1, cols[i][0], cols[i][1]); }
      L.greet(ctx, p, 'Feliz Día de Reyes', t, 2, 3, 0xffd890);
    }
  });

  // ---- 7. Snowy village at night -------------------------------------------------------------------------------------
  var HOUSES = [[4, 24, 17, 0x7a4a3a, 0x3a2a3a], [30, 22, 21, 0x5a6a8a, 0x2a2a3a], [108, 26, 19, 0x8a5a3a, 0x3a2a2a], [138, 22, 23, 0x6a5a7a, 0x2e2a3a], [164, 26, 17, 0x7a5a4a, 0x3a2a2a]];
  function house(p, h, t, i) {
    var x = h[0], w = h[1], hh = h[2], by = 86, top = by - hh, rh = Math.round(w / 2.2);
    p.rect(x, top, w, hh, h[3]);
    p.tri(x + w / 2, top - rh, w / 2 + 2, rh, 0xe8f0ff); p.tri(x + w / 2, top - rh + 3, w / 2 - 1, rh - 3, h[4]);
    p.rect(x + w - 7, top - rh - 2, 4, 7, 0x4a2a2a); p.rect(x + w - 8, top - rh - 3, 6, 2, 0xe8f0ff);
    L.drawSmoke(p, x + w - 5, top - rh - 5, t + i * 1.7, 0xb0bad0, 5);
    var f = 0.85 + 0.15 * Math.sin(t * 2.5 + i * 2);
    p.rect(x + 3, top + 4, 5, 5, FB.scaleColor(0xffc860, f)); p.rect(x + w - 8, top + 4, 5, 5, FB.scaleColor(0xffb850, f));
    p.glow(x + 5, top + 7, 8, 0xffb040, 0.22); p.rect(x + w / 2 - 2, by - 8, 4, 8, 0x3a1c14);
  }
  L.register({
    id: 'pueblo', name: 'Pueblo nevado',
    make: function (ctx, rng) { return { p: new Pen(ctx.fb), stars: L.makeStars(rng, 60, ctx.w, ctx.h * 0.5), snow: L.makeSnow(rng, 100, ctx.w, ctx.h) }; },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x;
      sky(ctx, p, 80, 0x06102a, 0x28487a);
      L.drawStars(fb, st.stars, t, 0xe0e8ff, 0.2);
      p.glow(18, 26, 16, 0x7a9ad0, 0.25); p.circ(18, 26, 7, 0xf2eed8); p.circ(21, 24, 6, 0xdad6c0);
      for (i = 0; i < 5; i++) { var mx = 10 + i * 42, mh = 26 + (i * 11) % 14; p.tri(mx, 78 - mh, mh * 0.9, mh, 0x2e3e6c); p.tri(mx, 78 - mh, mh * 0.35, mh * 0.34, 0xdbe6ff); }
      for (x = 0; x < 200; x += 5) { var th = 8 + (x * 7) % 7; p.tri(x, 80 - th, 3, th, 0x0e2a2e); p.tri(x, 80 - th, 3, 2, 0xc8d6ee); }
      p.rect(-10, 80, 212, 20, 0xa6b4dc); p.hills(80, 2, 0.06, 0.13, 1, 0xb8c4e8, 84, 0);
      p.rect(-10, 87, 212, 7, 0xc6d0ee); for (x = 0; x < 192; x += 4) p.px(x, 90 + (x % 3), 0xdfe6f8);
      // church
      p.rect(66, 58, 32, 28, 0x7a6a7a); p.tri(82, 44, 19, 15, 0xe8f0ff); p.tri(82, 47, 16, 12, 0x3a2a3a);
      p.rect(78, 28, 8, 26, 0x6a5a6a); p.tri(82, 14, 6, 14, 0xe8f0ff); p.tri(82, 16, 4, 11, 0x3a2a3a);
      p.rect(82, 7, 1, 7, 0xe8c040); p.rect(80, 9, 5, 1, 0xe8c040);
      var gl = 0.85 + 0.15 * Math.sin(t * 2);
      p.rect(78, 62, 8, 12, FB.scaleColor(0xffc860, gl)); p.circ(82, 62, 4, FB.scaleColor(0xffc860, gl)); p.rect(81, 62, 2, 12, 0x6a4a2a);
      p.glow(82, 68, 16, 0xffb040, 0.25); p.circ(82, 36, 3, 0xf0e8c8); p.px(82, 36, 0x3a2a1a); p.rect(77, 76, 10, 10, 0x4a2a1a);
      var bell = Math.sin(t * 2) * 1.5; p.rect(80 + bell, 41, 4, 4, 0xe8c040);
      for (i = 0; i < HOUSES.length; i++) house(p, HOUSES[i], t, i);
      // street lamp
      p.rect(124, 66, 2, 22, 0x2a2a3a); p.rect(122, 64, 6, 3, 0x2a2a3a); p.glow(125, 68, 14, 0xffd070, 0.35 + 0.05 * Math.sin(t * 3)); p.circ(125, 66, 2, 0xfff0b0);
      // people walking the street
      var crowd = [[0, 0xc02828, 0xe8c040, 8], [60, 0x2a58c8, 0xf0f0f0, -7], [110, 0x28a050, 0xd03030, 6]];
      for (i = 0; i < 3; i++) {
        var px = (((crowd[i][0] + t * crowd[i][3]) % 220) + 220) % 220 - 14, py = 88 + (i % 2) * 3, leg = Math.sin(t * 5 + i) * 1.2;
        p.rect(px - 1, py - 8, 3, 6, crowd[i][1]); p.circ(px, py - 10, 1, 0xe8c0a0); p.rect(px - 1, py - 12, 3, 1, crowd[i][2]);
        p.px(px - 1 + leg, py - 2, 0x2a2a30); p.px(px + 1 - leg, py - 2, 0x2a2a30); p.px(px - 1 + leg, py - 1, 0x2a2a30); p.px(px + 1 - leg, py - 1, 0x2a2a30);
        if (i === 1) { p.px(px + 3, py - 6, 0xffd060); p.glow(px + 3, py - 6, 4, 0xffc040, 0.5); }
      }
      L.drawSnow(fb, st.snow, t, -1.2);
      L.greet(ctx, p, 'Feliz Navidad', t, 2, 3, 0xffe8c0);
    }
  });

  // ---- 8. Gingerbread house ----------------------------------------------------------------------------------------
  var CANDY = [0xff4060, 0x40d060, 0xffd030, 0x40a0ff, 0xff80d0];
  function cane(p, x, y, h) {
    for (var i = 0; i < h; i++) p.rect(x, y + i, 2, 1, (i >> 1) % 2 ? 0xffffff : 0xe02030);
    p.rect(x + 1, y - 1, 3, 1, 0xe02030); p.rect(x + 3, y, 1, 2, 0xffffff);
  }
  L.register({
    id: 'jengibre', name: 'Casa de jengibre',
    make: function (ctx, rng) { return { p: new Pen(ctx.fb), snow: L.makeSnow(rng, 70, ctx.w, ctx.h), bokeh: L.makeStars(rng, 14, 192, 60) }; },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x, y;
      sky(ctx, p, 80, 0x2a1850, 0x8a4a8a);
      for (i = 0; i < st.bokeh.length; i += 3) { var bk = 0.5 + 0.5 * Math.sin(t * 0.8 + st.bokeh[i + 2]); p.glow(st.bokeh[i], st.bokeh[i + 1] + 4, 6 + (i % 3), CANDY[(i / 3) % 5 | 0], 0.18 + 0.14 * bk); }
      p.rect(-10, 78, 212, 22, 0xc4b8de); p.hills(78, 3, 0.05, 0.12, 2, 0xd4c8ea, 84, 0);
      for (x = 0; x < 192; x += 6) p.px(x + (x % 5), 86 + (x % 7), 0xe8def8);
      // house body
      p.rect(58, 52, 76, 36, 0xa8642c); for (y = 54; y < 88; y += 6) for (x = 60; x < 132; x += 8) p.px(x + (y % 12 ? 4 : 0), y, 0xc88444);
      p.rect(58, 52, 76, 2, 0xffffff); p.rect(58, 86, 76, 2, 0xffffff);
      for (x = 58; x < 134; x += 5) p.px(x, 88 + (x % 10 ? 0 : 1), 0xffffff);
      // roof with candy
      for (i = 0; i < 24; i++) { p.rect(54 + i, 52 - i, 84 - i * 2, 1, i < 3 ? 0xffffff : 0xf4eef8); }
      for (i = 3; i < 22; i++) p.rect(55 + i, 52 - i, 82 - i * 2, 1, (i % 4 < 2) ? 0xe8dcf0 : 0xf4eef8);
      for (i = 0; i < 14; i++) { var cx = 70 + (i % 7) * 9 + (i > 6 ? 4 : 0), cy = 48 - Math.floor(i / 7) * 10 - 2 - (i % 7 > 3 ? 3 - (i % 7 - 3) : (i % 7)) * 0; p.circ(cx, cy, 2, CANDY[i % 5]); p.px(cx - 1, cy - 1, 0xffffff); }
      p.rect(112, 18, 8, 14, 0x8a4a22); p.rect(111, 17, 10, 3, 0xffffff);
      for (i = 0; i < 5; i++) { var k = (t * 0.25 + i / 5) % 1; p.circ(116 + Math.sin(k * 5 + i) * 2 + k * 6, 14 - k * 18, 2 + Math.floor(k * 2), FB.mix(0xffffff, 0xc8b8e0, k)); }
      // door with candy arch, windows with icing
      p.rect(86, 66, 20, 22, 0x5a2a12); p.circ(96, 66, 10, 0x5a2a12); p.rect(86, 66, 20, 1, 0x5a2a12);
      for (i = -10; i <= 10; i += 2) p.px(96 + i, 66 - Math.round(Math.sqrt(Math.max(0, 100 - i * i))), (i / 2 | 0) % 2 ? 0xffffff : 0xe02030);
      p.circ(102, 78, 1, 0xffd030);
      var wf = 0.85 + 0.15 * Math.sin(t * 3);
      [[64, 62], [112, 62]].forEach(function (w) { p.rect(w[0] - 1, w[1] - 1, 14, 14, 0xffffff); p.rect(w[0], w[1], 12, 12, FB.scaleColor(0xffd060, wf)); p.rect(w[0] + 5, w[1], 2, 12, 0xffffff); p.rect(w[0], w[1] + 5, 12, 2, 0xffffff); p.glow(w[0] + 6, w[1] + 6, 14, 0xffc040, 0.25); });
      // fences and decorations
      for (i = 0; i < 6; i++) { cane(p, 8 + i * 8, 74, 14); cane(p, 146 + i * 8, 74, 14); }
      p.rect(8, 82, 44, 1, 0xffffff); p.rect(146, 82, 44, 1, 0xffffff);
      [[30, 66], [170, 62]].forEach(function (lp, n) { p.line(lp[0], lp[1] + 6, lp[0], 92, 0xf0f0f0); p.circ(lp[0], lp[1], 5, CANDY[n * 2]); p.circ(lp[0], lp[1], 3, 0xffffff); p.circ(lp[0], lp[1], 1, CANDY[n * 2]); });
      p.tri(18, 46, 7, 18, 0x2a9a4a); for (i = 0; i < 6; i++) p.circ(15 + (i * 5) % 9, 54 + i * 2, 1, CANDY[i % 5]); p.rect(18, 64, 2, 4, 0x6a3a1a);
      // gingerbread man waving
      var wv = Math.sin(t * 5) * 2;
      p.circ(158, 76, 3, 0xb06a30); p.rect(155, 79, 7, 7, 0xb06a30); p.line(155, 80, 150, 78 + wv, 0xb06a30); p.line(162, 80, 166, 79 - wv, 0xb06a30); p.rect(155, 86, 3, 3, 0xb06a30); p.rect(159, 86, 3, 3, 0xb06a30);
      p.px(157, 75, 0xffffff); p.px(159, 75, 0xffffff); for (i = 0; i < 3; i++) p.px(158, 81 + i * 2, CANDY[i]); p.px(157, 77, 0xffffff); p.px(158, 78, 0xffffff); p.px(159, 77, 0xffffff);
      L.drawSnow(fb, st.snow, t, 0.8);
    }
  });

  // ---- 9. Snow globe ------------------------------------------------------------------------------------------------
  var GC = { x: 96, y: 44, r: 34 };
  function flakePos(i, s, out) { // stir for 3.6 s, then settle; deterministic in (i, s)
    var a0 = i * 2.399, r0 = 0.15 + ((i * 37) % 100) / 130, STIR = 3.6, ss;
    if (s < STIR) {
      ss = s;
      var ang = a0 + ss * (3.5 - ss * 0.8) * (1 + (i % 3) * 0.25);
      out.x = GC.x + Math.cos(ang) * r0 * GC.r * 0.95; out.y = GC.y - 4 + Math.sin(ang * 1.3) * r0 * GC.r * 0.75;
    } else {
      var ang2 = a0 + STIR * (3.5 - STIR * 0.8) * (1 + (i % 3) * 0.25), bx = GC.x + Math.cos(ang2) * r0 * GC.r * 0.95, by = GC.y - 4 + Math.sin(ang2 * 1.3) * r0 * GC.r * 0.75;
      out.x = bx + Math.sin((s - STIR) * 0.9 + i) * 2; out.y = Math.min(GC.y + 24 - ((i * 13) % 5), by + (s - STIR) * (2 + (i % 4)));
    }
  }
  L.register({
    id: 'globo', name: 'Globo de nieve',
    make: function (ctx, rng) { return { p: new Pen(ctx.fb), bok: L.makeStars(rng, 18, 192, 70), pos: { x: 0, y: 0 } }; },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i, x, y, d;
      sky(ctx, p, 100, 0x1c0e08, 0x3a2010);
      for (i = 0; i < st.bok.length; i += 3) p.circ(st.bok[i], st.bok[i + 1] + 4, 4, FB.mix(0x2a1608, [0xff6a30, 0xffc060, 0xff3050][(i / 3) % 3 | 0], 0.18 + 0.12 * Math.sin(t * 1.2 + st.bok[i + 2])));
      // table
      p.rect(-10, 82, 212, 18, 0x4a2810); for (x = -10; x < 202; x += 14) p.rect(x, 82, 1, 18, 0x38200c); p.rect(-10, 82, 212, 2, 0x7a4820);
      // globe interior
      for (y = -GC.r; y <= GC.r; y++) {
        var half = Math.round(Math.sqrt(GC.r * GC.r - y * y)), k = (y + GC.r) / (2 * GC.r);
        p.rect(GC.x - half, GC.y + y, half * 2 + 1, 1, FB.mix(0x14224a, 0x4a6aa8, k * k));
      }
      for (i = 0; i < 12; i++) { var sx = GC.x - 22 + (i * 11) % 44, sy = GC.y - 24 + (i * 7) % 18; if (Math.floor(t * 2 + i) % 4) p.px(sx, sy, 0xe0e8ff); }
      // tiny village inside
      p.ell(GC.x, GC.y + 26, 30, 8, 0xe8f0ff);
      p.rect(GC.x - 20, GC.y + 12, 12, 10, 0x8a4a3a); p.tri(GC.x - 14, GC.y + 5, 9, 7, 0xf0f4ff); p.rect(GC.x - 17, GC.y + 15, 3, 4, 0xffc860);
      p.rect(GC.x + 6, GC.y + 14, 10, 8, 0x5a6a8a); p.tri(GC.x + 11, GC.y + 8, 8, 6, 0xf0f4ff); p.rect(GC.x + 9, GC.y + 16, 3, 3, 0xffc860);
      p.glow(GC.x - 16, GC.y + 17, 7, 0xffb040, 0.3);
      p.tri(GC.x + 22, GC.y + 6, 5, 16, 0x1c5a3a); p.tri(GC.x - 2, GC.y + 10, 4, 12, 0x1c5a3a); p.tri(GC.x + 22, GC.y + 6, 5, 3, 0xe8f0ff);
      p.circ(GC.x + 1, GC.y + 22, 3, 0xffffff); p.circ(GC.x + 1, GC.y + 18, 2, 0xffffff); p.px(GC.x + 1, GC.y + 18, 0xff8a20);
      // swirling snow, clipped to the glass
      var s = t % 12;
      for (i = 0; i < 70; i++) {
        flakePos(i, s, st.pos);
        var dx = st.pos.x - GC.x, dy = st.pos.y - GC.y;
        if (dx * dx + dy * dy < (GC.r - 2) * (GC.r - 2)) { p.px(st.pos.x, st.pos.y, i % 3 ? 0xffffff : 0xc8d8f8); if (i % 5 === 0) p.px(st.pos.x + 1, st.pos.y, 0xe0eaff); }
      }
      // glass highlights
      for (i = 0; i < 16; i++) { var an = 3.4 + i * 0.07; p.blend(GC.x + Math.cos(an) * (GC.r - 3), GC.y + Math.sin(an) * (GC.r - 3), 0xffffff, 0.7 - i * 0.03); p.blend(GC.x + Math.cos(an) * (GC.r - 4), GC.y + Math.sin(an) * (GC.r - 4), 0xffffff, 0.4 - i * 0.02); }
      for (d = 0; d < 360; d += 3) { var ra = d * 0.01745; p.blend(GC.x + Math.cos(ra) * GC.r, GC.y + Math.sin(ra) * GC.r, 0xaac4ee, 0.55); }
      p.ell(GC.x - 14, GC.y - 20, 4, 2, 0x8aa8d8);
      // base
      p.ell(GC.x, GC.y + GC.r + 1, 26, 4, 0x6a1a1a); p.rect(GC.x - 28, GC.y + GC.r + 1, 56, 12, 0x8a2020); p.rect(GC.x - 28, GC.y + GC.r + 1, 56, 2, 0xe8c040); p.rect(GC.x - 28, GC.y + GC.r + 11, 56, 2, 0xe8c040);
      for (i = 0; i < 6; i++) p.px(GC.x - 20 + i * 8, GC.y + GC.r + 6, 0xe8c040);
      p.ell(GC.x, 96, 36, 3, 0x2a1408);
    }
  });

  // ---- 10. Advent wreath ----------------------------------------------------------------------------------------------
  var WR = { x: 96, y: 56, ro: 34, ri: 20 };
  L.register({
    id: 'corona', name: 'Corona de Adviento',
    make: function (ctx, rng) {
      var nd = [], i;
      for (i = 0; i < 420; i++) { var a = rng() * 6.283, r = WR.ri + 2 + rng() * (WR.ro - WR.ri - 4); nd.push({ a: a, r: r, c: [0x1a6a30, 0x2a8a3c, 0x124a24, 0x3aa04a][i % 4], l: 2 + Math.floor(rng() * 3), ph: rng() * 6 }); }
      var ber = []; for (i = 0; i < 22; i++) ber.push({ a: rng() * 6.283, r: WR.ri + 4 + rng() * (WR.ro - WR.ri - 8) });
      return { p: new Pen(ctx.fb), nd: nd, ber: ber, bok: L.makeStars(rng, 40, 192, 100) };
    },
    draw: function (ctx, st, t) {
      var fb = ctx.fb, p = st.p, i;
      sky(ctx, p, 100, 0x0a1a12, 0x04100a);
      for (i = 0; i < st.bok.length; i += 3) p.blend(st.bok[i], st.bok[i + 1], 0xffd890, 0.15 + 0.15 * Math.sin(t + st.bok[i + 2]));
      var nd = st.nd, n, sw = Math.sin(t * 0.8) * 0.4;
      for (i = 0; i < nd.length; i++) { n = nd[i]; var cx = WR.x + Math.cos(n.a) * n.r, cy = WR.y + Math.sin(n.a) * n.r * 0.92; p.line(cx, cy, cx + Math.cos(n.a + 1.2 + sw * 0.1) * n.l, cy + Math.sin(n.a + 1.2) * n.l, n.c); }
      for (i = 0; i < st.ber.length; i++) { var b = st.ber[i]; p.circ(WR.x + Math.cos(b.a) * b.r, WR.y + Math.sin(b.a) * b.r * 0.92, 1, 0xd02030); p.px(WR.x + Math.cos(b.a) * b.r - 1, WR.y + Math.sin(b.a) * b.r * 0.92 - 1, 0xff8a90); }
      for (i = 0; i < 8; i++) { var ga = i * 0.785 + 0.4; p.circ(WR.x + Math.cos(ga) * 27, WR.y + Math.sin(ga) * 26 * 0.92, 2, 0xe8c040); p.px(WR.x + Math.cos(ga) * 27 - 1, WR.y + Math.sin(ga) * 26 * 0.92 - 1, 0xfff0a0); }
      // ribbon bow at the bottom
      p.rect(WR.x - 14, WR.y + 24, 10, 7, 0xc02030); p.rect(WR.x + 4, WR.y + 24, 10, 7, 0xc02030); p.tri(WR.x - 4, WR.y + 24, 4, 7, 0xa01828); p.rect(WR.x - 3, WR.y + 24, 6, 6, 0xd83040);
      p.line(WR.x - 2, WR.y + 30, WR.x - 8, WR.y + 38, 0xc02030); p.line(WR.x + 2, WR.y + 30, WR.x + 8, WR.y + 38, 0xc02030);
      // four candles with flickering flames
      var cs = [[72, 0x8a4ab8], [86, 0x8a4ab8], [106, 0xe86aa8], [120, 0x8a4ab8]];
      for (i = 0; i < 4; i++) {
        var x = cs[i][0], dx = x - 96, yb = Math.round(WR.y - Math.sqrt(Math.max(1, 27 * 27 - dx * dx)) * 0.92 + 2), hh = 15 - (i === 2 ? 3 : 0);
        p.rect(x - 2, yb - hh, 5, hh, cs[i][1]); p.rect(x - 2, yb - hh, 1, hh, FB.mix(cs[i][1], 0xffffff, 0.35)); p.rect(x + 2, yb - hh, 1, hh, FB.scaleColor(cs[i][1], 0.7));
        p.rect(x, yb - hh, 1, 3, 0xf8f0e8); p.rect(x - 3, yb - 1, 7, 2, 0xe8c040);
        var fl = Math.sin(t * 9 + i * 2) * 0.8 + Math.sin(t * 15 + i) * 0.5, fy = yb - hh - 4;
        p.glow(x, fy, 13, 0xffa030, 0.28 + 0.06 * fl);
        p.ell(x + fl * 0.4, fy, 1 + (fl > 0.4 ? 1 : 0), 3, 0xff9a20); p.ell(x + fl * 0.3, fy + 1, 1, 2, 0xffe060); p.px(x + fl * 0.4, fy + 2, 0xffffff); p.px(x, fy + 3, 0x2a58ff);
      }
    }
  });
})(typeof window !== 'undefined' ? window : global);
