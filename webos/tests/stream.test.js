const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const ST = require('../js/music/stations.js');
const SP = require('../js/music/stream.js');
const A = require('../js/audio.js');
const { FakeClock, FakeAudio } = require('./fakeclock.js');
const { FakeAudioContext } = require('./fakeaudio.js');

// ---- stations table ------------------------------------------------------------------
test('stations: single table with only the verified SomaFM URLs and sane defaults', () => {
  assert.deepStrictEqual(ST.STATIONS.map(s => s.id), ['dronezone', 'deepspaceone', 'spacestation', 'christmas', 'xmasinfrisko']);
  ST.STATIONS.forEach(s => { assert.match(s.url, /^https:\/\/ice1\.somafm\.com\/[a-z]+-128-mp3$/); assert.ok(s.label && ['ambient', 'christmas'].includes(s.kind)); });
  assert.strictEqual(ST.forTrack('ambient').id, 'dronezone');
  assert.strictEqual(ST.forTrack('ambient', 'spacestation').id, 'spacestation');
  assert.strictEqual(ST.forTrack('ambient', 'christmas').id, 'dronezone', 'a christmas station is not an ambient choice');
  assert.strictEqual(ST.forTrack('christmas').id, 'christmas');
  assert.strictEqual(ST.forTrack('christmas', 'xmasinfrisko').id, 'xmasinfrisko');
});

// ---- StreamPlayer state machine ---------------------------------------------------------
function player(opts) {
  FakeAudio.all.length = 0;
  const clock = new FakeClock(), log = [], online = { v: true };
  const p = new SP.StreamPlayer({
    url: 'https://example.test/s.mp3', timers: clock, isOnline: () => online.v,
    createElement: () => new FakeAudio(opts && opts.playResult),
    onChange: (state, info) => log.push([state, info])
  });
  return { p, clock, log, online, els: FakeAudio.all, states: () => log.map(l => l[0]) };
}

test('backoff is exponential and capped at 60 s', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8].map(SP.backoffMs), [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
});

test('connect: configures the element, plays, reports playing', () => {
  const t = player();
  t.p.start();
  const el = t.els[0];
  assert.strictEqual(el.crossOrigin, 'anonymous');
  assert.strictEqual(el.preload, 'none');
  assert.strictEqual(el.src, 'https://example.test/s.mp3');
  assert.strictEqual(el.plays, 1);
  assert.deepStrictEqual(t.states(), ['connecting']);
  el.emit('playing');
  assert.deepStrictEqual(t.states(), ['connecting', 'playing']);
  assert.strictEqual(t.p.failures, 0);
  el.emit('playing'); // duplicate events are harmless
  assert.deepStrictEqual(t.states(), ['connecting', 'playing']);
  assert.strictEqual(t.clock.pending(), 0, 'watchdog cleared');
});

test('play() returning undefined (Chromium 38) or a resolved promise both work', async () => {
  const a = player({ playResult: undefined }); a.p.start(); a.els[0].emit('playing');
  assert.strictEqual(a.p.state, 'playing');
  const b = player({ playResult: Promise.resolve() }); b.p.start(); await Promise.resolve(); b.els[0].emit('playing');
  assert.strictEqual(b.p.state, 'playing');
});

test('autoplay blocked: waits for a key press (kick), does not count as a failure', async () => {
  const err = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
  let reject = true;
  const t = player({ playResult: () => (reject ? Promise.reject(err) : undefined) });
  t.p.start();
  await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(t.p.state, 'blocked');
  assert.strictEqual(t.p.failures, 0);
  assert.strictEqual(t.clock.pending(), 0, 'no timers while waiting for the user');
  reject = false;
  t.p.kick();
  assert.strictEqual(t.p.state, 'connecting');
  assert.strictEqual(t.els[0].plays, 2);
  t.els[0].emit('playing');
  assert.strictEqual(t.p.state, 'playing');
});

test('error -> backoff 2 s -> retry with a fresh element -> backoff 4 s -> 3rd failure falls back', () => {
  const t = player();
  t.p.start();
  t.els[0].emit('error');
  assert.strictEqual(t.p.state, 'backoff');
  assert.strictEqual(t.log[t.log.length - 1][1].delay, 2000);
  assert.ok(t.els[0].paused && t.els[0].src === '' && t.els[0].listenerCount() === 0, 'failed element fully torn down');
  t.clock.advance(1999); assert.strictEqual(t.els.length, 1);
  t.clock.advance(1); assert.strictEqual(t.els.length, 2); assert.strictEqual(t.p.state, 'connecting');
  t.els[1].emit('error');
  assert.strictEqual(t.log[t.log.length - 1][1].delay, 4000);
  t.clock.advance(4000); assert.strictEqual(t.els.length, 3);
  t.els[2].emit('error');
  assert.strictEqual(t.p.state, 'fallback');
  assert.strictEqual(t.p.fallback, true);
  assert.deepStrictEqual(t.states(), ['connecting', 'backoff', 'connecting', 'backoff', 'connecting', 'fallback']);
});

test('fallback retries in the background every 3 minutes and reports recovery', () => {
  const t = player();
  t.p.start();
  for (let i = 0; i < 3; i++) { t.els[i].emit('error'); t.clock.advance(5000); }
  assert.strictEqual(t.p.state, 'fallback');
  const n = t.els.length;
  t.clock.advance(SP.BG_RETRY - 5000 - 1); assert.strictEqual(t.els.length, n, 'not before 3 minutes');
  t.clock.advance(1 + 5000); assert.strictEqual(t.els.length, n + 1);
  t.els[n].emit('error'); // background attempt fails: still fallback, next try in 3 more minutes
  assert.strictEqual(t.p.state, 'fallback');
  assert.strictEqual(t.log[t.log.length - 1][1].background, true);
  t.clock.advance(SP.BG_RETRY); assert.strictEqual(t.els.length, n + 2);
  t.els[n + 1].emit('playing');
  assert.strictEqual(t.p.state, 'playing');
  assert.strictEqual(t.log[t.log.length - 1][1].recovered, true);
  assert.strictEqual(t.p.fallback, false);
  assert.strictEqual(t.p.failures, 0);
});

test('a success resets the failure counter', () => {
  const t = player();
  t.p.start(); t.els[0].emit('error'); t.clock.advance(2000); t.els[1].emit('playing');
  t.els[1].emit('error');
  assert.strictEqual(t.log[t.log.length - 1][1].delay, 2000, 'backoff restarts at 2 s');
});

test('stall/waiting longer than 15 s is a failure; recovering in time is not', () => {
  const t = player();
  t.p.start(); t.els[0].emit('playing');
  t.els[0].emit('waiting'); t.clock.advance(14000); assert.strictEqual(t.p.state, 'playing');
  t.els[0].emit('playing'); t.clock.advance(5000); assert.strictEqual(t.p.state, 'playing', 'stall watch cancelled');
  t.els[0].emit('stalled'); t.clock.advance(SP.STALL_TIMEOUT);
  assert.strictEqual(t.p.state, 'backoff');
  assert.strictEqual(t.log[t.log.length - 1][1].reason, 'stall');
});

test('ended (a live stream should never end) and connect timeout are failures', () => {
  const a = player(); a.p.start(); a.els[0].emit('playing'); a.els[0].emit('ended');
  assert.strictEqual(a.log[a.log.length - 1][1].reason, 'ended');
  const b = player(); b.p.start(); b.clock.advance(SP.CONNECT_TIMEOUT);
  assert.strictEqual(b.p.state, 'backoff');
  assert.strictEqual(b.log[b.log.length - 1][1].reason, 'timeout');
});

test('offline: goes straight to fallback, and retryNow() reconnects when the network returns', () => {
  const t = player();
  t.online.v = false;
  t.p.start();
  assert.strictEqual(t.p.state, 'fallback');
  assert.strictEqual(t.els.length, 0, 'no element created while offline');
  t.online.v = true;
  t.p.retryNow();
  assert.strictEqual(t.els.length, 1);
  t.els[0].emit('playing');
  assert.strictEqual(t.log[t.log.length - 1][1].recovered, true);
});

test('stop() cancels everything and a throwing element factory degrades to fallback without throwing', () => {
  const t = player();
  t.p.start(); t.els[0].emit('error');
  t.p.stop();
  assert.strictEqual(t.p.state, 'idle');
  assert.strictEqual(t.clock.pending(), 0);
  const bad = new SP.StreamPlayer({ url: 'x', timers: new FakeClock(), createElement() { throw new Error('no audio'); }, onChange() {} });
  assert.doesNotThrow(() => bad.start());
  assert.strictEqual(bad.state, 'backoff');
});

test('a throwing onChange callback never breaks the state machine', () => {
  const clock = new FakeClock();
  const p = new SP.StreamPlayer({ url: 'x', timers: clock, createElement: () => new FakeAudio(), onChange() { throw new Error('ui'); } });
  assert.doesNotThrow(() => { p.start(); p.element().emit('error'); });
});

// ---- engine + stream (fake Web Audio, fake element, fake clock) -------------------------------------
function engine(extra) {
  FakeAudio.all.length = 0; FakeAudioContext.initialState = 'running'; FakeAudioContext.failRouting = false;
  const clock = new FakeClock(), online = { v: true };
  const eng = A.createEngine(Object.assign({ AudioContext: FakeAudioContext, seed: 1, timers: clock, source: 'stream', createElement: () => new FakeAudio(), isOnline: () => online.v }, extra));
  return { eng, clock, online, els: FakeAudio.all };
}
const lastRamp = param => param.events.filter(e => e.type === 'ramp').pop();
const oscCount = eng => eng._debug().ctx.of('osc').length;

test('stream mode: element routed through a gain into the master chain; silent until playing, then a 3 s fade in', () => {
  const { eng, els } = engine();
  eng.init(); eng.start();
  assert.strictEqual(els.length, 1);
  assert.strictEqual(els[0].src, ST.byId('dronezone').url);
  const d = eng._debug(), slot = d.active;
  const srcNode = d.ctx.of('mediaSource')[0];
  assert.strictEqual(srcNode.element, els[0]);
  assert.ok(srcNode.out.includes(slot.streamGain) && slot.streamGain.out.includes(d.nodes.master), 'element -> stream gain -> master -> compressor -> analyser');
  assert.strictEqual(slot.streamGain.gain.events[0].value, 0);
  assert.strictEqual(lastRamp(slot.streamGain.gain), undefined, 'still silent while connecting');
  d.ctx.currentTime = 5; els[0].emit('playing');
  assert.deepStrictEqual([lastRamp(slot.streamGain.gain).value, lastRamp(slot.streamGain.gain).time], [1, 5 + A.CROSSFADE]);
  assert.strictEqual(eng.streamState, 'playing');
  assert.strictEqual(eng.describe(), 'radio en línea');
  for (let t = 0; t < 30; t += 0.4) { d.ctx.currentTime = t; eng.pump(); }
  assert.strictEqual(oscCount(eng), 0, 'no synthesized notes while the radio plays');
  assert.strictEqual(eng.getSpectrum(new Uint8Array(eng.binCount())), true, 'visualizer taps the master chain');
});

test('failures fall back to the synth, and recovery crossfades back to the radio', () => {
  const { eng, clock, els } = engine();
  eng.init(); eng.start();
  const d = eng._debug(), slot = d.active;
  d.ctx.currentTime = 1; els[0].emit('playing');
  d.ctx.currentTime = 10; els[0].emit('error');
  clock.advance(2000); els[1].emit('error'); clock.advance(4000); els[2].emit('error'); // third consecutive failure
  assert.strictEqual(eng.streamState, 'fallback');
  assert.strictEqual(eng.describe(), 'sin conexión: música sintetizada');
  assert.strictEqual(lastRamp(slot.bus.gain).value, 1, 'synth bus fades in');
  assert.strictEqual(lastRamp(slot.streamGain.gain).value, 0, 'stream gain fades out');
  d.ctx.currentTime = 20; eng.pump(); d.ctx.currentTime = 30; eng.pump();
  assert.ok(oscCount(eng) > 0, 'synth music is scheduled');
  // background retry succeeds
  d.ctx.currentTime = 400; clock.advance(SP.BG_RETRY);
  const el = els[els.length - 1]; el.emit('playing');
  assert.strictEqual(eng.streamState, 'playing');
  assert.strictEqual(lastRamp(slot.bus.gain).value, 0, 'synth fades out');
  assert.strictEqual(lastRamp(slot.streamGain.gain).value, 1, 'radio fades back in');
  const n = oscCount(eng);
  d.ctx.currentTime = 450; eng.pump();
  assert.strictEqual(oscCount(eng), n, 'synth stops scheduling after recovery');
});

test('offline at start: straight to the synth fallback', () => {
  const { eng, online, els } = engine();
  online.v = false;
  eng.init(); eng.start();
  assert.strictEqual(els.length, 0);
  assert.strictEqual(eng.streamState, 'fallback');
  const ctx = eng._debug().ctx;
  ctx.currentTime = 2; eng.pump();
  assert.ok(oscCount(eng) > 0);
});

test('Web Audio routing failure falls back to element.volume with timed ramps', () => {
  const { eng, clock, els } = engine();
  FakeAudioContext.failRouting = true;
  eng.init(); eng.start();
  const slot = eng._debug().active;
  assert.strictEqual(slot.elVol, true);
  els[0].emit('playing');
  clock.advance(3500);
  assert.ok(Math.abs(els[0].volume - 0.35) < 1e-6, 'element volume ' + els[0].volume);
  eng.setVolume(0.6); assert.ok(Math.abs(els[0].volume - 0.6) < 1e-6);
  eng.setEnabled(false); assert.strictEqual(els[0].volume, 0);
  FakeAudioContext.failRouting = false;
});

test('no Web Audio at all: the radio still plays through element.volume (visualizer unavailable)', () => {
  const { eng, clock, els } = engine({ AudioContext: null });
  assert.strictEqual(eng.init(), true);
  assert.strictEqual(eng.webAudio, false);
  eng.start();
  assert.strictEqual(els.length, 1);
  els[0].emit('playing'); clock.advance(3500);
  assert.ok(Math.abs(els[0].volume - 0.35) < 1e-6);
  assert.strictEqual(eng.getSpectrum(new Uint8Array(4)), false);
  els[0].emit('error'); clock.advance(2000); els[1].emit('error'); clock.advance(4000); els[2].emit('error');
  assert.doesNotThrow(() => { eng.pump(); eng.setTrack('christmas'); });
  assert.strictEqual(eng.describe().length > 0, true);
});

test('mute stops the download after the fade and unmute reconnects; muted start does not stream', () => {
  const { eng, clock, els } = engine();
  eng.init(); eng.start();
  els[0].emit('playing');
  eng.setEnabled(false);
  assert.strictEqual(lastRamp(eng._debug().nodes.master.gain).value, 0);
  assert.strictEqual(els[0].paused, false, 'still fading');
  clock.advance(800);
  assert.strictEqual(els[0].paused, true); assert.strictEqual(eng._debug().active.player.state, 'idle');
  eng.setEnabled(true);
  assert.strictEqual(els.length, 2, 'new connection');
  const m = engine();
  m.eng.setEnabled(false); m.eng.init(); m.eng.start();
  assert.strictEqual(m.els.length, 0, 'muted at start: no stream yet');
  m.eng.setEnabled(true);
  assert.strictEqual(m.els.length, 1);
});

test('changing station crossfades to a new stream and stops the old one', () => {
  const { eng, clock, els } = engine();
  eng.init(); eng.start(); els[0].emit('playing');
  eng.setStation('deepspaceone');
  assert.strictEqual(els.length, 2);
  assert.strictEqual(els[1].src, ST.byId('deepspaceone').url);
  assert.ok(lastRamp(eng._debug().ctx.of('gain').filter(g => g.gain.events.length)[0].gain));
  clock.advance(4000);
  assert.strictEqual(els[0].paused, true, 'old stream stopped after the 3 s fade');
  assert.strictEqual(els[1].paused, false);
});

test('christmas track: synthesized carols by default even in stream mode; "radio" streams the christmas station; back to ambient restores', () => {
  const { eng, clock, els } = engine();
  eng.init(); eng.start(); els[0].emit('playing');
  const ctx = eng._debug().ctx;
  ctx.currentTime = 10; eng.setTrack('christmas');
  assert.strictEqual(eng.currentTrack, 'christmas');
  assert.strictEqual(eng._debug().active.player, null, 'carols need no internet');
  assert.strictEqual(els.length, 1);
  ctx.currentTime = 12; eng.pump(); ctx.currentTime = 20; eng.pump();
  assert.ok(oscCount(eng) > 0);
  clock.advance(4000);
  assert.strictEqual(els[0].paused, true, 'ambient radio released while the carols play');
  ctx.currentTime = 100; eng.setTrack(null);
  assert.strictEqual(els.length, 2);
  assert.strictEqual(els[1].src, ST.byId('dronezone').url);
  // radio option
  eng.setChristmasSource('radio');
  ctx.currentTime = 200; eng.setTrack('christmas');
  assert.strictEqual(els[els.length - 1].src, ST.byId('christmas').url);
  // radio failing falls back to the synthesized carols
  const el = els[els.length - 1];
  el.emit('error'); clock.advance(2000); els[els.length - 1].emit('error'); clock.advance(4000); els[els.length - 1].emit('error');
  assert.strictEqual(eng.streamState, 'fallback');
  const before = oscCount(eng);
  ctx.currentTime = 220; eng.pump(); ctx.currentTime = 230; eng.pump();
  assert.ok(oscCount(eng) > before, 'carols play as the fallback');
});

test('music source "synth" never creates audio elements', () => {
  const { eng, els } = engine({ source: 'synth' });
  eng.init(); eng.start();
  assert.strictEqual(els.length, 0);
  eng.setSource('stream');
  assert.strictEqual(els.length, 1);
  eng.setSource('synth');
  assert.strictEqual(eng.source, 'synth');
});

test('autoplay blocked by the browser: needsGesture until a key press kicks the element', async () => {
  const err = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
  let reject = true;
  const { eng, els } = engine({ createElement: () => new FakeAudio(() => (reject ? Promise.reject(err) : undefined)) });
  const seen = [];
  eng.init(); eng.start();
  await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(eng.needsGesture, true);
  assert.strictEqual(eng.describe(), 'pulsa una tecla para activar el sonido');
  reject = false;
  eng.unlock(); seen.push(eng.needsGesture);
  assert.strictEqual(els[0].plays, 2);
  assert.strictEqual(eng.needsGesture, false);
  els[0].emit('playing');
  assert.strictEqual(eng.streamState, 'playing');
});

test('engine never throws when the audio element misbehaves', () => {
  const { eng } = engine({ createElement: () => { throw new Error('no Audio'); } });
  assert.doesNotThrow(() => { eng.init(); eng.start(); eng.setTrack('christmas'); eng.setEnabled(false); eng.setEnabled(true); eng.pump(); eng.dispose(); });
});

test('settings: music source/station/christmas options and defaults', () => {
  const S = require('../js/settings.js'), C = require('../js/catalog.js');
  const d = S.defaults().global;
  assert.deepStrictEqual([d.music_source, d.music_station, d.christmas_source], ['stream', 'dronezone', 'carols']);
  const station = C.GLOBAL_FIELDS.find(f => f.key === 'music_station');
  assert.deepStrictEqual(station.options.map(o => o.value), ['dronezone', 'deepspaceone', 'spacestation']);
  const xmas = C.GLOBAL_FIELDS.find(f => f.key === 'christmas_source');
  assert.ok(/Christmas Lounge/.test(xmas.options[1].label) && /lounge/.test(xmas.options[1].label), 'radio option labelled honestly');
  const m = S.merge({ global: { music_source: 'bogus', music_station: 'christmas', christmas_source: 'radio' } }).global;
  assert.deepStrictEqual([m.music_source, m.music_station, m.christmas_source], ['stream', 'dronezone', 'radio']);
});
