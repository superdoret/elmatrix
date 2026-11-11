/* Settings screen model: remote-only navigation as a pure state machine.
 * The DOM layer renders view() and forwards logical keys to handleKey(). */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  function catalog() { return E.catalog || require('./catalog.js'); }
  function settingsApi() { return E.settings || require('./settings.js'); }

  var KB_LOWER = ['1234567890', 'qwertyuiop', 'asdfghjklñ', 'zxcvbnm,.-'];
  var KB_UPPER = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM;:_'];
  var KB_SYMBOLS = ['!?¿¡@#$%&*', '()[]{}<>/\\', '|+=:;\'"~^_', 'áéíóúüñÁÉÍÓÚ'];
  var KB_SPECIAL = [
    { act: 'shift', label: 'Aa' }, { act: 'sym', label: '#@' }, { act: 'space', label: 'Espacio' },
    { act: 'del', label: 'Borrar' }, { act: 'ok', label: 'Listo' }, { act: 'cancel', label: 'Cancelar' }
  ];
  var MAX_TEXT = 60;

  function keyboardRows(mode) {
    var src = mode === 1 ? KB_UPPER : mode === 2 ? KB_SYMBOLS : KB_LOWER;
    var rows = src.map(function (s) { return s.split('').map(function (ch) { return { ch: ch, label: ch }; }); });
    rows.push(KB_SPECIAL);
    return rows;
  }

  function SettingsModel(settings, opts) {
    this.settings = settings;       // live settings object {global, widgets}
    this.onChange = (opts && opts.onChange) || function () {};
    this.getPin = (opts && opts.getPin) || function () { return false; };   // session pin (not persisted)
    this.setPin = (opts && opts.setPin) || function () {};
    this.stack = [{ type: 'main', cursor: 0 }];
  }

  SettingsModel.prototype.top = function () { return this.stack[this.stack.length - 1]; };

  SettingsModel.prototype.valueText = function (field, value) {
    switch (field.type) {
      case 'bool': return value ? 'Sí' : 'No';
      case 'select':
        for (var i = 0; i < field.options.length; i++) if (field.options[i].value === value) return field.options[i].label;
        return String(value);
      case 'list': return value.length + (value.length === 1 ? ' elemento' : ' elementos');
      case 'number': return String(value);
      default: return value === '' ? '(vacío)' : String(value);
    }
  };

  /* The music level row edits the station that is playing (or "bundled" for the included music). */
  SettingsModel.prototype.levelKey = function () {
    var g = this.settings.global;
    return g.music_source === 'stream' ? g.music_station : 'bundled';
  };
  SettingsModel.prototype.levelPct = function () {
    var v = this.settings.global.station_levels && this.settings.global.station_levels[this.levelKey()];
    return typeof v === 'number' ? v : 100;
  };
  SettingsModel.prototype._setLevel = function (delta, wrap) {
    var g = this.settings.global, cur = this.levelPct(), next = cur + delta;
    if (next > 100) next = wrap ? 50 : 100;
    if (next < 50) next = wrap ? 100 : 50;
    g.station_levels = g.station_levels || {};
    g.station_levels[this.levelKey()] = next;
    this._changed();
    return { type: 'redraw', toast: 'Nivel: ' + next + '%' };
  };

  SettingsModel.prototype._store = function (row) {
    return row.scope === 'global' ? this.settings.global : this.settings.widgets[row.widgetId].config;
  };

  SettingsModel.prototype.rows = function (screen) {
    var cat = catalog(), self = this, rows = [];
    if (screen.type === 'main') {
      rows.push({ kind: 'pin' });
      cat.GLOBAL_FIELDS.forEach(function (f) { rows.push({ kind: 'field', scope: 'global', field: f }); });
      rows.push({ kind: 'level' });
      cat.WIDGETS.forEach(function (w) { rows.push({ kind: 'widget', widget: w }); });
      rows.push({ kind: 'action', action: 'reset', label: 'Restablecer valores' });
      rows.push({ kind: 'action', action: 'close', label: 'Cerrar' });
    } else if (screen.type === 'widget') {
      var w = cat.byId(screen.id);
      rows.push({ kind: 'enabled', widgetId: w.id });
      w.fields.forEach(function (f) { rows.push({ kind: 'field', scope: 'widget', widgetId: w.id, field: f }); });
      rows.push({ kind: 'action', action: 'runnow', label: 'Mostrar ahora', widgetId: w.id });
      rows.push({ kind: 'action', action: 'back', label: 'Volver' });
    } else if (screen.type === 'list') {
      var list = this.settings.widgets[screen.id].config[screen.key];
      list.forEach(function (v, i) { rows.push({ kind: 'item', index: i, label: v }); });
      rows.push({ kind: 'action', action: 'add', label: '+ Añadir' });
      rows.push({ kind: 'action', action: 'back', label: 'Volver' });
    }
    void self;
    return rows;
  };

  SettingsModel.prototype.view = function () {
    var s = this.top(), self = this;
    if (s.type === 'keyboard') {
      return {
        mode: 'keyboard', title: s.title, text: s.text, rows: keyboardRows(s.mode).map(function (r) {
          return r.map(function (k) { return { label: k.label }; });
        }), r: s.r, c: s.c, kbMode: s.mode,
        hint: 'OK: tecla  ·  Verde: borrar  ·  Amarillo: mayúsculas  ·  Atrás: cancelar'
      };
    }
    var rows = this.rows(s), cat = catalog();
    var out = rows.map(function (row, i) {
      var o = { label: '', value: '', focus: i === s.cursor, kind: row.kind, more: false };
      if (row.kind === 'field') {
        var val = self._store(row)[row.field.key];
        o.label = row.field.label; o.value = self.valueText(row.field, val);
        o.more = row.field.type === 'list' || row.field.type === 'text';
        o.adjustable = row.field.type !== 'list';
      } else if (row.kind === 'widget') {
        var st = self.settings.widgets[row.widget.id];
        o.label = row.widget.name; o.value = st.enabled ? 'Activado' : 'Desactivado'; o.on = st.enabled; o.more = true;
      } else if (row.kind === 'level') {
        o.label = 'Nivel de esta estación'; o.value = self.levelPct() + '%'; o.adjustable = true;
      } else if (row.kind === 'pin') {
        o.label = 'Fijar modo actual'; o.value = self.getPin() ? 'Sí' : 'No'; o.adjustable = true; o.on = self.getPin();
      } else if (row.kind === 'enabled') {
        o.label = 'Activado'; o.value = self.settings.widgets[row.widgetId].enabled ? 'Sí' : 'No';
        o.adjustable = true;
      } else if (row.kind === 'item') {
        o.label = row.label;
      } else o.label = row.label;
      return o;
    });
    var title = 'Ajustes', hint = '';
    var cur = rows[s.cursor];
    if (s.type === 'main') {
      title = 'Ajustes de eLMaTrIx';
      hint = cur && cur.kind === 'widget'
        ? 'OK: activar o desactivar  ·  Derecha: opciones  ·  Atrás: cerrar'
        : 'Arriba/Abajo: mover  ·  Izquierda/Derecha: cambiar  ·  Atrás: cerrar';
    } else if (s.type === 'widget') {
      title = cat.byId(s.id).name;
      hint = 'OK o Izquierda/Derecha: cambiar  ·  Atrás: volver';
      if (cur && cur.kind === 'field' && cur.field.help) hint = cur.field.help + '  ·  Atrás: volver';
    } else if (s.type === 'list') {
      title = cat.byId(s.id).name + ': ' + this._field(s.id, s.key).label;
      hint = 'OK: editar  ·  Amarillo: borrar  ·  Atrás: volver';
      var f = this._field(s.id, s.key);
      if (f.help) hint = f.help + '  ·  Amarillo: borrar';
    }
    return { mode: 'menu', title: title, rows: out, cursor: s.cursor, hint: hint, type: s.type };
  };

  SettingsModel.prototype._field = function (widgetId, key) {
    var w = catalog().byId(widgetId);
    for (var i = 0; i < w.fields.length; i++) if (w.fields[i].key === key) return w.fields[i];
    return null;
  };

  SettingsModel.prototype._changed = function () { this.onChange(this.settings); };

  // Change a field with left/right (dir = -1/+1) or OK (dir = +1).
  SettingsModel.prototype._adjust = function (store, field, dir) {
    var S = settingsApi(), cur = store[field.key], next = cur;
    if (field.type === 'bool') next = !cur;
    else if (field.type === 'number') {
      var step = field.step || 1;
      next = cur + dir * step;
      if (field.max !== undefined && next > field.max) next = dir > 0 && cur === field.max ? field.min : field.max;
      if (field.min !== undefined && next < field.min) next = dir < 0 && cur === field.min ? field.max : field.min;
    } else if (field.type === 'select') {
      var idx = 0;
      field.options.forEach(function (o, i) { if (o.value === cur) idx = i; });
      next = field.options[(idx + dir + field.options.length) % field.options.length].value;
    } else if (field.type === 'text' && field.presets) {
      var pi = field.presets.indexOf(cur);
      next = field.presets[(pi + dir + field.presets.length) % field.presets.length];
    } else return false;
    store[field.key] = S.coerceField(field, next);
    this._changed();
    return true;
  };

  SettingsModel.prototype._openKeyboard = function (title, text, done) {
    this.stack.push({ type: 'keyboard', title: title, text: text, mode: 0, r: 1, c: 0, done: done });
  };

  SettingsModel.prototype._pop = function () {
    if (this.stack.length > 1) this.stack.pop();
  };

  SettingsModel.prototype.isKeyboard = function () { return this.top().type === 'keyboard'; };

  /* Insert a physical keyboard character while the on-screen keyboard is open. */
  SettingsModel.prototype.typeChar = function (ch) {
    var s = this.top();
    if (s.type === 'keyboard' && ch.length === 1 && s.text.length < MAX_TEXT) s.text += ch;
  };
  SettingsModel.prototype.backspace = function () {
    var s = this.top();
    if (s.type === 'keyboard') s.text = s.text.slice(0, -1);
  };
  SettingsModel.prototype.finishKeyboard = function () {
    var s = this.stack.pop();
    s.done(s.text.trim());
    this._changed();
  };

  SettingsModel.prototype._keyboardKey = function (name) {
    var s = this.top();
    var rows = keyboardRows(s.mode);
    switch (name) {
      case 'up': s.r = (s.r + rows.length - 1) % rows.length; break;
      case 'down': s.r = (s.r + 1) % rows.length; break;
      case 'left': s.c = (s.c + rows[s.r].length - 1) % rows[s.r].length; break;
      case 'right': s.c = (s.c + 1) % rows[s.r].length; break;
      case 'green': this.backspace(); break;
      case 'yellow': s.mode = s.mode === 1 ? 0 : 1; break;
      case 'blue': s.mode = s.mode === 2 ? 0 : 2; break;
      case 'back': this._pop(); return { type: 'redraw' };
      case 'ok': {
        var key = rows[s.r][Math.min(s.c, rows[s.r].length - 1)];
        if (key.ch !== undefined) { this.typeChar(key.ch); if (s.mode === 1) s.mode = 0; }
        else if (key.act === 'shift') s.mode = s.mode === 1 ? 0 : 1;
        else if (key.act === 'sym') s.mode = s.mode === 2 ? 0 : 2;
        else if (key.act === 'space') this.typeChar(' ');
        else if (key.act === 'del') this.backspace();
        else if (key.act === 'cancel') this._pop();
        else if (key.act === 'ok') this.finishKeyboard();
        break;
      }
      default: return null;
    }
    // keep the column valid after a row or mode change
    var nr = keyboardRows(s.mode);
    s.c = Math.min(s.c, nr[s.r].length - 1);
    return { type: 'redraw' };
  };

  /* name: up/down/left/right/ok/back/red/green/yellow/blue.
   * Returns null or an effect: {type:'close'|'runNow'|'redraw'|'reset', id?} */
  SettingsModel.prototype.handleKey = function (name) {
    var s = this.top();
    if (s.type === 'keyboard') return this._keyboardKey(name);
    var rows = this.rows(s), row = rows[s.cursor], self = this;
    switch (name) {
      case 'up': s.cursor = (s.cursor + rows.length - 1) % rows.length; return { type: 'redraw' };
      case 'down': s.cursor = (s.cursor + 1) % rows.length; return { type: 'redraw' };
      case 'back':
        if (this.stack.length > 1) { this._pop(); return { type: 'redraw' }; }
        return { type: 'close' };
      case 'red': return { type: 'close' };
      case 'left': case 'right': {
        var dir = name === 'right' ? 1 : -1;
        if (row.kind === 'field') {
          var st = this._store(row);
          if (row.field.type === 'list' && dir > 0) return this._open(row);
          if (this._adjust(st, row.field, dir)) return { type: 'redraw' };
        } else if (row.kind === 'level') {
          return this._setLevel(dir * 5, false);
        } else if (row.kind === 'pin') {
          this.setPin(!this.getPin()); return { type: 'redraw' };
        } else if (row.kind === 'enabled') {
          var ws = this.settings.widgets[row.widgetId]; ws.enabled = !ws.enabled; this._changed(); return { type: 'redraw' };
        } else if (row.kind === 'widget' && dir > 0) {
          this.stack.push({ type: 'widget', id: row.widget.id, cursor: 0 }); return { type: 'redraw' };
        }
        return null;
      }
      case 'yellow':
        if (s.type === 'list' && row.kind === 'item') {
          var list = this.settings.widgets[s.id].config[s.key];
          list.splice(row.index, 1);
          s.cursor = Math.max(0, Math.min(s.cursor, this.rows(s).length - 1));
          this._changed();
          return { type: 'redraw' };
        }
        return null;
      case 'ok': return this._ok(row, s);
      default: void self; return null;
    }
  };

  SettingsModel.prototype._open = function (row) {
    var f = row.field;
    if (f.type === 'list') { this.stack.push({ type: 'list', id: row.widgetId, key: f.key, cursor: 0 }); return { type: 'redraw' }; }
    return null;
  };

  SettingsModel.prototype._ok = function (row, s) {
    var self = this;
    if (row.kind === 'pin') { this.setPin(!this.getPin()); return { type: 'redraw' }; }
    if (row.kind === 'level') return this._setLevel(5, true);
    if (row.kind === 'widget') {
      var ws = this.settings.widgets[row.widget.id]; ws.enabled = !ws.enabled; this._changed(); return { type: 'redraw' };
    }
    if (row.kind === 'enabled') {
      var w2 = this.settings.widgets[row.widgetId]; w2.enabled = !w2.enabled; this._changed(); return { type: 'redraw' };
    }
    if (row.kind === 'field') {
      var st = this._store(row), f = row.field;
      if (f.type === 'list') return this._open(row);
      if (f.type === 'text') {
        this._openKeyboard(f.label, st[f.key], function (v) { st[f.key] = settingsApi().coerceField(f, v); });
        return { type: 'redraw' };
      }
      this._adjust(st, f, 1);
      return { type: 'redraw' };
    }
    if (row.kind === 'item') {
      var list = this.settings.widgets[s.id].config[s.key], idx = row.index;
      this._openKeyboard(this._field(s.id, s.key).label, list[idx], function (v) {
        if (v) list[idx] = v; else list.splice(idx, 1);
      });
      return { type: 'redraw' };
    }
    if (row.kind === 'action') {
      switch (row.action) {
        case 'add': {
          var l2 = this.settings.widgets[s.id].config[s.key];
          this._openKeyboard(this._field(s.id, s.key).label, '', function (v) { if (v) l2.push(v); });
          return { type: 'redraw' };
        }
        case 'back': this._pop(); return { type: 'redraw' };
        case 'close': return { type: 'close' };
        case 'runnow': return { type: 'runNow', id: row.widgetId };
        case 'reset': {
          var fresh = settingsApi().defaults();
          this.settings.global = fresh.global; this.settings.widgets = fresh.widgets;
          this._changed();
          return { type: 'redraw' };
        }
        default: break;
      }
    }
    void self;
    return null;
  };

  var api = { SettingsModel: SettingsModel, keyboardRows: keyboardRows };
  E.settingsmodel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
