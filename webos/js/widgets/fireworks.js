/* Fireworks: rockets and particle bursts over a city skyline. Particles live in a preallocated pool. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  var GRAVITY = 26; // LEDs / s^2

  function createPool(n) {
    return { n: n, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n),
      life: new Float32Array(n), max: new Float32Array(n), hue: new Float32Array(n) };
  }

  // Spawns up to `count` particles in free slots; returns how many were spawned.
  function explode(pool, x, y, count, hue, rng, ring) {
    var made = 0;
    for (var i = 0; i < pool.n && made < count; i++) {
      if (pool.life[i] > 0) continue;
      var a = ring ? (made / count) * Math.PI * 2 : rng() * 6.2832, sp = ring ? 30 : 8 + rng() * 34;
      pool.x[i] = x; pool.y[i] = y; pool.vx[i] = Math.cos(a) * sp; pool.vy[i] = Math.sin(a) * sp;
      pool.max[i] = pool.life[i] = 1.3 + rng() * 1.0; pool.hue[i] = hue + (rng() - 0.5) * 30;
      made++;
    }
    return made;
  }

  function stepParticles(pool, dt) {
    var alive = 0;
    for (var i = 0; i < pool.n; i++) {
      if (pool.life[i] <= 0) continue;
      pool.life[i] -= dt;
      if (pool.life[i] <= 0) { pool.life[i] = 0; continue; }
      pool.vy[i] += GRAVITY * dt; pool.vx[i] *= 1 - 0.6 * dt; pool.vy[i] *= 1 - 0.3 * dt;
      pool.x[i] += pool.vx[i] * dt; pool.y[i] += pool.vy[i] * dt;
      alive++;
    }
    return alive;
  }

  var widget = {
    id: 'fireworks',
    createPool: createPool, explode: explode, stepParticles: stepParticles, GRAVITY: GRAVITY,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, i;
      var pool = createPool(520), rockets = [], last = 0, nextLaunch = 0.4;
      var groundY = h - 4, stars = [], bld = [];
      for (i = 0; i < 50; i++) stars.push({ x: ctx.rand(w), y: ctx.rand(Math.floor(h * 0.6)), p: ctx.rand(7) });
      for (var x = 0; x < w;) {
        var bw = 8 + ctx.rand(12), bh = 8 + ctx.rand(Math.floor(h * 0.22));
        bld.push({ x: x, w: bw, h: bh, seed: ctx.rand(100) });
        x += bw + ctx.rand(3);
      }
      await ctx.loop(ctx.cfg.duration, 30, function (t) {
        var dt = Math.min(0.08, t - last); last = t;
        fb.vgradient(0, h, 0x02040f, 0x222a5a);
        for (i = 0; i < stars.length; i++) if ((Math.floor(t * 2) + stars[i].p) % 5) fb.setPixel(stars[i].x, stars[i].y, 0x6a6e9a);
        // launches
        nextLaunch -= dt;
        if (nextLaunch <= 0 && rockets.length < 3) {
          rockets.push({ x: 20 + ctx.rng() * (w - 40), y: groundY - 10, vy: -(60 + ctx.rng() * 30), top: h * (0.15 + ctx.rng() * 0.3), hue: ctx.rng() * 360 });
          nextLaunch = 0.5 + ctx.rng() * 1.4;
        }
        for (i = rockets.length - 1; i >= 0; i--) {
          var r = rockets[i];
          r.y += r.vy * dt; r.vy += 20 * dt;
          fb.setPixel(r.x, r.y, 0xffe8b0); fb.setPixel(r.x, r.y + 1, 0xff9030); fb.setPixel(r.x, r.y + 2, 0x703010);
          if (r.y <= r.top || r.vy > -12) {
            explode(pool, r.x, r.y, 80 + ctx.rand(60), r.hue, ctx.rng, ctx.rng() < 0.3);
            rockets.splice(i, 1);
          }
        }
        stepParticles(pool, dt);
        for (i = 0; i < pool.n; i++) {
          var life = pool.life[i];
          if (life <= 0) continue;
          var f = life / pool.max[i], px = pool.x[i], py = pool.y[i];
          var col = FB.hsv(pool.hue[i], f > 0.3 ? 1 : 0.5, Math.min(1, 0.25 + f * 1.1));
          fb.setPixel(px, py, col);
          if (f > 0.3) { fb.setPixel(px + 1, py, col); fb.setPixel(px, py + 1, col); fb.setPixel(px + 1, py + 1, col); }
        }
        // skyline
        for (i = 0; i < bld.length; i++) {
          var b = bld[i];
          fb.fillRect(b.x, groundY - b.h, b.w, b.h, 0x04040a);
          for (var wy = groundY - b.h + 2; wy < groundY - 2; wy += 4) for (var wx = b.x + 1; wx < b.x + b.w - 1; wx += 3) {
            if ((wx * 5 + wy * 3 + b.seed) % 7 < 2) fb.setPixel(wx, wy, 0xffd060);
          }
        }
        fb.fillRect(0, groundY, w, h - groundY, 0x05050a);
      });
    }
  };
  E.widgets.fireworks = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
