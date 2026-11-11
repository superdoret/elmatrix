/* Music visualizer: LED spectrum bars from the audio AnalyserNode, or a gentle simulation when there is no audio. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  /* Maps FFT bytes (0..255) to `n` bar levels (0..1) with a log-like frequency spacing and a gentle treble tilt. */
  function binsToBars(data, n, out) {
    out = out || new Float32Array(n);
    var usable = Math.floor(data.length * 0.75);
    for (var i = 0; i < n; i++) {
      var a = 1 + Math.floor((usable - 1) * Math.pow(i / n, 2)), b = Math.max(a + 1, 1 + Math.floor((usable - 1) * Math.pow((i + 1) / n, 2))), m = 0;
      for (var j = a; j < b && j < data.length; j++) if (data[j] > m) m = data[j];
      out[i] = Math.min(1, (m / 255) * (0.7 + 0.9 * i / n));
    }
    return out;
  }

  // Believable fake spectrum: slow waves per bar plus a kick that mostly moves the low bars.
  function simulateBars(t, n, out) {
    out = out || new Float32Array(n);
    var kick = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.1)), 4);
    for (var i = 0; i < n; i++) {
      var f = i / n;
      var v = 0.38 + 0.26 * Math.sin(t * 1.7 + i * 0.35) + 0.18 * Math.sin(t * 2.9 + i * 0.9 + 1.3) + 0.5 * kick * (1 - f) * (1 - f);
      v *= 1 - 0.45 * f;
      out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return out;
  }

  // Fast attack, slow decay (bars) and a slower falling peak marker.
  function smooth(bars, peaks, target, dt) {
    for (var i = 0; i < bars.length; i++) {
      bars[i] = target[i] > bars[i] ? target[i] : Math.max(target[i], bars[i] - dt * 1.8);
      peaks[i] = bars[i] > peaks[i] ? bars[i] : Math.max(0, peaks[i] - dt * 0.45);
    }
  }

  var widget = {
    id: 'visualizer',
    binsToBars: binsToBars, simulateBars: simulateBars, smooth: smooth,
    run: async function (ctx) {
      var fb = ctx.fb, FB = ctx.FB, w = ctx.w, h = ctx.h, audio = ctx.audio;
      var n = Math.floor((w - 8) / 4), top = 14, segH = 3, segGap = 1, rows = Math.floor((h - top - 4) / (segH + segGap));
      var bars = new Float32Array(n), peaks = new Float32Array(n), target = new Float32Array(n);
      var buf = null;
      var agc = 0.25, last = 0, live = false;
      var colors = []; for (var r = 0; r < rows; r++) colors.push(FB.hsv(125 - 125 * (r / (rows - 1)), 1, 1));
      await ctx.loop(ctx.cfg.duration, 30, function (t) {
        var dt = Math.min(0.1, t - last); last = t;
        if (!buf && audio && audio.binCount && audio.binCount()) buf = new Uint8Array(audio.binCount()); // the analyser appears after the first track connects
        live = !!(buf && audio.getSpectrum(buf));
        if (live) {
          binsToBars(buf, n, target);
          var mx = 0, i;
          for (i = 0; i < n; i++) if (target[i] > mx) mx = target[i];
          agc = Math.max(agc * 0.995, mx, 0.12); // auto gain: the ambient music is quiet by design
          for (i = 0; i < n; i++) target[i] = Math.min(1, target[i] / agc);
        } else simulateBars(t, n, target);
        smooth(bars, peaks, target, dt);
        fb.clear(0x02030a);
        var x0 = Math.floor((w - n * 4) / 2);
        for (var b = 0; b < n; b++) {
          var lit = Math.round(bars[b] * rows), x = x0 + b * 4;
          for (var s = 0; s < lit; s++) fb.fillRect(x, h - 4 - (s + 1) * (segH + segGap), 3, segH, colors[s]);
          var pk = Math.min(rows - 1, Math.round(peaks[b] * rows));
          if (pk > 0) fb.fillRect(x, h - 4 - (pk + 1) * (segH + segGap), 3, segH, 0xffffff);
        }
        ctx.drawText('5x8', 'VISUALIZADOR', 4, 2, 0x707088, 1);
        var tag = live ? 'EN VIVO' : 'SIMULADO', tw = fb.textWidth(ctx.fonts['5x8'], tag, 1);
        ctx.drawText('5x8', tag, w - tw - 4, 2, live ? 0x44e07a : 0x808098, 1);
      });
    }
  };
  E.widgets.visualizer = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
