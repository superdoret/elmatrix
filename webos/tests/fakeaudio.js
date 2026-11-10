// Minimal recording fake of the Web Audio API for engine tests.
class Param {
  constructor(v) { this._v = v || 0; this.events = []; }
  get value() { return this._v; }
  set value(v) { this._v = v; this.events.push({ type: 'assign', value: v, time: 0 }); }
  setValueAtTime(v, t) { this._v = v; this.events.push({ type: 'set', value: v, time: t }); return this; }
  linearRampToValueAtTime(v, t) { this._v = v; this.events.push({ type: 'ramp', value: v, time: t }); return this; }
  cancelScheduledValues(t) { this.events.push({ type: 'cancel', time: t }); return this; }
}
class Node {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.out = []; this.disconnected = false; ctx.nodes.push(this); }
  connect(n) { this.out.push(n); return n; }
  disconnect() { this.out = []; this.disconnected = true; }
}
class FakeAudioContext {
  constructor() { this.nodes = []; this.currentTime = 0; this.sampleRate = 8000; this.state = FakeAudioContext.initialState || 'running'; this.destination = new Node(this, 'destination'); }
  _n(kind, params, extra) { const n = new Node(this, kind); Object.keys(params || {}).forEach(k => { n[k] = new Param(params[k]); }); return Object.assign(n, extra); }
  createGain() { return this._n('gain', { gain: 1 }); }
  createOscillator() { const n = this._n('osc', { frequency: 440 }, { type: 'sine', started: null, stopped: null }); n.start = t => { n.started = t; }; n.stop = t => { n.stopped = t; }; return n; }
  createBiquadFilter() { return this._n('filter', { frequency: 350, Q: 1 }, { type: 'lowpass' }); }
  createDynamicsCompressor() { return this._n('comp', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 }); }
  createConvolver() { return this._n('convolver', {}, { buffer: null }); }
  createDelay() { return this._n('delay', { delayTime: 0 }); }
  createAnalyser() { return this._n('analyser', {}, { fftSize: 2048, frequencyBinCount: 512, smoothingTimeConstant: 0, getByteFrequencyData(a) { a.fill(100); } }); }
  createBuffer(ch, len) { const d = []; for (let i = 0; i < ch; i++) d.push(new Float32Array(len)); return { getChannelData: i => d[i], length: len }; }
  createMediaElementSource(el) { if (FakeAudioContext.failRouting) throw new Error('InvalidStateError'); const n = this._n('mediaSource', {}); n.element = el; return n; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  of(kind) { return this.nodes.filter(n => n.kind === kind); }
}
FakeAudioContext.initialState = 'running';
module.exports = { FakeAudioContext, Param };
