/* Aquarium: pixel fish at three depths, bubbles, swaying seaweed and light rays. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  // b = body, f = fin, e = eye, l = belly. Drawn facing right.
  var SPECIES = [
    ['....bbbb....', '..bbbbbbb..f', '.bbbbbbbbbff', 'bbbbebbbbbf.', '.lllllllllff', '..lllllll..f', '....llll....'],
    ['..bbb...', '.bbbbb.f', 'bbebbbff', '.lllll.f', '..lll...']
  ];
  var COLORS = [[0xff8a2a, 0xffd23c], [0x3ac8ff, 0x2a6aff], [0xff5aa0, 0xffa0d0], [0x7dff6a, 0x2ab84a], [0xffe04a, 0xff8a2a]];
  var WATER_TOP = 0x0c5a8a, WATER_BOT = 0x03203a;

  function spriteWidth(sp) { return SPECIES[sp][0].length; }

  function makeFish(rng, w, h, i) {
    var depth = i % 3, sp = rng() < 0.55 ? 0 : 1;
    var f = { sp: sp, depth: depth, color: COLORS[Math.floor(rng() * COLORS.length)], dir: rng() < 0.5 ? 1 : -1 };
    f.speed = (5 + rng() * 7) * (depth === 2 ? 1.5 : depth === 1 ? 1 : 0.6);
    f.baseY = 10 + rng() * (h - 36);
    f.x = rng() * w; f.y = f.baseY; f.phase = rng() * 6.28;
    return f;
  }

  // Moves a fish; it wraps around the sides (re-rolling its depth line) and bobs gently. Returns the new y.
  function stepFish(f, dt, w, h, rng) {
    var size = spriteWidth(f.sp) * (f.depth === 2 ? 2 : 1);
    f.x += f.dir * f.speed * dt;
    f.phase += dt * 2;
    if (f.dir > 0 && f.x > w + size) { f.x = -size; f.baseY = 10 + rng() * (h - 36); }
    if (f.dir < 0 && f.x < -size) { f.x = w + size; f.baseY = 10 + rng() * (h - 36); }
    f.y = f.baseY + Math.sin(f.phase) * 2;
    return f.y;
  }

  function stepBubble(b, dt, h, rng, w) {
    b.y -= b.speed * dt;
    b.t += dt;
    if (b.y < -2) { b.y = h - 6; b.x = rng() * w; b.speed = 8 + rng() * 14; }
  }

  var widget = {
    id: 'aquarium',
    SPECIES: SPECIES, makeFish: makeFish, stepFish: stepFish, stepBubble: stepBubble,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, i;
      var fish = [], bubbles = [], weeds = [], last = 0;
      for (i = 0; i < 9; i++) fish.push(makeFish(ctx.rng, w, h, i));
      fish.sort(function (a, b) { return a.depth - b.depth; });
      for (i = 0; i < 26; i++) bubbles.push({ x: ctx.rng() * w, y: ctx.rng() * h, speed: 8 + ctx.rng() * 14, t: ctx.rng() * 6 });
      for (i = 0; i < 9; i++) weeds.push({ x: 6 + i * Math.floor((w - 12) / 8), len: 14 + ctx.rand(16), ph: ctx.rng() * 6 });
      var sandY = h - 7;
      await ctx.loop(ctx.cfg.duration, 24, function (t) {
        var dt = Math.min(0.1, t - last); last = t;
        for (i = 0; i < fish.length; i++) stepFish(fish[i], dt, w, h, ctx.rng);
        fb.vgradient(0, h, WATER_TOP, WATER_BOT);
        // light rays
        for (var r = 0; r < 5; r++) {
          var rx = 20 + r * 40 + Math.sin(t * 0.3 + r) * 6;
          for (var y = 0; y < h * 0.75; y += 1) {
            var a = 0.10 * (1 - y / (h * 0.75));
            for (var k = 0; k < 5; k++) fb.blendPixel(rx + y * 0.35 + k, y, 0xbfe8ff, a);
          }
        }
        // far fish first
        for (i = 0; i < fish.length; i++) if (fish[i].depth === 0) drawFish(fish[i]);
        // seaweed
        for (i = 0; i < weeds.length; i++) {
          var wd = weeds[i];
          for (var s = 0; s < wd.len; s++) {
            var sx = wd.x + Math.round(Math.sin(t * 1.4 + s * 0.35 + wd.ph) * (1 + s * 0.12));
            fb.fillRect(sx, sandY - s, 2, 1, FB.mix(0x1a7a3a, 0x4ad86a, s / wd.len));
          }
        }
        for (i = 0; i < fish.length; i++) if (fish[i].depth === 1) drawFish(fish[i]);
        // bubbles
        for (i = 0; i < bubbles.length; i++) {
          var b = bubbles[i];
          stepBubble(b, dt, h, ctx.rng, w);
          var bx = b.x + Math.sin(b.t * 3) * 1.2;
          fb.setPixel(bx, b.y, 0xcfeaff); if (i % 3 === 0) { fb.setPixel(bx + 1, b.y, 0x7fb8e0); fb.setPixel(bx, b.y + 1, 0x7fb8e0); }
        }
        for (i = 0; i < fish.length; i++) if (fish[i].depth === 2) drawFish(fish[i]);
        // sand
        fb.fillRect(0, sandY, w, h - sandY, 0xc8b070);
        for (var sx2 = 0; sx2 < w; sx2 += 3) fb.setPixel(sx2 + (sx2 % 7), sandY + ((sx2 >> 1) % 3), 0xa89050);
        fb.fillCircle(30, sandY, 3, 0x8a7a68); fb.fillCircle(150, sandY + 1, 4, 0x7a6a58);
      });
      function drawFish(f) {
        var scale = f.depth === 2 ? 2 : 1, fade = f.depth === 0 ? 0.55 : 1;
        var rows = SPECIES[f.sp].map(function (row) { return f.dir > 0 ? row : row.split('').reverse().join(''); });
        var pal = { b: FB.mix(WATER_TOP, f.color[0], fade), f: FB.mix(WATER_TOP, f.color[1], fade), e: 0xffffff, l: FB.mix(WATER_TOP, FB.mix(f.color[0], 0xffffff, 0.45), fade) };
        fb.drawBitmap(rows, Math.round(f.x - spriteWidth(f.sp) * scale / 2), Math.round(f.y), pal, scale);
      }
    }
  };
  E.widgets.aquarium = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
