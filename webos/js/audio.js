/* Audio engine: Web Audio rendering layer for the generative music (js/music/*).
 * Graph: voices -> track bus -> master gain -> compressor -> destination, with a generated-impulse
 * reverb and a feedback delay as sends, and an AnalyserNode tap for the visualizer.
 * Written for Chromium 38: webkitAudioContext fallback, no suspend/resume (mute = gain), no worklets,
 * no stereo panner, no promise-based decodeAudioData. Every failure degrades to silence, never throws. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  var LOOKAHEAD = 4;        // seconds of music scheduled in advance
  var PUMP_MS = 400;
  var CROSSFADE = 3;        // seconds
  var MASTER_SCALE = 0.7;   // volume 1.0 maps to this master gain (headroom)
  var TRACKS = { ambient: { reverb: 0.55, delay: 0.22 }, christmas: { reverb: 0.8, delay: 0.3 } };

  // ---- pure helpers ----------------------------------------------------------
  /* Impulse response channel data: decaying noise (exponent controls the tail shape). */
  function buildImpulse(length, decayPower, rng) {
    var out = new Float32Array(length);
    for (var i = 0; i < length; i++) out[i] = (rng() * 2 - 1) * Math.pow(1 - i / length, decayPower);
    return out;
  }

  function clamp01(v) { v = Number(v); return v !== v ? 0 : Math.max(0, Math.min(1, v)); }

  // Ramp a param from its current value (no jump): used for gain changes.
  function rampTo(param, value, now, secs) {
    if (param.cancelScheduledValues) param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + secs);
  }

  // ---- voices -----------------------------------------------------------------
  // Every envelope starts at 0 and ends at 0 with linear ramps: no clicks.
  function playPad(ctx, dest, t, notes, dur, vel, o) {
    o = o || {};
    var attack = o.attack || 2.5, release = o.release || 3.5, end = t + dur + release;
    var env = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = o.cutoff || 900; lp.Q.value = 0.6;
    var peak = vel * 0.8 / Math.max(2, notes.length);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.setValueAtTime(peak, t + Math.max(dur, attack));
    env.gain.linearRampToValueAtTime(0, end);
    lp.connect(env); env.connect(dest);
    var T = E.theory;
    notes.forEach(function (m) {
      var f = T.midiToFreq(m);
      [['triangle', 0.997], ['sine', 1.003]].forEach(function (layer) {
        var osc = ctx.createOscillator();
        osc.type = layer[0]; osc.frequency.value = f * layer[1];
        osc.connect(lp); osc.start(t); osc.stop(end + 0.1);
      });
    });
  }

  // Plucked (sine + octave) or bell/music-box (inharmonic partial) note with exponential-like decay.
  function playPluck(ctx, dest, t, midi, dur, vel, bell) {
    var f = E.theory.midiToFreq(midi), end = t + dur;
    var env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel * 0.5, t + 0.012);
    env.gain.linearRampToValueAtTime(vel * 0.12, t + Math.min(0.4, dur * 0.3));
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(dest);
    var partials = bell ? [[1, 1], [2.76, 0.28], [5.4, 0.1]] : [[1, 1], [2, 0.25]];
    partials.forEach(function (p) {
      var osc = ctx.createOscillator(), pg = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = f * p[0];
      pg.gain.setValueAtTime(0, t);
      pg.gain.linearRampToValueAtTime(p[1], t + 0.012);
      pg.gain.linearRampToValueAtTime(0, t + dur * (p[0] === 1 ? 1 : 0.45));
      osc.connect(pg); pg.connect(env);
      osc.start(t); osc.stop(end + 0.1);
    });
  }

  function scheduleBlock(ctx, bus, base, block) {
    block.events.forEach(function (ev) {
      var t = base + ev.t;
      if (ev.kind === 'pad') playPad(ctx, bus, t, ev.notes, ev.dur, ev.vel, { attack: ev.attack, release: ev.release, cutoff: ev.cutoff });
      else playPluck(ctx, bus, t, ev.notes[0], ev.dur, ev.vel, ev.kind === 'bell');
    });
  }

  // ---- engine ---------------------------------------------------------------------
  /* opts: {AudioContext (override, null = unavailable), seed, source, station, christmasSource,
   *        timers:{setInterval, clearInterval, setTimeout, clearTimeout}, createElement(), isOnline(), onStatus}
   * Sources: 'stream' = SomaFM radio through an <audio> element (synth = automatic fallback),
   *          'synth' = procedural music only. The christmas track is the synthesized carols unless
   *          christmasSource === 'radio'. */
  function createEngine(opts) {
    opts = opts || {};
    var Ctor = opts.AudioContext !== undefined ? opts.AudioContext : (g.AudioContext || g.webkitAudioContext || null);
    var timers = opts.timers || {
      setInterval: function (f, ms) { return setInterval(f, ms); }, clearInterval: function (t) { clearInterval(t); },
      setTimeout: function (f, ms) { return setTimeout(f, ms); }, clearTimeout: function (t) { clearTimeout(t); }
    };
    var createElement = opts.createElement || (typeof g.Audio === 'function' ? function () { return new g.Audio(); } : null);
    var isOnline = opts.isOnline || function () { return !(typeof navigator !== 'undefined' && navigator.onLine === false); };
    var rng = E.theory.mulberry32(opts.seed);
    var ctx = null, nodes = null, timer = null, active = null, gens = {}, muteTimer = null;
    var eng = {
      available: false, webAudio: false, enabled: true, volume: 0.35, needsGesture: false, defaultTrack: 'ambient', currentTrack: null, error: null,
      source: opts.source || 'stream', station: opts.station || 'dronezone', christmasSource: opts.christmasSource || 'carols',
      streamState: 'idle', streamBlocked: false, ctxSuspended: false
    };

    function status() { if (opts.onStatus) { try { opts.onStatus(eng); } catch (e) { /* ignore */ } } }
    function level() { return eng.enabled ? eng.volume * MASTER_SCALE : 0; }
    function recomputeGesture() { eng.needsGesture = eng.ctxSuspended || eng.streamBlocked; }
    function wantsStream(name) { return !!createElement && (name === 'christmas' ? eng.christmasSource === 'radio' : eng.source === 'stream'); }

    function buildGraph() {
      var c = ctx, n = {};
      n.master = c.createGain(); n.master.gain.value = 0;
      n.comp = c.createDynamicsCompressor();
      n.comp.threshold.value = -20; n.comp.knee.value = 24; n.comp.ratio.value = 6; n.comp.attack.value = 0.01; n.comp.release.value = 0.3;
      n.master.connect(n.comp); n.comp.connect(c.destination);
      // analyser tap, kept alive through a silent gain (old engines only pull connected nodes)
      n.analyser = c.createAnalyser(); n.analyser.fftSize = 1024; n.analyser.smoothingTimeConstant = 0.8;
      n.tap = c.createGain(); n.tap.gain.value = 0;
      n.comp.connect(n.analyser); n.analyser.connect(n.tap); n.tap.connect(c.destination);
      // reverb: generated impulse response
      n.convolver = c.createConvolver();
      var len = Math.floor(c.sampleRate * 3.4), buf = c.createBuffer(2, len, c.sampleRate);
      for (var ch = 0; ch < 2; ch++) buf.getChannelData(ch).set(buildImpulse(len, 2.6, rng));
      n.convolver.buffer = buf;
      n.wet = c.createGain(); n.wet.gain.value = 0.8;
      n.convolver.connect(n.wet); n.wet.connect(n.master);
      // feedback delay with a darkening filter in the loop
      n.delay = c.createDelay(2); n.delay.delayTime.value = 0.47;
      n.fbFilter = c.createBiquadFilter(); n.fbFilter.type = 'lowpass'; n.fbFilter.frequency.value = 1800;
      n.fb = c.createGain(); n.fb.gain.value = 0.36;
      n.delay.connect(n.fbFilter); n.fbFilter.connect(n.fb); n.fb.connect(n.delay);
      n.delayOut = c.createGain(); n.delayOut.gain.value = 0.7;
      n.delay.connect(n.delayOut); n.delayOut.connect(n.master);
      nodes = n;
    }

    function makeBus(name) {
      var cfg = TRACKS[name], bus = ctx.createGain();
      bus.gain.setValueAtTime(0, ctx.currentTime);
      bus.connect(nodes.master);
      var rv = ctx.createGain(); rv.gain.value = cfg.reverb; bus.connect(rv); rv.connect(nodes.convolver);
      var dl = ctx.createGain(); dl.gain.value = cfg.delay; bus.connect(dl); dl.connect(nodes.delay);
      return bus;
    }

    function makeGen(name) {
      if (!gens[name]) gens[name] = name === 'christmas' ? E.carols.createChristmas(Math.floor(rng() * 4294967296)) : E.theory.createAmbient(Math.floor(rng() * 4294967296));
      return gens[name];
    }

    // ---- element volume fallback (no Web Audio routing): linear steps with timers ----
    function elTarget(slot) { return slot.elLevel * (eng.enabled ? eng.volume : 0); }
    function applyElementVolume(slot) {
      var el = slot.player && slot.player.element();
      if (el && slot.elVol) { try { el.volume = Math.max(0, Math.min(1, elTarget(slot))); } catch (e) { /* ignore */ } }
    }
    function fadeElement(slot, to, secs) {
      var from = slot.elLevel, steps = Math.max(1, Math.round(secs * 5)), i = 0;
      if (slot.fadeTimer) timers.clearTimeout(slot.fadeTimer);
      (function step() {
        i++; slot.elLevel = from + (to - from) * (i / steps); applyElementVolume(slot);
        if (i < steps) slot.fadeTimer = timers.setTimeout(step, 200); else slot.fadeTimer = null;
      })();
    }
    function fadeStream(slot, to, secs) {
      if (slot.streamGain) rampTo(slot.streamGain.gain, to, ctx.currentTime, secs);
      if (slot.elVol || !slot.streamGain) fadeElement(slot, to, secs);
    }

    function setSynth(slot, on, secs) {
      if (!nodes || on === slot.synthOn) return;
      slot.synthOn = on;
      rampTo(slot.bus.gain, on ? 1 : 0, ctx.currentTime, secs);
      if (on) slot.cursor = ctx.currentTime + 0.2;
    }

    function routeElement(slot, el) {
      slot.elVol = true;
      if (!nodes) { applyElementVolume(slot); return; }
      try {
        var src = ctx.createMediaElementSource(el);
        src.connect(slot.streamGain);
        slot.elVol = false;
        try { el.volume = 1; } catch (e) { /* ignore */ }
      } catch (e2) { slot.elVol = true; applyElementVolume(slot); }
    }

    function startStream(slot) {
      var ST = E.stations, station = ST.forTrack(slot.name, eng.station);
      slot.streamGain = nodes ? ctx.createGain() : null;
      if (slot.streamGain) { slot.streamGain.gain.setValueAtTime(0, ctx.currentTime); slot.streamGain.connect(nodes.master); }
      slot.elLevel = 0; slot.elVol = !nodes;
      slot.player = new E.stream.StreamPlayer({
        url: station.url, createElement: createElement, timers: timers, isOnline: isOnline,
        onElement: function (el) { routeElement(slot, el); },
        onChange: function (state, info) {
          if (active === slot) { eng.streamState = state; eng.streamBlocked = state === 'blocked'; recomputeGesture(); }
          if (state === 'playing') { fadeStream(slot, 1, CROSSFADE); setSynth(slot, false, CROSSFADE); }
          else if (state === 'fallback') { fadeStream(slot, 0, 1); setSynth(slot, true, CROSSFADE); }
          if (active === slot) status();
          void info;
        }
      });
      if (eng.enabled) slot.player.start(); // muted: stay idle (no download) until re-enabled
    }

    function activate(name) {
      var now = ctx ? ctx.currentTime : 0, old = active;
      var slot = { name: name, bus: null, gen: null, cursor: now + 0.2, synthOn: false, player: null, streamGain: null, elLevel: 0, elVol: false, fadeTimer: null };
      if (nodes) {
        slot.bus = makeBus(name); slot.gen = makeGen(name);
        if (!wantsStream(name)) { slot.synthOn = true; slot.bus.gain.linearRampToValueAtTime(1, now + CROSSFADE); }
      }
      active = slot;
      eng.currentTrack = name;
      eng.streamState = 'idle'; eng.streamBlocked = false;
      if (wantsStream(name)) startStream(slot);
      recomputeGesture();
      if (old) retire(old);
    }

    function retire(old) {
      var now = ctx ? ctx.currentTime : 0;
      if (nodes) {
        if (old.bus) rampTo(old.bus.gain, 0, now, CROSSFADE);
        if (old.streamGain) rampTo(old.streamGain.gain, 0, now, CROSSFADE);
      }
      if (old.elVol || !nodes) fadeElement(old, 0, CROSSFADE);
      timers.setTimeout(function () {
        if (old.player) old.player.stop();
        try { if (old.bus) old.bus.disconnect(); if (old.streamGain) old.streamGain.disconnect(); } catch (e) { /* ignore */ }
      }, (CROSSFADE + 0.5) * 1000);
    }

    function pump() {
      if (!eng.available || !active) return;
      if (ctx) {
        if (ctx.state === 'running' || ctx.state === undefined) { if (eng.ctxSuspended) { eng.ctxSuspended = false; recomputeGesture(); status(); } }
        if (active.cursor < ctx.currentTime) active.cursor = ctx.currentTime + 0.2; // never schedule in the past
      }
      if (!ctx || !active.synthOn || !eng.enabled || eng.needsGesture) return;
      var horizon = ctx.currentTime + LOOKAHEAD, guard = 0;
      while (active.cursor < horizon && guard++ < 4) {
        var block = active.gen.next();
        try { scheduleBlock(ctx, active.bus, active.cursor, block); } catch (e) { eng.error = e; }
        active.cursor += block.length;
      }
    }

    eng.init = function () {
      if (ctx || eng.available) return eng.available;
      if (Ctor) {
        try {
          ctx = new Ctor();
          buildGraph();
          eng.webAudio = true;
          eng.ctxSuspended = ctx.state === 'suspended';
        } catch (e) { eng.error = e; ctx = null; nodes = null; }
      }
      eng.available = eng.webAudio || !!createElement; // without Web Audio the radio still plays via element.volume
      recomputeGesture();
      status();
      return eng.available;
    };

    eng.start = function () {
      if (!eng.available || timer !== null) return;
      if (nodes) rampTo(nodes.master.gain, level(), ctx.currentTime, 1.2);
      activate(eng.defaultTrack);
      pump();
      if (nodes) timer = timers.setInterval(pump, PUMP_MS); else timer = -1;
      if (typeof g.addEventListener === 'function' && !eng._onlineHook) {
        eng._onlineHook = function () { if (active && active.player) active.player.retryNow(); };
        try { g.addEventListener('online', eng._onlineHook); } catch (e) { /* ignore */ }
      }
    };

    eng.setTrack = function (name) {
      var wanted = (name && TRACKS[name]) ? name : eng.defaultTrack;
      if (!eng.available || !active || active.name === wanted) return;
      activate(wanted);
      pump();
    };

    // Re-create the current track after the source or the station changed (crossfades).
    function refresh() { if (eng.available && active) { activate(active.name); pump(); } }
    eng.setSource = function (v) { v = v === 'synth' ? 'synth' : 'stream'; if (v !== eng.source) { eng.source = v; refresh(); } };
    eng.setStation = function (id) { if (id && id !== eng.station) { eng.station = id; if (active && active.name === 'ambient' && eng.source === 'stream') refresh(); } };
    eng.setChristmasSource = function (v) { v = v === 'radio' ? 'radio' : 'carols'; if (v !== eng.christmasSource) { eng.christmasSource = v; if (active && active.name === 'christmas') refresh(); } };

    eng.setEnabled = function (on) {
      eng.enabled = !!on;
      if (nodes) rampTo(nodes.master.gain, level(), ctx.currentTime, 0.5);
      if (active) {
        applyElementVolume(active);
        if (muteTimer !== null) { timers.clearTimeout(muteTimer); muteTimer = null; }
        if (!eng.enabled) {
          // stop downloading while muted (after the fade-out)
          muteTimer = timers.setTimeout(function () { muteTimer = null; if (!eng.enabled && active && active.player) active.player.stop(); }, 700);
        } else if (active.player && active.player.state === 'idle') active.player.start();
      }
      status();
    };

    eng.setVolume = function (v) {
      eng.volume = clamp01(v);
      if (nodes) rampTo(nodes.master.gain, level(), ctx.currentTime, 0.3);
      if (active) applyElementVolume(active);
    };

    /* Call from a user gesture (key press) when the browser started the context or the stream suspended. */
    eng.unlock = function () {
      if (!eng.available || !eng.needsGesture) return;
      try {
        if (active && active.player) active.player.kick();
        if (ctx && typeof ctx.resume === 'function') {
          var p = ctx.resume();
          if (p && p.then) p.then(function () { eng.ctxSuspended = ctx.state === 'suspended'; recomputeGesture(); status(); }, function () { /* stay silent */ });
        }
        eng.ctxSuspended = !!ctx && ctx.state === 'suspended' && typeof ctx.resume !== 'function';
        eng.streamBlocked = false; recomputeGesture();
      } catch (e) { eng.error = e; }
      status();
    };

    /* Fills `arr` (Uint8Array, length = frequencyBinCount) with the current spectrum. Returns false when there is
     * no real signal source (audio off/unavailable/suspended), so callers can simulate one. */
    eng.getSpectrum = function (arr) {
      if (!nodes || !eng.enabled || eng.needsGesture || !nodes.analyser.getByteFrequencyData) return false;
      try { nodes.analyser.getByteFrequencyData(arr); return true; } catch (e) { return false; }
    };
    eng.binCount = function () { return nodes ? nodes.analyser.frequencyBinCount : 0; };
    /* Short Spanish description of what is playing, for the settings screen. */
    eng.describe = function () {
      if (!eng.available) return 'sin audio';
      var radio = active && active.player;
      if (!radio) return 'música sintetizada';
      var st = radio.state;
      if (st === 'playing') return 'radio en línea';
      if (st === 'fallback') return 'sin conexión: música sintetizada';
      if (st === 'blocked') return 'pulsa una tecla para activar el sonido';
      if (st === 'idle') return 'en pausa';
      return 'conectando…';
    };
    eng.pump = pump;
    eng.dispose = function () { if (timer !== null && timer !== -1) timers.clearInterval(timer); timer = null; if (active && active.player) active.player.stop(); };
    eng._debug = function () { return { ctx: ctx, nodes: nodes, active: active }; };
    return eng;
  }

  var api = { createEngine: createEngine, buildImpulse: buildImpulse, rampTo: rampTo, playPad: playPad, playPluck: playPluck, CROSSFADE: CROSSFADE, LOOKAHEAD: LOOKAHEAD, TRACKS: TRACKS };
  E.audio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
