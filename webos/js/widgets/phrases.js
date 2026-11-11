/* Positive phrases scrolling across the whole banner with colour effects. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  var EFFECTS = ['rainbow', 'solid', 'pulse', 'wave'];

  /* Colour function for an effect. t = seconds. Returns f(px, py) -> colour. */
  function effectColor(effect, FB, t, base) {
    switch (effect) {
      case 'rainbow': return function (px) { return FB.hsv(px * 2.2 + t * 90, 0.9, 1); };
      case 'pulse': return function () { return FB.hsv(base, 0.8, 0.55 + 0.45 * Math.sin(t * 4)); };
      case 'wave': return function (px, py) { return FB.hsv(base + py * 5 + Math.sin(px / 14 + t * 3) * 40, 0.85, 1); };
      default: return function () { return FB.hsv(base, 0.7, 1); };
    }
  }

  var widget = {
    id: 'phrases',
    EFFECTS: EFFECTS, effectColor: effectColor,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, TL = ctx.TL, w = ctx.w, h = ctx.h, cfg = ctx.cfg;
      var phrase = ctx.pick(E.data.phrases);
      var effect = ctx.pick(EFFECTS), base = ctx.rand(360);
      var fontName = phrase.length <= 50 ? '9x18B' : '7x14B';
      var font = ctx.fonts[fontName], scale = h >= 90 ? 2 : 1;
      var textW = font.measure(phrase) * scale, textH = font.height * scale;
      var speed = cfg.speed || 90;
      var dur = TL.marqueeDuration(w, textW, speed);
      var stars = [];
      for (var i = 0; i < 40; i++) stars.push({ x: ctx.rand(w), y: ctx.rand(h), p: ctx.rand(8) });
      var y = Math.floor((h - textH) / 2);
      await ctx.loopFixed(dur, 30, function (t) {
        fb.clear(0);
        stars.forEach(function (s) {
          if (((Math.floor(t * 3) + s.p) % 6) < 3) fb.setPixel(s.x, s.y, 0x202038);
        });
        // chasing LED borders
        for (var x = 0; x < w; x += 4) {
          var on = (((x >> 2) - Math.floor(t * 12)) % 4 + 4) % 4 === 0;
          var c = on ? FB.hsv(base + x, 0.8, 1) : 0x14141e;
          fb.setPixel(x, 6, c); fb.setPixel(w - 1 - x, h - 7, c);
        }
        fb.drawText(font, phrase, TL.marqueeX(w, textW, speed, t), y, 0, scale, { colorFn: effectColor(effect, FB, t, base) });
      });
    }
  };
  E.widgets.phrases = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
