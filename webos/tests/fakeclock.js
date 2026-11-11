// Deterministic fake timers: advance(ms) runs everything that becomes due, in order.
class FakeClock {
  constructor() { this.now = 0; this.q = []; this.seq = 0; }
  setTimeout(fn, ms) { const id = ++this.seq; this.q.push({ id, at: this.now + (ms || 0), fn, every: 0 }); return id; }
  setInterval(fn, ms) { const id = ++this.seq; this.q.push({ id, at: this.now + ms, fn, every: ms }); return id; }
  clearTimeout(id) { this.q = this.q.filter(t => t.id !== id); }
  clearInterval(id) { this.clearTimeout(id); }
  pending() { return this.q.length; }
  advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const due = this.q.filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.now = due.at;
      if (due.every) due.at += due.every; else this.q = this.q.filter(t => t !== due);
      due.fn();
    }
    this.now = end;
  }
}
// Fake HTMLAudioElement: records calls and lets tests emit media events.
class FakeAudio {
  constructor(playResult) { this.listeners = {}; this.plays = 0; this.paused = true; this._src = ''; this.volume = 1; this.playResult = playResult; FakeAudio.all.push(this); }
  get src() { return this._src; }
  set src(v) { this._src = v; FakeAudio.srcLog.push([this, v]); }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); }
  play() { this.plays++; this.paused = false; return typeof this.playResult === 'function' ? this.playResult() : this.playResult; }
  pause() { this.paused = true; }
  removeAttribute(a) { if (a === 'src') this.src = ''; }
  load() {}
  emit(t) { (this.listeners[t] || []).slice().forEach(f => f({ type: t })); }
  listenerCount() { return Object.keys(this.listeners).reduce((n, k) => n + this.listeners[k].length, 0); }
}
FakeAudio.all = [];
FakeAudio.srcLog = [];
module.exports = { FakeClock, FakeAudio };
