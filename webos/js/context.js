/* Widget context: the API a widget sees. Widgets are `{id, run(ctx)}` objects; run() is async and
 * must return when it is done. Aborts (skip/stop) reject ctx.sleep()/ctx.loop() with an AbortError. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  function createContext(o) {
    var fb = o.fb, fonts = o.fonts, control = o.control;
    var TL = E.textlayout || require('./textlayout.js');
    var FB = E.fb || require('./framebuffer.js');

    var ctx = {
      fb: fb, w: fb.w, h: fb.h, fonts: fonts, cfg: o.cfg || {}, signal: control.signal,
      rng: o.rng || Math.random, FB: FB, TL: TL, widgetName: o.name || ''
    };

    ctx.audio = o.audio || null;
    /* Ask for a music track (e.g. 'christmas'). The app restores the default track when the widget ends. */
    ctx.requestTrack = function (name) { if (ctx.audio) { try { ctx.audio.setTrack(name); } catch (e) { /* silent */ } } };

    ctx.date = function () { return new Date(o.nowMs ? o.nowMs() : Date.now()); };
    ctx.present = function () { if (o.present) o.present(); };
    ctx.sleep = function (ms) { return control.sleep(ms); };
    ctx.getJson = function (url, ttlMs) {
      if (!o.net) return Promise.reject(new Error('no network layer'));
      return o.net.getJson(url, ttlMs);
    };
    /* Await a promise that does not know about aborts (network): rejects with AbortError on skip. */
    ctx.abortable = function (promise) {
      return new Promise(function (resolve, reject) {
        var sig = control.signal;
        function onAbort() { var e = new Error('aborted'); e.name = 'AbortError'; reject(e); }
        if (sig.aborted) return onAbort();
        sig.onAbort(onAbort);
        promise.then(function (v) { sig.offAbort(onAbort); resolve(v); }, function (e) { sig.offAbort(onAbort); reject(e); });
      });
    };
    ctx.rand = function (n) { return Math.floor(ctx.rng() * n); };
    ctx.pick = function (arr) { return arr[ctx.rand(arr.length)]; };

    /* Frame loop for `seconds` of unpaused time at `fps`. draw(t, frame) renders into ctx.fb;
     * returning 'stop' ends the loop early. Resolves with the elapsed seconds. */
    ctx.loop = async function (seconds, fps, draw) {
      var start = control.activeNow(), frame = 0, interval = 1000 / fps, t = 0;
      for (;;) {
        t = (control.activeNow() - start) / 1000;
        if (t >= seconds) break;
        if (draw(t, frame++) === 'stop') break;
        ctx.present();
        await control.sleep(interval);
      }
      return t;
    };

    // Draw text fitted to a box with one of the allowed fonts; returns its metrics.
    ctx.fit = function (text, names, maxW, maxH, maxScale) {
      return TL.fitText(fonts, names, text, maxW, maxH, maxScale);
    };

    /* ctx.drawFit(text, {fonts, x, y, w, h, align, valign, color, maxScale, colorFn}) */
    ctx.drawFit = function (text, opt) {
      var f = TL.fitText(fonts, opt.fonts, text, opt.w, opt.h, opt.maxScale);
      if (!f) return null;
      var x = TL.alignX(opt.x, opt.w, f.width, opt.align || 'left');
      var y = opt.y;
      if (opt.valign === 'middle' && opt.h) y = opt.y + Math.floor((opt.h - f.height) / 2);
      else if (opt.valign === 'bottom' && opt.h) y = opt.y + opt.h - f.height;
      fb.drawText(f.font, text, x, y, opt.color, f.scale, { colorFn: opt.colorFn });
      return { x: x, y: y, width: f.width, height: f.height, scale: f.scale, name: f.name, font: f.font };
    };

    // Plain centred text at an exact font and scale.
    ctx.drawText = function (fontName, text, x, y, color, scale, opts) {
      return fb.drawText(fonts[fontName], text, x, y, color, scale || 1, opts);
    };

    /* "Sin conexion" screen shown for `seconds`. */
    ctx.offline = async function (title, seconds) {
      var amber = 0xffb020, dim = 0x806010;
      var cx = Math.floor(fb.w / 2), cy = Math.floor(fb.h * 0.30);
      await ctx.loop(seconds || 5, 4, function (t) {
        fb.clear(0);
        var blink = Math.floor(t * 2) % 2 === 0;
        var c = blink ? amber : dim;
        // simple "no signal" glyph: three arcs, a dot and a slash
        for (var r = 5; r <= 15; r += 5) {
          for (var a = -2.4; a <= -0.74; a += 0.05) {
            fb.setPixel(cx + Math.round(Math.cos(a) * r), cy + 8 + Math.round(Math.sin(a) * r), c);
          }
        }
        fb.fillCircle(cx, cy + 8, 1, c);
        fb.line(cx - 13, cy - 6, cx + 13, cy + 12, 0xff4040);
        ctx.drawFit(title || ctx.widgetName, { fonts: ['9x18B', '7x14B', '5x8'], x: 0, y: 3, w: fb.w, h: 18, align: 'center', color: 0x9090a0, maxScale: 1 });
        ctx.drawFit('Sin conexión', { fonts: ['9x18B', '7x14B'], x: 4, y: cy + 24, w: fb.w - 8, h: 30, align: 'center', color: amber, maxScale: 2 });
        ctx.drawFit('Reintentando en la próxima vuelta', { fonts: ['5x8'], x: 4, y: fb.h - 11, w: fb.w - 8, h: 9, align: 'center', color: 0x707080, maxScale: 1 });
      });
    };

    return ctx;
  }

  var api = { createContext: createContext };
  E.context = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
