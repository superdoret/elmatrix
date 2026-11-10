/* Procedural pixel icons (weather). Drawn into a Framebuffer; no image assets needed. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  // WMO weather interpretation code -> icon kind.
  function iconForWmo(code) {
    code = Number(code);
    if (code === 0 || code === 1) return 'clear';
    if (code === 2) return 'partly';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95 && code <= 99) return 'storm';
    return 'unknown';
  }

  var WMO_TEXT = {
    clear: 'Despejado', partly: 'Parcial', cloudy: 'Nublado', fog: 'Niebla', rain: 'Lluvia', snow: 'Nieve', storm: 'Tormenta', unknown: '--'
  };

  function sun(fb, cx, cy, r, t, dim) {
    var body = dim ? 0xd8a820 : 0xffd23c, ray = 0xffa81c;
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4 + (t || 0) * 0.4;
      fb.line(cx + Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2), cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5), ray);
    }
    fb.fillCircle(cx, cy, r, body);
  }

  function cloud(fb, x, y, w, color, shade) {
    var h = Math.round(w * 0.6);
    fb.fillCircle(x + Math.round(w * 0.30), y + Math.round(h * 0.62), Math.round(w * 0.2), color);
    fb.fillCircle(x + Math.round(w * 0.52), y + Math.round(h * 0.42), Math.round(w * 0.26), color);
    fb.fillCircle(x + Math.round(w * 0.75), y + Math.round(h * 0.64), Math.round(w * 0.18), color);
    fb.fillRect(x + Math.round(w * 0.3), y + Math.round(h * 0.62), Math.round(w * 0.45), Math.round(w * 0.18) + 1, color);
    if (shade !== undefined) fb.fillRect(x + Math.round(w * 0.3), y + Math.round(h * 0.62) + Math.round(w * 0.18), Math.round(w * 0.45), 1, shade);
  }

  /* kind: clear|partly|cloudy|fog|rain|snow|storm|unknown. (x, y) top-left, size = square side. */
  function drawWeatherIcon(fb, kind, x, y, size, t) {
    t = t || 0;
    var u = size / 32, cx = x + size / 2, cy = y + size / 2, i;
    var white = 0xe8eef8, grey = 0x9aa6b8;
    switch (kind) {
      case 'clear':
        sun(fb, Math.round(cx), Math.round(cy), Math.round(size * 0.22), t);
        break;
      case 'partly':
        sun(fb, Math.round(x + size * 0.36), Math.round(y + size * 0.34), Math.round(size * 0.17), t);
        cloud(fb, Math.round(x + size * 0.18), Math.round(y + size * 0.36), Math.round(size * 0.8), white, grey);
        break;
      case 'cloudy':
        cloud(fb, Math.round(x + size * 0.1), Math.round(y + size * 0.26), Math.round(size * 0.8), grey);
        cloud(fb, Math.round(x + size * 0.02), Math.round(y + size * 0.4), Math.round(size * 0.7), white, grey);
        break;
      case 'fog':
        cloud(fb, Math.round(x + size * 0.1), Math.round(y + size * 0.16), Math.round(size * 0.8), grey);
        for (i = 0; i < 3; i++) {
          fb.fillRect(Math.round(x + size * (0.12 + (i % 2) * 0.1)), Math.round(y + size * (0.62 + i * 0.12)), Math.round(size * 0.7), Math.max(1, Math.round(u * 2)), 0xb8c4d4);
        }
        break;
      case 'rain':
        cloud(fb, Math.round(x + size * 0.1), Math.round(y + size * 0.08), Math.round(size * 0.8), grey);
        for (i = 0; i < 4; i++) {
          var dy = ((t * 10 + i * 3) % 10) / 10 * size * 0.28;
          fb.line(x + size * (0.28 + i * 0.15), y + size * 0.62 + dy, x + size * (0.24 + i * 0.15), y + size * 0.72 + dy, 0x4aa8ff);
        }
        break;
      case 'snow':
        cloud(fb, Math.round(x + size * 0.1), Math.round(y + size * 0.08), Math.round(size * 0.8), grey);
        for (i = 0; i < 4; i++) {
          var sy = ((t * 4 + i * 2.5) % 10) / 10 * size * 0.28;
          fb.fillRect(Math.round(x + size * (0.28 + i * 0.15)), Math.round(y + size * 0.64 + sy), 2, 2, 0xffffff);
        }
        break;
      case 'storm':
        cloud(fb, Math.round(x + size * 0.1), Math.round(y + size * 0.06), Math.round(size * 0.8), 0x6c7488);
        var bx = x + size * 0.5, by = y + size * 0.55, on = Math.floor(t * 3) % 2 === 0 ? 0xffe14a : 0xd8a820;
        fb.line(bx + 2, by, bx - 3, by + size * 0.16, on);
        fb.line(bx - 3, by + size * 0.16, bx + 3, by + size * 0.16, on);
        fb.line(bx + 3, by + size * 0.16, bx - 2, by + size * 0.34, on);
        break;
      default:
        fb.rect(Math.round(x + size * 0.3), Math.round(y + size * 0.3), Math.round(size * 0.4), Math.round(size * 0.4), grey);
    }
  }

  var api = { iconForWmo: iconForWmo, WMO_TEXT: WMO_TEXT, drawWeatherIcon: drawWeatherIcon };
  E.icons = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
