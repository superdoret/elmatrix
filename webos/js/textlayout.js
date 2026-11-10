/* Text layout and scroll maths (pure). */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  var FOLD = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U' };
  function asciiFold(s) {
    return String(s).replace(/[áéíóúüÁÉÍÓÚÜ]/g, function (c) { return FOLD[c]; });
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Candidate (font, scale) pairs from largest to smallest.
   * fonts: {name: Font}; names: allowed font names. */
  function candidates(fonts, names, maxScale) {
    var list = [];
    names.forEach(function (n) {
      var f = fonts[n];
      if (!f) return;
      for (var s = 1; s <= (maxScale || 4); s++) list.push({ font: f, name: n, scale: s, h: f.height * s });
    });
    list.sort(function (a, b) { return b.h - a.h || b.scale - a.scale; });
    return list;
  }

  /* Largest (font, scale) whose text fits maxW x maxH. Falls back to the smallest. */
  function fitText(fonts, names, text, maxW, maxH, maxScale) {
    var list = candidates(fonts, names, maxScale);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var w = c.font.measure(text) * c.scale;
      if (w <= maxW && (maxH === undefined || maxH === null || c.h <= maxH)) {
        return { font: c.font, name: c.name, scale: c.scale, width: w, height: c.h };
      }
    }
    var last = list[list.length - 1];
    return last ? { font: last.font, name: last.name, scale: last.scale, width: last.font.measure(text) * last.scale, height: last.h } : null;
  }

  // x position for aligned text inside [left, left+width).
  function alignX(left, width, textW, align) {
    if (align === 'right') return left + width - textW;
    if (align === 'center') return left + Math.floor((width - textW) / 2);
    return left;
  }

  // Cut text with a trailing "." marker so it fits maxW.
  function truncate(font, text, maxW, scale) {
    scale = scale || 1;
    text = String(text);
    if (font.measure(text) * scale <= maxW) return text;
    while (text.length > 1 && font.measure(text + '.') * scale > maxW) text = text.slice(0, -1);
    return text + '.';
  }

  // Greedy word wrap -> array of lines.
  function wrapText(font, text, maxW, scale) {
    scale = scale || 1;
    var words = String(text).split(/\s+/).filter(Boolean), lines = [], line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (line && font.measure(test) * scale > maxW) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  /* Marquee: x of the left edge of the text after t seconds. Starts just outside the
   * right edge and ends fully outside the left edge. */
  function marqueeX(viewW, textW, speed, t) {
    return Math.round(viewW - speed * t);
  }
  function marqueeDuration(viewW, textW, speed) {
    return (viewW + textW) / speed;
  }

  var api = {
    asciiFold: asciiFold, pad2: pad2, candidates: candidates, fitText: fitText, alignX: alignX,
    truncate: truncate, wrapText: wrapText, marqueeX: marqueeX, marqueeDuration: marqueeDuration
  };
  E.textlayout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
