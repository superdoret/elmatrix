/* Stream player state machine for one radio URL on an HTMLAudioElement (no fetch/MediaSource/promises needed:
 * Chromium 38 compatible). Pure logic over injected dependencies, so it is unit tested with a fake element and clock.
 *
 * States: idle -> connecting -> playing; failures -> backoff (retry 2 s, 4 s, ...) ; after 3 consecutive failures or
 * while offline -> fallback (caller plays synthesized music) with a background retry every few minutes;
 * a successful retry reports 'recovered'. 'blocked' = the browser refused to autoplay (waits for a key press). */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  var MAX_FAILURES = 3;
  var CONNECT_TIMEOUT = 15000;   // no 'playing' within this long after connecting = failure
  var STALL_TIMEOUT = 15000;     // 'waiting'/'stalled' longer than this = failure
  var BACKOFF_CAP = 60000;
  var BG_RETRY = 180000;         // retry period while in fallback

  function backoffMs(failures) { return Math.min(BACKOFF_CAP, 2000 * Math.pow(2, Math.max(0, failures - 1))); }

  /* deps: {url, createElement(), timers:{setTimeout, clearTimeout}, isOnline(), onChange(state, info),
   *        onElement(el)?, loop? (bundled files), maxFailures? (default 3)} */
  function StreamPlayer(deps) {
    this.d = deps;
    this.state = 'idle';
    this.failures = 0;
    this.fallback = false;      // true while the caller is using the synth because of failures
    this.el = null;
    this.timers = { watchdog: null, retry: null, stall: null };
    this.listeners = null;
    this.gen = 0;               // bumped by stop(): timers scheduled before a stop() must not fire after it
  }

  StreamPlayer.prototype._emit = function (state, info) {
    this.state = state;
    if (this.d.onChange) { try { this.d.onChange(state, info || {}); } catch (e) { /* never break playback logic */ } }
  };
  StreamPlayer.prototype._clear = function (name) {
    if (this.timers[name] !== null) { this.d.timers.clearTimeout(this.timers[name]); this.timers[name] = null; }
  };
  StreamPlayer.prototype._online = function () {
    try { return this.d.isOnline ? this.d.isOnline() !== false : true; } catch (e) { return true; }
  };

  StreamPlayer.prototype._teardown = function () {
    var el = this.el, self = this;
    this._clear('watchdog');
    if (!el) return;
    if (this.listeners) Object.keys(this.listeners).forEach(function (t) { try { el.removeEventListener(t, self.listeners[t]); } catch (e) { /* ignore */ } });
    this.listeners = null; this.el = null;
    try { el.pause(); } catch (e) { /* ignore */ }
    try { el.removeAttribute('src'); if (el.load) el.load(); } catch (e2) { /* ignore: aborts the download */ }
  };

  StreamPlayer.prototype.start = function () {
    this._clear('retry');
    if (this.el) return;
    if (!this._online()) { this._failure('offline'); return; }
    this._connect();
  };

  StreamPlayer.prototype._connect = function () {
    var self = this, el;
    try { el = this.d.createElement(); } catch (e) { this._failure('no-audio'); return; }
    this.el = el;
    el.crossOrigin = 'anonymous';
    el.preload = 'none';
    if (this.d.loop) el.loop = true;
    if (this.d.onElement) { try { this.d.onElement(el); } catch (e3) { /* routing is optional */ } }
    this.listeners = {
      playing: function () { self._onPlaying(); },
      timeupdate: function () { self._clear('stall'); if (self.state === 'connecting') self._onPlaying(); },
      error: function () { self._failure('error'); },
      stalled: function () { self._stallWatch(); },
      waiting: function () { self._stallWatch(); },
      ended: function () { if (self.d.loop) { try { el.currentTime = 0; self._play(); } catch (e4) { self._failure('ended'); } } else self._failure('ended'); }
    };
    Object.keys(this.listeners).forEach(function (t) { el.addEventListener(t, self.listeners[t]); });
    this._emit('connecting', { fallback: this.fallback });
    this.timers.watchdog = this.d.timers.setTimeout(function () { self.timers.watchdog = null; self._failure('timeout'); }, CONNECT_TIMEOUT);
    el.src = this.d.url;
    this._play();
  };

  // play() may return undefined (Chromium 38) or a promise (newer engines): never assume.
  StreamPlayer.prototype._play = function () {
    var self = this, el = this.el;
    if (!el) return;
    try {
      var p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(null, function (err) {
          if (self.el !== el) return;
          if (err && err.name === 'NotAllowedError') { self._clear('watchdog'); self._emit('blocked', {}); } // wait for a key press
          else if (err && err.name !== 'AbortError') self._failure('play-rejected');
        });
      }
    } catch (e) { this._failure('play-threw'); }
  };

  /* After a key press: try to start playback again if the browser had blocked it. */
  StreamPlayer.prototype.kick = function () {
    if (this.state === 'blocked' && this.el) {
      var self = this;
      this._emit('connecting', { fallback: this.fallback });
      this._clear('watchdog');
      this.timers.watchdog = this.d.timers.setTimeout(function () { self.timers.watchdog = null; self._failure('timeout'); }, CONNECT_TIMEOUT);
      this._play();
    }
  };

  StreamPlayer.prototype._onPlaying = function () {
    this._clear('watchdog'); this._clear('stall');
    this.failures = 0;
    var recovered = this.fallback;
    this.fallback = false;
    if (this.state !== 'playing') this._emit('playing', { recovered: recovered });
  };

  StreamPlayer.prototype._stallWatch = function () {
    if (this.state !== 'playing' && this.state !== 'connecting') return;
    if (this.timers.stall !== null) return;
    var self = this;
    this.timers.stall = this.d.timers.setTimeout(function () { self.timers.stall = null; self._failure('stall'); }, STALL_TIMEOUT);
  };
  StreamPlayer.prototype._clearStall = function () { this._clear('stall'); };

  StreamPlayer.prototype._failure = function (reason) {
    var self = this;
    this._teardown(); this._clear('stall'); this._clear('retry');
    this.failures++;
    var gen = this.gen;
    if (this.fallback) { // already on the fallback: just keep trying quietly in the background
      this._emit('fallback', { reason: reason, background: true });
      if (this.gen !== gen) return; // the owner stopped this player in its callback
      this.timers.retry = this.d.timers.setTimeout(function () { self.timers.retry = null; self.start(); }, BG_RETRY);
      return;
    }
    if (this.failures >= (this.d.maxFailures || MAX_FAILURES) || !this._online()) {
      this.fallback = true;
      this._emit('fallback', { reason: reason, failures: this.failures });
      if (this.gen !== gen) return;
      this.timers.retry = this.d.timers.setTimeout(function () { self.timers.retry = null; self.start(); }, BG_RETRY);
      return;
    }
    var delay = backoffMs(this.failures);
    this._emit('backoff', { reason: reason, delay: delay, failures: this.failures });
    if (this.gen !== gen) return;
    this.timers.retry = this.d.timers.setTimeout(function () { self.timers.retry = null; self.start(); }, delay);
  };

  /* Network came back (window 'online'): retry right away. */
  StreamPlayer.prototype.retryNow = function () {
    if (this.state === 'fallback' || this.state === 'backoff') { this._clear('retry'); this.start(); }
  };

  StreamPlayer.prototype.stop = function () {
    this.gen++;
    this._clear('retry'); this._teardown(); this._clear('stall');
    this.failures = 0; this.fallback = false;
    this.state = 'idle';
  };

  StreamPlayer.prototype.element = function () { return this.el; };

  var api = { StreamPlayer: StreamPlayer, backoffMs: backoffMs, MAX_FAILURES: MAX_FAILURES, CONNECT_TIMEOUT: CONNECT_TIMEOUT, STALL_TIMEOUT: STALL_TIMEOUT, BG_RETRY: BG_RETRY, BACKOFF_CAP: BACKOFF_CAP };
  E.stream = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
