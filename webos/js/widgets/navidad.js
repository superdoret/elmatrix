/* Navidad: a gallery of animated christmas pixel-art scenes (js/widgets/navidad/*). One run plays a few scenes with a
 * soft fade through dark between them. The pin ("fijar") is honoured by ctx.loop: the current scene just keeps animating. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  var FADE = 1.2;
  var memory = { last: null };   // survives between visits: no immediate repeats, sequential order continues

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Scenes the user left enabled (every scene_<id> bool); if everything is off, all scenes play.
  function enabledScenes(cfg, scenes) {
    var on = scenes.filter(function (s) { return cfg['scene_' + s.id] !== false; });
    return on.length ? on : scenes.slice();
  }

  /* Next scene id: 'secuencial' follows the catalog order and wraps; 'aleatorio' picks at random but never the scene
   * that just played (unless it is the only one). */
  function chooseNext(order, list, lastId, rng) {
    if (!list.length) return null;
    var ids = list.map(function (s) { return s.id; }), i = ids.indexOf(lastId);
    if (order === 'secuencial') return list[i < 0 ? 0 : (i + 1) % list.length];
    var pool = list.filter(function (s) { return s.id !== lastId; });
    if (!pool.length) pool = list;
    return pool[Math.floor(rng() * pool.length)];
  }

  // Year for the "Feliz <año>" scene: in January the year that just started, otherwise the coming year.
  function newYear(date) { return date.getMonth() === 0 ? date.getFullYear() : date.getFullYear() + 1; }

  var widget = {
    id: 'navidad',
    FADE: FADE, enabledScenes: enabledScenes, chooseNext: chooseNext, newYear: newYear, memory: memory,
    run: async function (ctx) {
      var cfg = ctx.cfg, all = E.navidadScenes, L = E.navidadLib, fb = ctx.fb;
      ctx.requestTrack('christmas'); // the app restores the default track when this widget ends
      var list = cfg.scene_only ? all.filter(function (s) { return s.id === cfg.scene_only; }) : enabledScenes(cfg, all);
      var count = cfg.scene_only ? 1 : Math.max(1, Math.min(list.length, cfg.scenes_per_visit || 4));
      var dur = Math.max(FADE * 3, cfg.duration || 18);
      for (var n = 0; n < count; n++) {
        var scene = chooseNext(cfg.order, list, memory.last, ctx.rng);
        memory.last = scene.id;
        var st = scene.make(ctx, mulberry(ctx.rand(2147483647))), fps = scene.fps || 20;
        var tEnd = await ctx.loop(dur - FADE, fps, function (t) {
          scene.draw(ctx, st, t);
          if (t < FADE) L.fadeFb(fb, L.smooth(0, 1, t / FADE));
        });
        await ctx.loopFixed(FADE, fps, function (tt) {
          scene.draw(ctx, st, tEnd + tt);
          L.fadeFb(fb, 1 - L.smooth(0, 1, tt / FADE));
        });
      }
    }
  };
  E.widgets.navidad = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
