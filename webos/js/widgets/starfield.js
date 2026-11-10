/* Starfield: flying through space. Stars have (x, y, z) with z shrinking towards the viewer. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  var Z_MIN = 0.03;

  function resetStar(s, i, rng, initial) {
    s.x[i] = (rng() * 2 - 1); s.y[i] = (rng() * 2 - 1);
    s.z[i] = initial ? Z_MIN + rng() * (1 - Z_MIN) : 1;
    s.px[i] = -1; s.py[i] = -1;
  }

  function createStars(n, rng) {
    var s = { n: n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), px: new Float32Array(n), py: new Float32Array(n), hue: new Float32Array(n) };
    for (var i = 0; i < n; i++) { resetStar(s, i, rng, true); s.hue[i] = 200 + rng() * 60; }
    return s;
  }

  // Perspective projection of star i; returns false (and resets the star) when it left the screen or passed us.
  function projectStar(s, i, cx, cy, k, out) {
    var z = s.z[i];
    if (z <= Z_MIN) return false;
    out.x = cx + s.x[i] / z * k; out.y = cy + s.y[i] / z * k;
    return true;
  }

  var widget = {
    id: 'starfield',
    createStars: createStars, resetStar: resetStar, projectStar: projectStar, Z_MIN: Z_MIN,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, cx = w / 2, cy = h / 2, k = h * 0.5;
      var stars = createStars(260, ctx.rng), out = { x: 0, y: 0 }, last = 0;
      await ctx.loop(ctx.cfg.duration, 30, function (t) {
        var dt = Math.min(0.1, t - last); last = t;
        var speed = 0.35 + 0.15 * Math.sin(t * 0.4);
        fb.clear(0x01020a);
        for (var i = 0; i < stars.n; i++) {
          stars.z[i] -= speed * dt;
          var visible = projectStar(stars, i, cx, cy, k, out) && out.x >= 0 && out.x < w && out.y >= 0 && out.y < h;
          if (!visible) { resetStar(stars, i, ctx.rng, false); continue; }
          var b = Math.min(1, (1 - stars.z[i]) * 1.4 + 0.15), col = FB.hsv(stars.hue[i], 0.25 * (1 - b) + 0.05, b);
          if (stars.px[i] >= 0 && stars.z[i] < 0.6) fb.line(stars.px[i], stars.py[i], out.x, out.y, FB.scaleColor(col, 0.5));
          fb.setPixel(out.x, out.y, col);
          if (stars.z[i] < 0.25) { fb.setPixel(out.x + 1, out.y, col); fb.setPixel(out.x, out.y + 1, col); fb.setPixel(out.x + 1, out.y + 1, col); }
          stars.px[i] = out.x; stars.py[i] = out.y;
        }
      });
    }
  };
  E.widgets.starfield = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
