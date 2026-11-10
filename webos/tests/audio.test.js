const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const A = require('../js/audio.js');
const { FakeAudioContext } = require('./fakeaudio.js');

const { FakeClock } = require('./fakeclock.js');
function fakeTimers() { return new FakeClock(); }
function make(extra) {
  const timers = fakeTimers();
  const eng = A.createEngine(Object.assign({ AudioContext: FakeAudioContext, seed: 1, timers, source: 'synth', createElement: null }, extra));
  return { eng, timers };
}

test('without AudioContext the engine is silent but never throws', () => {
  const eng = A.createEngine({ AudioContext: null });
  assert.strictEqual(eng.init(), false);
  assert.strictEqual(eng.available, false);
  assert.doesNotThrow(() => { eng.start(); eng.setTrack('christmas'); eng.setEnabled(false); eng.setVolume(0.5); eng.unlock(); eng.pump(); });
  assert.strictEqual(eng.getSpectrum(new Uint8Array(8)), false);
});

test('a throwing AudioContext constructor degrades to silence', () => {
  const eng = A.createEngine({ AudioContext: function () { throw new Error('denied'); } });
  assert.strictEqual(eng.init(), false);
  assert.doesNotThrow(() => eng.start());
});

test('graph: voices -> bus -> master -> compressor -> destination, with reverb, delay and analyser taps', () => {
  const { eng } = make();
  assert.ok(eng.init());
  eng.start();
  const d = eng._debug(), n = d.nodes, ctx = d.ctx;
  assert.ok(n.master.out.includes(n.comp));
  assert.ok(n.comp.out.includes(ctx.destination));
  assert.ok(n.comp.out.includes(n.analyser));
  assert.ok(n.analyser.out.includes(n.tap) && n.tap.out.includes(ctx.destination)); // analyser kept alive, silent
  assert.strictEqual(n.tap.gain.value, 0);
  assert.ok(n.convolver.buffer && n.convolver.buffer.length > ctx.sampleRate * 3);
  assert.ok(n.convolver.out.includes(n.wet) && n.wet.out.includes(n.master));
  assert.ok(n.delay.out.includes(n.fbFilter) && n.fb.out.includes(n.delay)); // feedback loop
  assert.ok(n.fb.gain.value < 0.6, 'stable feedback');
  assert.ok(d.active.bus.out.includes(n.master) && d.active.bus.out.length === 3);
  assert.ok(n.comp.ratio.value > 1);
});

test('impulse response decays towards zero', () => {
  const ir = A.buildImpulse(4000, 2.6, () => 0.9);
  const head = Math.max.apply(null, Array.from(ir.slice(0, 200)).map(Math.abs));
  const tail = Math.max.apply(null, Array.from(ir.slice(3800)).map(Math.abs));
  assert.ok(head > 0.5 && tail < 0.02);
});

function pumpUntil(eng, ctx, seconds) {
  for (let t = 0; t <= seconds; t += 0.4) { ctx.currentTime = t; eng.pump(); }
}

test('all scheduled notes start in the future, end within bounds, with finite frequencies', () => {
  const { eng } = make();
  eng.init(); eng.start();
  const ctx = eng._debug().ctx;
  pumpUntil(eng, ctx, 120);
  const oscs = ctx.of('osc');
  assert.ok(oscs.length > 50);
  oscs.forEach(o => {
    assert.ok(o.started !== null && o.stopped !== null, 'started and stopped');
    assert.ok(o.started >= 0 && o.stopped > o.started, 'order');
    assert.ok(Number.isFinite(o.frequency.value) && o.frequency.value > 20 && o.frequency.value < 8000);
  });
  // music is scheduled at most one block (+ lookahead) ahead of the clock
  const maxStart = Math.max.apply(null, oscs.map(o => o.started));
  assert.ok(maxStart < 120 + A.LOOKAHEAD + 25, 'scheduled too far ahead: ' + maxStart);
});

test('no clicks: every envelope gain starts at 0, ramps, and ends at 0', () => {
  const { eng } = make();
  eng.init(); eng.start();
  const ctx = eng._debug().ctx;
  pumpUntil(eng, ctx, 60);
  const envs = ctx.of('gain').filter(g => g.gain.events.some(e => e.type === 'ramp') && g.gain.events.length >= 3 && g.gain.events[0].value === 0 && g.gain.events[0].type === 'set');
  assert.ok(envs.length > 20);
  envs.forEach(g => {
    const ev = g.gain.events.filter(e => e.type !== 'cancel');
    assert.strictEqual(ev[0].type, 'set'); assert.strictEqual(ev[0].value, 0);
    const last = ev[ev.length - 1];
    assert.strictEqual(last.type, 'ramp');
    assert.strictEqual(last.value, 0);
    // times never go backwards for ramps
    const times = ev.map(e => e.time);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1] - 1e-9);
  });
});

test('gain changes (master, mute, volume, buses) always set the current value before ramping', () => {
  const { eng } = make();
  eng.init(); eng.start();
  const ctx = eng._debug().ctx, master = eng._debug().nodes.master.gain;
  ctx.currentTime = 2; eng.setVolume(0.8); ctx.currentTime = 4; eng.setEnabled(false); ctx.currentTime = 6; eng.setEnabled(true);
  const ev = master.events.filter(e => e.type !== 'assign');
  ev.forEach((e, i) => { if (e.type === 'ramp') { assert.ok(i > 0); const prev = ev[i - 1]; assert.ok(prev.type === 'set' || prev.type === 'cancel' || prev.type === 'ramp', 'ramp preceded by an anchor'); } });
  // anchored: each ramp is preceded by a set of the previous value (no jump)
  for (let i = 0; i < ev.length; i++) if (ev[i].type === 'ramp') { const anchor = ev[i - 1]; assert.strictEqual(anchor.type, 'set'); }
});

test('mute ramps master to 0 and stops scheduling; unmute restores and resumes without a burst', () => {
  const { eng } = make();
  eng.init(); eng.start();
  const d = eng._debug(), ctx = d.ctx;
  pumpUntil(eng, ctx, 30);
  const before = ctx.of('osc').length;
  ctx.currentTime = 31; eng.setEnabled(false);
  const lastRamp = d.nodes.master.gain.events.filter(e => e.type === 'ramp').pop();
  assert.strictEqual(lastRamp.value, 0);
  assert.ok(lastRamp.time > 31 && lastRamp.time <= 31.6, 'smooth ramp');
  pumpUntil(eng, ctx, 200); // time passes while muted (pump from t=0 is fine: cursor catches up)
  ctx.currentTime = 200; eng.pump();
  assert.strictEqual(ctx.of('osc').length, before, 'no new notes while muted');
  ctx.currentTime = 201; eng.setEnabled(true);
  eng.pump();
  assert.ok(d.nodes.master.gain.events.filter(e => e.type === 'ramp').pop().value > 0);
  assert.ok(ctx.of('osc').length > before, 'music resumes');
  const starts = ctx.of('osc').slice(before).map(o => o.started);
  assert.ok(Math.min.apply(null, starts) >= 201, 'resumed notes start now, not in the past');
});

test('volume is clamped and mapped to master gain', () => {
  const { eng } = make();
  eng.init(); eng.start();
  eng.setVolume(5); assert.strictEqual(eng.volume, 1);
  eng.setVolume(-1); assert.strictEqual(eng.volume, 0);
  eng.setVolume('abc'); assert.strictEqual(eng.volume, 0);
  eng.setVolume(0.5);
  const last = eng._debug().nodes.master.gain.events.filter(e => e.type === 'ramp').pop();
  assert.ok(last.value > 0 && last.value < 0.5);
});

test('setTrack crossfades: new bus ramps 0->1, old bus ramps to 0 over ~3 s, then is disconnected', () => {
  const { eng, timers } = make();
  eng.init(); eng.start();
  const ctx = eng._debug().ctx;
  pumpUntil(eng, ctx, 10);
  const oldBus = eng._debug().active.bus;
  ctx.currentTime = 10; eng.setTrack('christmas');
  const nb = eng._debug().active.bus;
  assert.notStrictEqual(nb, oldBus);
  assert.strictEqual(eng.currentTrack, 'christmas');
  const up = nb.gain.events.filter(e => e.type === 'ramp').pop();
  assert.deepStrictEqual([up.value, up.time], [1, 10 + A.CROSSFADE]);
  assert.strictEqual(nb.gain.events[0].value, 0);
  const down = oldBus.gain.events.filter(e => e.type === 'ramp').pop();
  assert.deepStrictEqual([down.value, down.time], [0, 10 + A.CROSSFADE]);
  const anchor = oldBus.gain.events[oldBus.gain.events.length - 2];
  assert.strictEqual(anchor.type, 'set'); assert.strictEqual(anchor.time, 10);
  assert.strictEqual(oldBus.disconnected, false);
  timers.advance(4000);
  assert.strictEqual(oldBus.disconnected, true);
  // same track again: no-op
  const buses = ctx.of('gain').length;
  eng.setTrack('christmas');
  assert.strictEqual(ctx.of('gain').length, buses);
  // null and unknown names go back to the default
  eng.setTrack(null); assert.strictEqual(eng.currentTrack, 'ambient');
  eng.setTrack('nope'); assert.strictEqual(eng.currentTrack, 'ambient');
});

test('christmas track schedules bell notes through its own bus; ambient resumes its own generator', () => {
  const { eng } = make();
  eng.init(); eng.start();
  const ctx = eng._debug().ctx;
  ctx.currentTime = 5; eng.setTrack('christmas');
  const bus = eng._debug().active.bus;
  pumpUntil(eng, ctx, 40);
  assert.ok(bus.out.length === 3);
  const before = ctx.of('osc').length;
  ctx.currentTime = 60; eng.setTrack(null); pumpUntil(eng, ctx, 90);
  assert.ok(ctx.of('osc').length > before);
});

test('autoplay: a suspended context waits for a gesture, schedules nothing, then unlock resumes', async () => {
  FakeAudioContext.initialState = 'suspended';
  const statuses = [];
  const { eng } = make({ onStatus: e => statuses.push(e.needsGesture) });
  eng.init();
  assert.strictEqual(eng.needsGesture, true);
  eng.start();
  const ctx = eng._debug().ctx;
  pumpUntil(eng, ctx, 20);
  assert.strictEqual(ctx.of('osc').length, 0, 'no music scheduled while suspended');
  assert.strictEqual(eng.getSpectrum(new Uint8Array(4)), false);
  eng.unlock();
  await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(eng.needsGesture, false);
  assert.strictEqual(statuses[statuses.length - 1], false);
  ctx.currentTime = 30; eng.pump();
  assert.ok(ctx.of('osc').length > 0);
  FakeAudioContext.initialState = 'running';
});

test('spectrum comes from the analyser while enabled, not when muted', () => {
  const { eng } = make();
  eng.init(); eng.start();
  const buf = new Uint8Array(eng.binCount());
  assert.strictEqual(eng.getSpectrum(buf), true);
  assert.strictEqual(buf[0], 100);
  eng.setEnabled(false);
  assert.strictEqual(eng.getSpectrum(buf), false);
});

test('engine without ctx.state (Chromium 38) behaves as running', () => {
  FakeAudioContext.initialState = undefined;
  const { eng } = make();
  eng.init(); eng.start();
  assert.strictEqual(eng.needsGesture, false);
  const ctx = eng._debug().ctx;
  pumpUntil(eng, ctx, 20);
  assert.ok(ctx.of('osc').length > 0);
  FakeAudioContext.initialState = 'running';
});
