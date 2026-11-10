/* BDF bitmap font parser. Pure logic: works in the browser and in Node. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  function Font(name) {
    this.name = name;
    this.width = 0;      // font bounding box width
    this.height = 0;     // line box height (bounding box height)
    this.ascent = 0;     // distance from the top of the line box to the baseline
    this.descent = 0;
    this.defaultChar = -1;
    this.glyphs = {};    // code -> {dw, w, h, xo, yo, pix}
  }

  Font.prototype.glyph = function (code) {
    var gl = this.glyphs[code];
    if (gl) return gl;
    gl = this.glyphs[this.defaultChar];
    if (gl) return gl;
    return this.glyphs[32] || null;
  };

  Font.prototype.hasGlyph = function (code) {
    return !!this.glyphs[code];
  };

  // Advance width (in LEDs, scale 1) of a string.
  Font.prototype.measure = function (text) {
    var total = 0;
    text = String(text);
    for (var i = 0; i < text.length; i++) {
      var gl = this.glyph(text.charCodeAt(i));
      total += gl ? gl.dw : this.width;
    }
    return total;
  };

  function parseBDF(text, name) {
    var font = new Font(name || '');
    var lines = String(text).split(/\r?\n/);
    var cur = null;
    var inBitmap = false;
    var rowsLeft = 0;
    var rowIndex = 0;
    var fbb = null;
    var ascent = null, descent = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (inBitmap) {
        if (line.indexOf('ENDCHAR') === 0) {
          inBitmap = false;
          if (cur && cur.enc >= 0) {
            font.glyphs[cur.enc] = { dw: cur.dw, w: cur.w, h: cur.h, xo: cur.xo, yo: cur.yo, pix: cur.pix };
          }
          cur = null;
          continue;
        }
        if (rowIndex < cur.h) {
          var hex = line.trim();
          var bytes = Math.ceil(cur.w / 8);
          for (var x = 0; x < cur.w; x++) {
            var byteIdx = x >> 3;
            var byteHex = hex.substr(byteIdx * 2, 2);
            var v = parseInt(byteHex || '0', 16) || 0;
            if (v & (0x80 >> (x & 7))) cur.pix[rowIndex * cur.w + x] = 1;
          }
          void bytes;
        }
        rowIndex++;
        continue;
      }
      var sp = line.indexOf(' ');
      var key = sp < 0 ? line : line.substr(0, sp);
      var rest = sp < 0 ? '' : line.substr(sp + 1);
      switch (key) {
        case 'FONTBOUNDINGBOX': {
          var p = rest.split(/\s+/).map(Number);
          fbb = { w: p[0], h: p[1], xo: p[2], yo: p[3] };
          break;
        }
        case 'FONT_ASCENT': ascent = parseInt(rest, 10); break;
        case 'FONT_DESCENT': descent = parseInt(rest, 10); break;
        case 'DEFAULT_CHAR': font.defaultChar = parseInt(rest, 10); break;
        case 'STARTCHAR': cur = { enc: -1, dw: 0, w: 0, h: 0, xo: 0, yo: 0, pix: null }; break;
        case 'ENCODING': if (cur) cur.enc = parseInt(rest, 10); break;
        case 'DWIDTH': if (cur) cur.dw = parseInt(rest, 10); break;
        case 'BBX': {
          if (!cur) break;
          var b = rest.split(/\s+/).map(Number);
          cur.w = b[0]; cur.h = b[1]; cur.xo = b[2]; cur.yo = b[3];
          cur.pix = new Uint8Array(Math.max(0, cur.w * cur.h));
          break;
        }
        case 'BITMAP': inBitmap = !!cur; rowsLeft = cur ? cur.h : 0; rowIndex = 0; break;
        default: break;
      }
    }
    void rowsLeft;
    if (!fbb) throw new Error('BDF without FONTBOUNDINGBOX');
    font.width = fbb.w;
    font.height = fbb.h;
    font.ascent = ascent !== null ? ascent : fbb.h + fbb.yo;
    font.descent = descent !== null ? descent : -fbb.yo;
    if (!Object.keys(font.glyphs).length) throw new Error('BDF without glyphs');
    return font;
  }

  // ---- loading (browser) -------------------------------------------------
  // Tries XHR relative to the page; on failure falls back to the embedded
  // subset (E.fallbackFontText, generated from tom-thumb) so text never breaks.
  function xhrText(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.timeout = timeoutMs || 8000;
      x.onload = function () {
        // file:// loads report status 0 on success
        if ((x.status === 200 || x.status === 0) && x.responseText) resolve(x.responseText);
        else reject(new Error('HTTP ' + x.status));
      };
      x.onerror = function () { reject(new Error('XHR error')); };
      x.ontimeout = function () { reject(new Error('XHR timeout')); };
      x.send();
    });
  }

  function loadFont(name, base) {
    return xhrText((base || 'assets/fonts/') + name + '.bdf').then(function (text) {
      return parseBDF(text, name);
    }).catch(function (err) {
      if (typeof console !== 'undefined') console.warn('font ' + name + ' not loaded (' + err.message + '), using fallback');
      if (!E.fallbackFontText) throw err;
      return parseBDF(E.fallbackFontText, name + '*');
    });
  }

  function loadFonts(names, base) {
    return Promise.all(names.map(function (n) { return loadFont(n, base); })).then(function (list) {
      var out = {};
      names.forEach(function (n, i) { out[n] = list[i]; });
      return out;
    });
  }

  var api = { Font: Font, parseBDF: parseBDF, loadFont: loadFont, loadFonts: loadFonts };
  E.bdf = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
