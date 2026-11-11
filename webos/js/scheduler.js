/* Scheduler: shuffle bag over enabled widgets, pause between widgets, pause/resume/skip/prev/run-now.
 * Pure logic with an injectable clock so it runs in Node tests. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  function AbortError(msg) {
    var e = new Error(msg || 'aborted');
    e.name = 'AbortError';
    return e;
  }
  function isAbort(e) { return !!e && e.name === 'AbortError'; }

  // Minimal abort signal (AbortController is missing on older webOS engines).
  function Signal() { this.aborted = false; this._cbs = []; }
  Signal.prototype.abort = function () {
    if (this.aborted) return;
    this.aborted = true;
    var cbs = this._cbs; this._cbs = [];
    cbs.forEach(function (cb) { try { cb(); } catch (e) { /* ignore */ } });
  };
  Signal.prototype.onAbort = function (cb) {
    if (this.aborted) cb(); else this._cbs.push(cb);
  };
  Signal.prototype.offAbort = function (cb) {
    var i = this._cbs.indexOf(cb); if (i >= 0) this._cbs.splice(i, 1);
  };

  var realClock = {
    now: function () { return Date.now(); },
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (t) { clearTimeout(t); }
  };

  /* Shuffle bag: every item is played once per round, in random order; the first item of a
   * new round never repeats the last one of the previous round. */
  function ShuffleBag(rng) {
    this.rng = rng || Math.random;
    this.bag = [];
    this.last = null;
  }
  ShuffleBag.prototype._shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  ShuffleBag.prototype.next = function (items) {
    var self = this;
    this.bag = this.bag.filter(function (id) { return items.indexOf(id) >= 0; });
    if (!items.length) return null;
    if (!this.bag.length) {
      this.bag = this._shuffle(items.slice());
      // bag is consumed from the end: avoid the last played item being popped first
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.last) {
        var k = Math.floor(this.rng() * (this.bag.length - 1));
        var tmp = this.bag[k]; this.bag[k] = this.bag[this.bag.length - 1]; this.bag[this.bag.length - 1] = tmp;
      }
    }
    var id = this.bag.pop();
    self.last = id;
    return id;
  };

  function Picker(rng) { this.bag = new ShuffleBag(rng); this.lastSeq = null; }
  Picker.prototype.pick = function (enabledIds, order) {
    if (!enabledIds.length) return null;
    if (order === 'sequence') {
      var i = this.lastSeq === null ? -1 : enabledIds.indexOf(this.lastSeq);
      var id;
      if (i < 0 && this.lastSeq !== null) {
        id = enabledIds[0]; // last one was disabled: restart
      } else id = enabledIds[(i + 1) % enabledIds.length];
      this.lastSeq = id;
      return id;
    }
    return this.bag.next(enabledIds);
  };

  /* deps: {getEnabled(): ids[], getPauseSeconds(), getOrder(), runWidget(id, control): Promise,
   *        onEvent(type, data), rng, clock} */
  function Scheduler(deps) {
    this.deps = deps;
    this.clock = deps.clock || realClock;
    this.picker = new Picker(deps.rng);
    this.running = false;
    this.paused = false;
    this.pinned = false;     // session-only: keep the current mode (it never moves on by itself)
    this.pausedAt = 0;
    this.pausedTotal = 0;
    this.current = null;
    this.history = [];
    this.forced = null;
    this.signal = null;
  }

  Scheduler.prototype._emit = function (type, data) {
    if (this.deps.onEvent) { try { this.deps.onEvent(type, data); } catch (e) { /* ignore */ } }
  };

  // Clock that does not advance while paused: widget animations freeze.
  Scheduler.prototype.activeNow = function () {
    var n = this.clock.now();
    return n - this.pausedTotal - (this.paused ? n - this.pausedAt : 0);
  };

  Scheduler.prototype.sleep = function (ms, signal) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) return reject(AbortError());
      var target = self.activeNow() + ms, timer = null;
      function onAbort() { self.clock.clearTimeout(timer); reject(AbortError()); }
      function tick() {
        var remaining = target - self.activeNow();
        if (remaining <= 0) { if (signal) signal.offAbort(onAbort); return resolve(); }
        timer = self.clock.setTimeout(tick, self.paused ? 50 : Math.min(remaining, 50));
      }
      if (signal) signal.onAbort(onAbort);
      tick();
    });
  };

  Scheduler.prototype.start = function () {
    if (this.running) return this._done;
    this.running = true;
    this._done = this._loop();
    return this._done;
  };

  Scheduler.prototype.stop = function () {
    this.running = false;
    if (this.signal) this.signal.abort();
    return this._done;
  };

  Scheduler.prototype.pause = function () {
    if (this.paused) return;
    this.paused = true; this.pausedAt = this.clock.now();
    this._emit('pause', true);
  };
  Scheduler.prototype.resume = function () {
    if (!this.paused) return;
    this.pausedTotal += this.clock.now() - this.pausedAt;
    this.paused = false;
    this._emit('pause', false);
  };
  Scheduler.prototype.togglePause = function () { if (this.paused) this.resume(); else this.pause(); };

  /* Pin ("fijar"): the running widget keeps animating past its duration (see ctx.loop) and finished one-shot widgets
   * are re-run at once. Manual next/prev/run-now still change mode and the pin follows the new mode. */
  Scheduler.prototype.setPin = function (on) {
    on = !!on;
    if (on === this.pinned) return;
    this.pinned = on;
    this._emit('pin', on);
  };
  Scheduler.prototype.togglePin = function () { this.setPin(!this.pinned); };

  Scheduler.prototype.skip = function () {
    if (this.paused) this.resume();
    if (this.signal) this.signal.abort();
  };

  Scheduler.prototype.prev = function () {
    if (this.history.length >= 2) {
      this.history.pop();
      this.forced = this.history.pop();
    }
    this.skip();
  };

  Scheduler.prototype.runNow = function (id) {
    this.forced = id;
    this.skip();
  };

  Scheduler.prototype._loop = async function () {
    while (this.running) {
      var id = this.forced; this.forced = null;
      if (!id) id = this.picker.pick(this.deps.getEnabled(), this.deps.getOrder());
      if (!id) {
        this._emit('idle', null);
        this.signal = new Signal();
        try { await this.sleep(1000, this.signal); } catch (e) { /* skipped */ }
        continue;
      }
      this.current = id;
      if (this.history[this.history.length - 1] !== id) this.history.push(id); // a pinned re-run is the same entry
      if (this.history.length > 30) this.history.shift();
      this.signal = new Signal();
      var sig = this.signal;
      var control = {
        signal: sig,
        sleep: this.sleep.bind(this),
        activeNow: this.activeNow.bind(this),
        isPaused: function () { return this.paused; }.bind(this),
        isPinned: function () { return this.pinned; }.bind(this)
      };
      control.sleep = function (ms) { return this.sleep(ms, sig); }.bind(this);
      this._emit('start', id);
      try {
        await this.deps.runWidget(id, control);
      } catch (e) {
        if (!isAbort(e)) {
          this._emit('error', { id: id, error: e });
          this.signal = new Signal();
          try { await this.sleep(1500, this.signal); } catch (e2) { /* skipped */ }
        }
      }
      this._emit('end', id);
      this.current = null;
      if (!this.running) break;
      if (this.pinned && !this.forced && !sig.aborted) this.forced = id; // pinned one-shot finished: re-run now, no gap
      if (!this.forced) {
        var pauseMs = Math.max(0, Number(this.deps.getPauseSeconds()) || 0) * 1000;
        if (pauseMs > 0) {
          this.signal = new Signal();
          this._emit('gap', pauseMs);
          try { await this.sleep(pauseMs, this.signal); } catch (e3) { /* skipped */ }
        }
      }
    }
  };

  var api = { Signal: Signal, AbortError: AbortError, isAbort: isAbort, ShuffleBag: ShuffleBag, Picker: Picker, Scheduler: Scheduler };
  E.scheduler = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
