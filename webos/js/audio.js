/* Audio engine. Everything audible goes through ONE <audio> element at a time (webOS 3 / Chromium 38: Web Audio
 * output is silent on the TV, WAV is unsupported, only MP3 works, and a single media pipeline is safest).
 *
 * Sources: 'stream' = SomaFM radio (falls back to the bundled MP3 after repeated failures or when offline),
 *          'incluida' = bundled MP3 (assets/music/*.mp3, rendered by tools/render-music.js).
 * Tracks: 'ambient' (default) and 'christmas'. A widget asks for a track with setTrack(); setTrack(null) restores
 * the default. Transitions are sequential: fade the current element out, swap, fade the new one in (element.volume).
 * Web Audio is used ONLY as an optional analyser tap for the visualizer (never for playback on TVs). Never throws. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  var FADE_OUT = 1.5, FADE_IN = 2.5, STEP_MS = 100;
  var RECOVER_MS = 180000;     // retry the radio this often while playing the bundled fallback
  var SILENCE_MS = 2000;       // analyser all zeros this long = report "no real spectrum"

  function clamp01(v) { v = Number(v); return v !== v ? 0 : Math.max(0, Math.min(1, v)); }

  /* opts: {source, station, christmasSource, createElement(), isOnline(), probe(url, cb(ok)), now(),
   *        timers:{setInterval, clearInterval, setTimeout, clearTimeout}, AudioContext (analyser only; null = none),
   *        analyser (bool, default true), onStatus} */
  function createEngine(opts) {
    opts = opts || {};
    var timers = opts.timers || {
      setTimeout: function (f, ms) { return setTimeout(f, ms); }, clearTimeout: function (t) { clearTimeout(t); },
      setInterval: function (f, ms) { return setInterval(f, ms); }, clearInterval: function (t) { clearInterval(t); }
    };
    var createElement = opts.createElement || (typeof g.Audio === 'function' ? function () { return new g.Audio(); } : null);
    var isOnline = opts.isOnline || function () { return !(typeof navigator !== 'undefined' && navigator.onLine === false); };
    var now = opts.now || function () { return Date.now(); };
    var Ctor = opts.analyser === false ? null : (opts.AudioContext !== undefined ? opts.AudioContext : (g.AudioContext || g.webkitAudioContext || null));
    var probe = opts.probe || defaultProbe;
    var ST = null;
    var ctx = null, analyser = null;
    var cur = null;              // {name, role:'primary'|'fallback', kind:'stream'|'file', player, level, fadeTimer, recoverTimer}
    var swapping = false, pendingBegin = null, muteTimer = null, started = false, silentSince = 0;
    var eng = {
      available: false, enabled: true, volume: 0.35, needsGesture: false, defaultTrack: 'ambient', currentTrack: null, error: null,
      source: opts.source || 'stream', station: opts.station || 'dronezone', christmasSource: opts.christmasSource || 'carols',
      streamState: 'idle', streamBlocked: false, ctxSuspended: false, role: 'primary'
    };

    function status() { if (opts.onStatus) { try { opts.onStatus(eng); } catch (e) { /* ignore */ } } }
    function recomputeGesture() { eng.needsGesture = eng.ctxSuspended || eng.streamBlocked; }

    // HEAD request to see whether the radio answers (only used while on the fallback, so a dead radio never interrupts the music).
    function defaultProbe(url, cb) {
      try {
        var x = new XMLHttpRequest(), done = false;
        function finish(ok) { if (!done) { done = true; cb(ok); } }
        x.open('HEAD', url, true); x.timeout = 8000;
        x.onload = function () { finish(x.status >= 200 && x.status < 300); };
        x.onerror = x.ontimeout = function () { finish(false); };
        x.send(null);
      } catch (e) { cb(false); }
    }

    /* What to play for a track: {primary:{kind,url,loop}, fallback:{...}|null}. */
    function planFor(name) {
      ST = ST || E.stations;
      var file = { kind: 'file', url: ST.fileFor(name), loop: true };
      var radio = name === 'christmas' ? eng.christmasSource === 'radio' : eng.source === 'stream';
      if (!radio) return { primary: file, fallback: null };
      return { primary: { kind: 'stream', url: ST.forTrack(name, eng.station).url, loop: false }, fallback: file };
    }

    // ---- volume: element.volume only (level = fade 0..1 times the master volume) ----
    function target(slot) { return slot.level * (eng.enabled ? eng.volume : 0); }
    function applyVolume(slot) {
      var el = slot && slot.player && slot.player.element();
      if (el) { try { el.volume = Math.max(0, Math.min(1, target(slot))); } catch (e) { /* ignore */ } }
    }
    function fade(slot, to, secs, done) {
      if (slot.fadeTimer) { timers.clearTimeout(slot.fadeTimer); slot.fadeTimer = null; }
      var from = slot.level, steps = Math.max(1, Math.round(secs * 1000 / STEP_MS)), i = 0;
      (function step() {
        i++; slot.level = from + (to - from) * (i / steps); applyVolume(slot);
        if (i < steps) slot.fadeTimer = timers.setTimeout(step, STEP_MS);
        else { slot.fadeTimer = null; if (done) done(); }
      })();
    }

    // ---- optional analyser tap (modern browsers only; skipped on TVs by the caller) ----
    function routeElement(el) {
      if (!Ctor) return;
      try {
        if (!ctx) {
          ctx = new Ctor();
          analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.8;
          analyser.connect(ctx.destination);
          eng.ctxSuspended = ctx.state === 'suspended';
          recomputeGesture();
        }
        ctx.createMediaElementSource(el).connect(analyser);
      } catch (e) { eng.error = e; }
    }

    // ---- players ----
    function startPlayer(slot, spec, maxFailures) {
      slot.kind = spec.kind;
      slot.player = new E.stream.StreamPlayer({
        url: spec.url, loop: spec.loop, maxFailures: maxFailures, createElement: createElement, timers: timers, isOnline: spec.kind === 'stream' ? isOnline : function () { return true; },
        onElement: function (el) { try { el.volume = Math.max(0, Math.min(1, target(slot))); } catch (e) { /* ignore */ } routeElement(el); },
        onChange: function (state) { onPlayerState(slot, state); }
      });
      if (eng.enabled) slot.player.start();
    }

    function onPlayerState(slot, state) {
      if (cur !== slot) return;
      eng.streamState = state;
      eng.streamBlocked = state === 'blocked';
      recomputeGesture();
      if (state === 'playing') { silentSince = 0; fade(slot, 1, FADE_IN); }
      else if (state === 'fallback' && slot.kind === 'stream') goFallback(slot);
      status();
    }

    // Radio gave up: stop it (one element at a time) and play the bundled file, then retry the radio quietly.
    function goFallback(slot) {
      if (slot.player) slot.player.stop();
      var plan = planFor(slot.name);
      slot.level = 0;
      slot.role = 'fallback'; eng.role = 'fallback';
      if (plan.fallback) { startPlayer(slot, plan.fallback, 3); scheduleRecover(slot); }
      else scheduleRecover(slot);
    }

    function scheduleRecover(slot) {
      if (slot.recoverTimer) timers.clearTimeout(slot.recoverTimer);
      slot.recoverTimer = timers.setTimeout(function () {
        slot.recoverTimer = null;
        if (cur !== slot || slot.role !== 'fallback' || !eng.enabled) { if (cur === slot && slot.role === 'fallback') scheduleRecover(slot); return; }
        if (!isOnline()) { scheduleRecover(slot); return; }
        var plan = planFor(slot.name);
        probe(plan.primary.url, function (ok) {
          if (cur !== slot || slot.role !== 'fallback') return;
          if (!ok) { scheduleRecover(slot); return; }
          // radio answers: sequential swap file -> radio (one quick attempt; failure returns to the file)
          fade(slot, 0, FADE_OUT, function () {
            if (cur !== slot) return;
            slot.player.stop(); slot.role = 'primary'; eng.role = 'primary'; slot.level = 0;
            startPlayer(slot, plan.primary, 1);
          });
        });
      }, RECOVER_MS);
    }

    function begin(name) {
      var plan = planFor(name);
      var slot = { name: name, role: 'primary', kind: plan.primary.kind, player: null, level: 0, fadeTimer: null, recoverTimer: null };
      cur = slot; eng.currentTrack = name; eng.role = 'primary'; eng.streamState = 'idle'; eng.streamBlocked = false;
      startPlayer(slot, plan.primary, undefined);
      recomputeGesture();
      status();
    }

    function teardown(slot) {
      if (slot.fadeTimer) timers.clearTimeout(slot.fadeTimer);
      if (slot.recoverTimer) timers.clearTimeout(slot.recoverTimer);
      slot.fadeTimer = slot.recoverTimer = null;
      if (slot.player) slot.player.stop();
    }

    /* Sequential transition: fade out the current element, tear it down, then begin the next track. The latest
     * request wins if several arrive during the fade-out. */
    function transition(beginFn) {
      if (!cur) { beginFn(); return; }
      pendingBegin = beginFn;
      if (swapping) return;
      swapping = true;
      var old = cur;
      var finish = function () {
        teardown(old); swapping = false;
        var fn = pendingBegin; pendingBegin = null; cur = null;
        if (fn) fn();
      };
      if (old.player && old.player.element() && eng.enabled) fade(old, 0, FADE_OUT, finish); else finish();
    }

    // ---- public API ----
    eng.init = function () {
      if (eng.available) return true;
      eng.available = !!createElement && !!(E.stream && E.stations);
      status();
      return eng.available;
    };

    eng.start = function () {
      if (!eng.available || started) return;
      started = true;
      eng.currentTrack = eng.defaultTrack;
      begin(eng.defaultTrack);
      if (typeof g.addEventListener === 'function' && !eng._onlineHook) {
        eng._onlineHook = function () { if (cur && cur.role === 'fallback' && cur.recoverTimer) { timers.clearTimeout(cur.recoverTimer); cur.recoverTimer = null; scheduleRecover(cur); } };
        try { g.addEventListener('online', eng._onlineHook); } catch (e) { /* ignore */ }
      }
    };

    eng.setTrack = function (name) {
      var wanted = (name === 'christmas') ? 'christmas' : eng.defaultTrack;
      if (!eng.available || !started) return;
      if (!swapping && cur && cur.name === wanted) return;
      if (swapping && pendingBegin && eng._pendingName === wanted) return;
      eng._pendingName = wanted;
      transition(function () { eng._pendingName = null; begin(wanted); });
    };

    function refresh() { if (eng.available && started && cur) { var n = cur.name; eng._pendingName = n; transition(function () { eng._pendingName = null; begin(n); }); } }
    eng.setSource = function (v) { v = v === 'incluida' ? 'incluida' : 'stream'; if (v !== eng.source) { eng.source = v; if (cur && cur.name === 'ambient') refresh(); } };
    eng.setStation = function (id) { if (id && id !== eng.station) { eng.station = id; if (cur && cur.name === 'ambient' && eng.source === 'stream') refresh(); } };
    eng.setChristmasSource = function (v) { v = v === 'radio' ? 'radio' : 'carols'; if (v !== eng.christmasSource) { eng.christmasSource = v; if (cur && cur.name === 'christmas') refresh(); } };

    eng.setEnabled = function (on) {
      eng.enabled = !!on;
      if (muteTimer !== null) { timers.clearTimeout(muteTimer); muteTimer = null; }
      if (cur) {
        if (!eng.enabled) {
          applyVolume(cur); // volume 0 right away; stop downloading shortly after
          muteTimer = timers.setTimeout(function () { muteTimer = null; if (!eng.enabled && cur && cur.player) cur.player.stop(); }, 700);
        } else {
          applyVolume(cur);
          if (cur.player && cur.player.state === 'idle') cur.player.start();
        }
      }
      status();
    };

    eng.setVolume = function (v) { eng.volume = clamp01(v); if (cur) applyVolume(cur); };

    /* Key press: start playback if the browser blocked autoplay, resume the analyser context. */
    eng.unlock = function () {
      if (!eng.available || !eng.needsGesture) return;
      try {
        if (cur && cur.player) cur.player.kick();
        if (ctx && typeof ctx.resume === 'function') {
          var p = ctx.resume();
          if (p && p.then) p.then(function () { eng.ctxSuspended = ctx.state === 'suspended'; recomputeGesture(); status(); }, function () { /* ignore */ });
        }
        eng.ctxSuspended = !!ctx && ctx.state === 'suspended' && typeof ctx.resume !== 'function';
        eng.streamBlocked = false; recomputeGesture();
      } catch (e) { eng.error = e; }
      status();
    };

    /* Real spectrum into `arr`, or false when there is no trustworthy one (no analyser, audio off or blocked,
     * the track is not playing, or the analyser has read only zeros for ~2 s) so the visualizer simulates. */
    eng.getSpectrum = function (arr) {
      if (!analyser || !eng.enabled || eng.needsGesture || !cur || eng.streamState !== 'playing' || !analyser.getByteFrequencyData) return false;
      try {
        analyser.getByteFrequencyData(arr);
        var peak = 0;
        for (var i = 0; i < arr.length; i++) if (arr[i] > peak) peak = arr[i];
        var t = now();
        if (peak > 0) { silentSince = 0; return true; }
        if (!silentSince) silentSince = t;
        return t - silentSince < SILENCE_MS; // brief silence is real; a long run of zeros is a dead tap
      } catch (e) { return false; }
    };
    eng.binCount = function () { return analyser ? analyser.frequencyBinCount : 0; };

    /* Short Spanish description of what is playing, for the settings screen. */
    eng.describe = function () {
      if (!eng.available) return 'sin audio';
      if (!cur || !cur.player) return 'en pausa';
      var st = cur.player.state, fb = cur.role === 'fallback';
      if (st === 'blocked') return 'pulsa una tecla para activar el sonido';
      if (st === 'idle') return 'en pausa';
      if (cur.kind === 'file') return fb ? 'sin conexión: música incluida' : 'música incluida';
      if (st === 'playing') return 'radio en línea';
      return 'conectando…';
    };
    eng.dispose = function () { if (cur) teardown(cur); cur = null; };
    eng._debug = function () { return { ctx: ctx, analyser: analyser, cur: cur, swapping: swapping }; };
    return eng;
  }

  var api = { createEngine: createEngine, FADE_OUT: FADE_OUT, FADE_IN: FADE_IN, RECOVER_MS: RECOVER_MS, SILENCE_MS: SILENCE_MS };
  E.audio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
