/* Settings: defaults from the catalog, coercion/merge of untrusted JSON, localStorage store. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  var STORAGE_KEY = 'elmatrix.settings.v1';

  function catalog() { return E.catalog || require('./catalog.js'); }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function coerceField(field, value) {
    var def = field.def;
    switch (field.type) {
      case 'number': {
        var n = typeof value === 'number' ? value : parseFloat(value);
        if (!isFinite(n)) return def;
        if (field.min !== undefined && n < field.min) n = field.min;
        if (field.max !== undefined && n > field.max) n = field.max;
        return n;
      }
      case 'bool':
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === 1) return true;
        if (value === 'false' || value === 0) return false;
        return def;
      case 'select': {
        var opts = field.options || [];
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].value === value || String(opts[i].value) === String(value)) return opts[i].value;
        }
        return def;
      }
      case 'list': {
        if (typeof value === 'string') value = value.split(/\r?\n/);
        if (!Array.isArray(value)) return clone(def);
        return value.map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 20);
      }
      case 'color':
        return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : def;
      default: // text
        return typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, 60) : def;
    }
  }

  function defaultConfig(widget) {
    var cfg = {};
    widget.fields.forEach(function (f) { cfg[f.key] = clone(f.def); });
    return cfg;
  }

  function defaults() {
    var cat = catalog();
    var s = { global: {}, widgets: {} };
    cat.GLOBAL_FIELDS.forEach(function (f) { s.global[f.key] = f.def; });
    cat.WIDGETS.forEach(function (w) {
      s.widgets[w.id] = { enabled: !!w.def_enabled, config: defaultConfig(w) };
    });
    return s;
  }

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  /* Merge untrusted stored data over the defaults. Unknown keys and widgets are dropped,
   * wrong types fall back to the default, numbers are clamped. */
  function merge(raw) {
    var cat = catalog();
    var out = defaults();
    if (!isObj(raw)) return out;
    if (isObj(raw.global)) {
      cat.GLOBAL_FIELDS.forEach(function (f) {
        if (f.key in raw.global) out.global[f.key] = coerceField(f, raw.global[f.key]);
      });
    }
    if (isObj(raw.widgets)) {
      cat.WIDGETS.forEach(function (w) {
        var r = raw.widgets[w.id];
        if (!isObj(r)) return;
        if (typeof r.enabled === 'boolean') out.widgets[w.id].enabled = r.enabled;
        if (isObj(r.config)) {
          w.fields.forEach(function (f) {
            if (f.key in r.config) out.widgets[w.id].config[f.key] = coerceField(f, r.config[f.key]);
          });
        }
      });
    }
    return out;
  }

  function getStorage() {
    try { return g.localStorage || null; } catch (e) { return null; }
  }

  /* Store with an injectable storage (defaults to localStorage). Never throws. */
  function Store(storage) {
    this.storage = storage === undefined ? getStorage() : storage;
    this.data = this.load();
  }
  Store.prototype.load = function () {
    try {
      var txt = this.storage && this.storage.getItem(STORAGE_KEY);
      return merge(txt ? JSON.parse(txt) : null);
    } catch (e) { return defaults(); }
  };
  Store.prototype.save = function () {
    try { if (!this.storage) return false; this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data)); return true; }
    catch (e) { return false; }
  };
  Store.prototype.reset = function () { this.data = defaults(); this.save(); };

  var api = { STORAGE_KEY: STORAGE_KEY, coerceField: coerceField, defaults: defaults, merge: merge, Store: Store, defaultConfig: defaultConfig };
  E.settings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
