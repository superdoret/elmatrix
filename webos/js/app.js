/* App shell: wires fonts, settings, renderer, scheduler, remote keys and the settings overlay. */
(function () {
  'use strict';
  var E = window.ELM;
  var FONT_NAMES = ['tom-thumb', '5x8', '6x13', '6x13B', '7x14B', '9x18B', '10x20'];
  // Minimal query parser (URLSearchParams does not exist on old engines such as Chromium 38).
  var params = (function (search) {
    var map = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('='), k = i < 0 ? pair : pair.slice(0, i), v = i < 0 ? '' : pair.slice(i + 1);
      try { map[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { map[k] = v; }
    });
    return { get: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; } };
  })(window.location.search);

  var canvas = document.getElementById('matrix');
  var toast = document.getElementById('toast');
  var hint = document.getElementById('hint');
  var settingsEl = document.getElementById('settings');

  // ---- debug / test parameters (documented in the README) ----
  var only = params.get('only');                       // run a single widget
  var fakeTime = params.get('time');                   // HH:MM or ISO date to freeze "now" at
  var forceOffline = params.get('offline') === '1';    // every request fails
  var fixedSeed = params.get('seed');
  var timeOffset = 0;
  if (fakeTime) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(fakeTime), target;
    if (m) { target = new Date(); target.setHours(+m[1], +m[2], 0, 0); } else target = new Date(fakeTime);
    if (!isNaN(target.getTime())) timeOffset = target.getTime() - Date.now();
  }
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rng = fixedSeed ? mulberry(parseInt(fixedSeed, 10) || 1) : Math.random;

  var store = new E.settings.Store();
  var settings = store.data;
  // ?set=pixelart.style:scene,clock.show_date:false  -> temporary overrides (not saved)
  (params.get('set') || '').split(',').forEach(function (pair) {
    var m2 = /^(\w+)\.(\w+):(.*)$/.exec(pair), w = m2 && E.catalog.byId(m2[1]);
    if (!w) return;
    w.fields.forEach(function (f) {
      if (f.key === m2[2]) settings.widgets[w.id].config[f.key] = E.settings.coerceField(f, f.type === 'list' ? m2[3].split(';') : m2[3]);
    });
  });
  var renderer, fonts, scheduler, net, model, audio = null;
  var settingsOpen = false, hintTimer = null, toastTimer = null, pausedByVisibility = false;

  function realFetch(url, opts) {
    if (forceOffline) return Promise.reject(new Error('offline (forced)'));
    return fetch(url, opts);
  }

  // ---- music ----
  var soundHint = document.getElementById('sound-hint');
  function applyAudio() {
    if (!audio) return;
    audio.setEnabled(!!settings.global.music_enabled);
    audio.setVolume(settings.global.music_volume / 100);
    audio.setSource(settings.global.music_source);
    audio.setStation(settings.global.music_station);
    audio.setChristmasSource(settings.global.christmas_source);
  }
  function updateSoundHint() {
    if (soundHint) soundHint.hidden = !(audio && audio.available && audio.needsGesture && settings.global.music_enabled);
  }
  function initAudio() {
    if (params.get('music') === '0') return;
    try {
      audio = E.audio.createEngine({ onStatus: function () { updateSoundHint(); if (settingsOpen) renderCredit(); },
        source: settings.global.music_source, station: settings.global.music_station, christmasSource: settings.global.christmas_source });
      applyAudio();
      if (audio.init()) { audio.start(); updateSoundHint(); } else audio = null;
    } catch (e) { audio = null; if (window.console) console.warn('audio disabled:', e); }
  }

  function renderCredit() {
    var el = document.getElementById('s-credit');
    if (el) el.textContent = 'Radio: SomaFM (somafm.com)' + (audio ? '  ·  ' + audio.describe() : '');
  }

  // ---- overlay helpers ----
  function showHint() {
    if (params.get('hint') === '0') return;
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.hidden = true; }, 6000);
  }
  function showToast(text, sticky, cls) {
    toast.textContent = text;
    toast.className = 'toast' + (cls ? ' ' + cls : '');
    toast.hidden = false;
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(function () { if (!scheduler.paused) toast.hidden = true; }, 2500);
  }

  // ---- settings overlay (DOM view of the pure model) ----
  function renderSettings() {
    var v = model.view(), body = document.getElementById('s-body');
    document.getElementById('s-title').textContent = v.title;
    document.getElementById('s-hint').textContent = v.hint;
    renderCredit();
    body.textContent = '';
    if (v.mode === 'keyboard') {
      var t = document.createElement('div');
      t.className = 'kb-text';
      t.appendChild(document.createTextNode(v.text));
      var caret = document.createElement('span'); caret.className = 'caret'; t.appendChild(caret);
      body.appendChild(t);
      v.rows.forEach(function (row, ri) {
        var rd = document.createElement('div'); rd.className = 'kb-row';
        row.forEach(function (k, ci) {
          var kd = document.createElement('div');
          kd.className = 'key' + (k.label.length > 1 ? ' wide' : '') + (ri === v.r && ci === v.c ? ' focus' : '');
          kd.textContent = k.label;
          rd.appendChild(kd);
        });
        body.appendChild(rd);
      });
      return;
    }
    // Show a window of rows around the cursor so long lists never overflow.
    var max = 11, start = Math.max(0, Math.min(v.cursor - 5, v.rows.length - max));
    v.rows.slice(start, start + max).forEach(function (r) {
      var rd = document.createElement('div');
      rd.className = 'row' + (r.focus ? ' focus' : '') + (r.kind === 'action' ? ' action' : '');
      var l = document.createElement('span'); l.textContent = r.label;
      rd.appendChild(l);
      if (r.value !== '') {
        var val = document.createElement('span');
        val.className = 'val' + (r.on ? ' on' : '');
        val.textContent = (r.adjustable ? '◀ ' : '') + r.value + (r.adjustable ? ' ▶' : '') + (r.more && !r.adjustable ? ' ▶' : '');
        rd.appendChild(val);
      }
      body.appendChild(rd);
    });
  }

  function openSettings() {
    model = new E.settingsmodel.SettingsModel(settings, { onChange: function () { store.save(); applyAudio(); updateSoundHint(); } });
    settingsOpen = true;
    settingsEl.hidden = false;
    hint.hidden = true;
    renderSettings();
  }
  function closeSettings() {
    settingsOpen = false;
    settingsEl.hidden = true;
    store.save();
  }

  // ---- keys ----
  function onKey(e) {
    if (audio && audio.needsGesture) audio.unlock(); // browsers start audio only after a key press
    var name = E.keys.keyName(e);
    if (settingsOpen) {
      if (model.isKeyboard()) {
        if (e.key === 'Backspace') { model.backspace(); renderSettings(); e.preventDefault(); return; }
        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { model.typeChar(e.key); renderSettings(); e.preventDefault(); return; }
      }
      if (!name) return;
      e.preventDefault();
      var fx = model.handleKey(name);
      if (fx && fx.type === 'close') closeSettings();
      else if (fx && fx.type === 'runNow') { closeSettings(); scheduler.runNow(fx.id); }
      else renderSettings();
      return;
    }
    var action = E.keys.bannerAction(name);
    if (!action) return;
    e.preventDefault();
    if (action === 'next') scheduler.skip();
    else if (action === 'prev') scheduler.prev();
    else if (action === 'togglePause') scheduler.togglePause();
    else if (action === 'openSettings') openSettings();
    else if (action === 'toggleMusic') {
      settings.global.music_enabled = !settings.global.music_enabled;
      store.save(); applyAudio(); updateSoundHint();
      showToast(settings.global.music_enabled ? 'Música: encendida' : 'Música: apagada', scheduler.paused);
    }
    else showHint();
  }

  // ---- scheduler wiring ----
  function runWidget(id, control) {
    var widget = E.widgets[id];
    if (!widget) return Promise.reject(new Error('unknown widget ' + id));
    var cfg = settings.widgets[id] ? settings.widgets[id].config : {};
    var fb = renderer.fb;
    fb.clear(0);
    var ctx = E.context.createContext({
      fb: fb, fonts: fonts, cfg: cfg, control: control, net: net, rng: rng, audio: audio,
      present: function () { renderer.markDirty(); },
      name: E.catalog.byId(id).name.toUpperCase(),
      nowMs: function () { return Date.now() + timeOffset; }
    });
    var release = function () { if (audio) audio.setTrack(null); }; // back to the default track
    return widget.run(ctx).then(release, function (err) { release(); throw err; });
  }

  function enabledIds() {
    if (only) return E.widgets[only] ? [only] : [];
    return E.catalog.WIDGETS.filter(function (w) { return settings.widgets[w.id].enabled && E.widgets[w.id]; }).map(function (w) { return w.id; });
  }

  function idleScreen() {
    var fb = renderer.fb;
    fb.clear(0);
    var f = E.textlayout.fitText(fonts, ['9x18B', '7x14B', '6x13B'], 'Sin widgets activos', fb.w - 8, 40, 2);
    fb.drawText(f.font, 'Sin widgets activos', Math.floor((fb.w - f.width) / 2), Math.floor(fb.h / 2) - 10, 0xffb020, f.scale);
    var g2 = E.textlayout.fitText(fonts, ['6x13', '5x8'], 'Pulsa OK para abrir los ajustes', fb.w - 8, 14, 1);
    fb.drawText(g2.font, 'Pulsa OK para abrir los ajustes', Math.floor((fb.w - g2.width) / 2), Math.floor(fb.h / 2) + 22, 0x8080a0, g2.scale);
    renderer.markDirty();
  }

  function onEvent(type, data) {
    if (type === 'start') {
      var w = E.catalog.byId(data);
      if (w && !settingsOpen) showToast(w.name, scheduler.paused);
    } else if (type === 'gap') { renderer.fb.clear(0); renderer.markDirty(); }
    else if (type === 'pause') { if (data) showToast('Pausado  (Amarillo para continuar)', true, 'paused'); else { toast.hidden = true; } }
    else if (type === 'idle') idleScreen();
    else if (type === 'error') { if (window.console) console.warn('widget ' + data.id + ' failed:', data.error); }
  }

  function boot() {
    renderer = new E.renderer.Renderer(canvas, E.fb);
    net = new E.net.Net({ fetch: realFetch, now: function () { return Date.now(); } });
    scheduler = new E.scheduler.Scheduler({
      getEnabled: enabledIds,
      getPauseSeconds: function () { return only ? 0 : settings.global.pause_seconds; },
      getOrder: function () { return settings.global.order; },
      runWidget: runWidget, onEvent: onEvent, rng: rng
    });
    renderer.start();
    initAudio();
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !scheduler.paused) { scheduler.pause(); pausedByVisibility = true; }
      else if (!document.hidden && pausedByVisibility) { scheduler.resume(); pausedByVisibility = false; }
    });
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { renderer.layout(window.innerWidth, window.innerHeight); scheduler.skip(); }, 300);
    });
    if (params.get('settings') === '1') openSettings();
    window.__elmatrix = { scheduler: scheduler, renderer: renderer, audio: audio, model: function () { return model; } }; // test hook
    showHint();
    scheduler.start();
  }

  E.bdf.loadFonts(FONT_NAMES).then(function (f) {
    fonts = f;
    boot();
  }).catch(function (err) {
    document.body.textContent = 'No se pudieron cargar las fuentes: ' + err.message;
  });
})();
