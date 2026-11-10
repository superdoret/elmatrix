/* Small ES5 polyfills for old engines (LG webOS 3.x = Chromium 38). Each one is feature-detected,
 * so on modern engines this file does nothing. Written in ES5 on purpose (no build step needed). */
(function (g) {
  'use strict';

  function def(obj, name, fn) {
    if (obj && typeof obj[name] !== 'function') {
      Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true, enumerable: false });
    }
  }

  function toInt(v, fallback) { v = Number(v); return v !== v ? fallback : (v < 0 ? Math.ceil(v) : Math.floor(v)); }
  function relIndex(v, len, fallback) {
    if (v === undefined) return fallback;
    v = toInt(v, 0);
    return v < 0 ? Math.max(len + v, 0) : Math.min(v, len);
  }

  function fill(value, start, end) {
    var len = this.length, s = relIndex(start, len, 0), e = relIndex(end, len, len);
    for (var i = s; i < e; i++) this[i] = value;
    return this;
  }

  function install(g) {
    // Object / Number / Math
    def(Object, 'assign', function (target) {
      if (target == null) throw new TypeError('Cannot convert undefined or null to object');
      var to = Object(target);
      for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i];
        if (src != null) for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) to[k] = src[k];
      }
      return to;
    });
    def(Number, 'isFinite', function (v) { return typeof v === 'number' && isFinite(v); });
    def(Number, 'isInteger', function (v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; });
    def(Math, 'sign', function (v) { v = +v; return v === 0 || v !== v ? v : (v > 0 ? 1 : -1); });
    def(Math, 'trunc', function (v) { v = +v; return v < 0 ? Math.ceil(v) : Math.floor(v); });

    // Array
    def(g.Array.prototype, 'fill', fill);
    def(g.Array.prototype, 'includes', function (x, from) {
      var len = this.length;
      for (var i = relIndex(from, len, 0); i < len; i++) if (this[i] === x || (x !== x && this[i] !== this[i])) return true;
      return false;
    });
    def(g.Array.prototype, 'find', function (fn, thisArg) {
      for (var i = 0; i < this.length; i++) if (fn.call(thisArg, this[i], i, this)) return this[i];
      return undefined;
    });
    def(g.Array.prototype, 'findIndex', function (fn, thisArg) {
      for (var i = 0; i < this.length; i++) if (fn.call(thisArg, this[i], i, this)) return i;
      return -1;
    });
    def(g.Array, 'from', function (src, mapFn) {
      var out = [];
      if (src == null) return out;
      for (var i = 0; i < src.length; i++) out.push(mapFn ? mapFn(src[i], i) : src[i]);
      return out;
    });

    // String
    def(g.String.prototype, 'startsWith', function (s, pos) { pos = pos || 0; return this.substr(pos, String(s).length) === String(s); });
    def(g.String.prototype, 'endsWith', function (s) { s = String(s); return s.length <= this.length && this.slice(this.length - s.length) === s; });
    def(g.String.prototype, 'includes', function (s, pos) { return this.indexOf(s, pos || 0) !== -1; });
    def(g.String.prototype, 'repeat', function (n) {
      var out = '';
      for (var i = 0; i < n; i++) out += this;
      return out;
    });
    def(g.String.prototype, 'padStart', function (len, pad) {
      var s = String(this); pad = pad === undefined ? ' ' : String(pad);
      while (pad && s.length < len) s = pad + s;
      return s.length > len ? s.slice(s.length - len) : s;
    });

    // Typed arrays: %TypedArray%.prototype.fill / slice (missing before Chromium 45)
    if (typeof g.Uint8Array === 'function') {
      var proto = Object.getPrototypeOf(g.Uint8Array.prototype);
      ['Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array'].forEach(function (n) {
        var C = g[n];
        if (!C) return;
        var target = proto && proto !== Object.prototype && proto !== Function.prototype ? proto : C.prototype;
        def(target, 'fill', fill);
        def(target, 'slice', function (s, e) {
          var len = this.length, a = relIndex(s, len, 0), b = relIndex(e, len, len), out = new this.constructor(Math.max(b - a, 0));
          for (var i = a; i < b; i++) out[i - a] = this[i];
          return out;
        });
      });
    }

    // fetch over XHR (Chromium < 42). Only what the app needs: GET + json()/text().
    if (typeof g.fetch !== 'function' && typeof g.XMLHttpRequest === 'function') {
      g.fetch = function (url) {
        return new Promise(function (resolve, reject) {
          var x = new g.XMLHttpRequest();
          x.open('GET', String(url), true);
          x.timeout = 15000;
          x.onload = function () {
            var text = x.responseText;
            resolve({
              ok: x.status >= 200 && x.status < 300,
              status: x.status,
              text: function () { return Promise.resolve(text); },
              json: function () { return new Promise(function (res, rej) { try { res(JSON.parse(text)); } catch (e) { rej(e); } }); }
            });
          };
          x.onerror = x.ontimeout = function () { reject(new TypeError('Network request failed')); };
          x.send(null);
        });
      };
    }
  }

  install(g);
  var api = { install: install };
  (g.ELM = g.ELM || {}).compat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
