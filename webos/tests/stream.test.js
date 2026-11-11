const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const ST = require('../js/music/stations.js');
const SP = require('../js/music/stream.js');
const { FakeClock, FakeAudio } = require('./fakeclock.js');

// ---- stations table ------------------------------------------------------------------
test('stations: single table with only the verified SomaFM URLs and sane defaults', () => {
  assert.deepStrictEqual(ST.STATIONS.map(s => s.id), ['dronezone', 'deepspaceone', 'spacestation', 'kissfm', 'christmas', 'xmasinfrisko']);
  ST.STATIONS.filter(s => s.id !== 'kissfm').forEach(s => { assert.match(s.url, /^https:\/\/ice1\.somafm\.com\/[a-z]+-128-mp3$/); assert.ok(s.label && ['ambient', 'christmas'].includes(s.kind)); });
  assert.strictEqual(ST.forTrack('ambient').id, 'kissfm', 'Kiss FM is the default background radio');
  assert.strictEqual(ST.forTrack('ambient', 'spacestation').id, 'spacestation');
  assert.strictEqual(ST.forTrack('ambient', 'christmas').id, 'kissfm', 'a christmas station is not an ambient choice');
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

test('settings: music source/station/christmas options and defaults', () => {
  const S = require('../js/settings.js'), C = require('../js/catalog.js');
  const d = S.defaults().global;
  assert.deepStrictEqual([d.music_source, d.music_station, d.christmas_source], ['stream', 'kissfm', 'carols']);
  const station = C.GLOBAL_FIELDS.find(f => f.key === 'music_station');
  assert.deepStrictEqual(station.options.map(o => o.value), ['dronezone', 'deepspaceone', 'spacestation', 'kissfm']);
  assert.ok(/^SomaFM: /.test(station.options[0].label));
  assert.ok(/Kiss FM España/.test(station.options[3].label) && /comercial/.test(station.options[3].label) && /anuncios/.test(station.options[3].label));
  assert.strictEqual(S.merge({ global: { music_station: 'kissfm' } }).global.music_station, 'kissfm', 'choice persists');
  assert.strictEqual(S.merge({ global: { music_station: 'nope' } }).global.music_station, 'kissfm', 'unknown stored id -> default');
  const xmas = C.GLOBAL_FIELDS.find(f => f.key === 'christmas_source');
  assert.ok(/Christmas Lounge/.test(xmas.options[1].label) && /lounge/.test(xmas.options[1].label), 'radio option labelled honestly');
  assert.strictEqual(xmas.options[0].label, 'Villancicos (incluidos)');
  const src = C.GLOBAL_FIELDS.find(f => f.key === 'music_source');
  assert.deepStrictEqual(src.options.map(o => o.value), ['stream', 'incluida']);
  assert.ok(/incluida/i.test(src.options[1].label) && /sin internet/.test(src.options[1].label));
  const m = S.merge({ global: { music_source: 'synth', music_station: 'christmas', christmas_source: 'radio' } }).global;
  assert.deepStrictEqual([m.music_source, m.music_station, m.christmas_source], ['stream', 'kissfm', 'radio']);
});

test('kiss fm station: plain URL (no signed token), selectable as ambient, unknown ids fall back to the default', () => {
  const k = ST.byId('kissfm');
  assert.strictEqual(k.url, 'https://bbkissfm.kissfmradio.cires21.com/bbkissfm.mp3');
  assert.ok(!/wmsAuthSign|\?/.test(k.url));
  assert.strictEqual(k.kind, 'ambient');
  assert.strictEqual(ST.forTrack('ambient', 'kissfm').id, 'kissfm');
  assert.strictEqual(ST.forTrack('christmas', 'kissfm').id, 'christmas', 'not a christmas station');
  assert.strictEqual(ST.forTrack('ambient', 'does-not-exist').id, 'kissfm');
  assert.strictEqual(ST.DEFAULTS.ambient, 'kissfm', 'Kiss FM España is the default background station');
});

test('every (re)connect assigns src again so redirects/expiring tokens are re-resolved', () => {
  FakeAudio.all.length = 0; FakeAudio.srcLog.length = 0;
  const clock = new FakeClock();
  const p = new SP.StreamPlayer({ url: ST.byId('kissfm').url, timers: clock, createElement: () => new FakeAudio(), onChange() {} });
  p.start(); p.element().emit('error'); clock.advance(2000); p.element().emit('error'); clock.advance(4000);
  const assigns = FakeAudio.srcLog.filter(([, v]) => v === ST.byId('kissfm').url);
  assert.strictEqual(assigns.length, 3, 'initial connect + 2 retries each set src');
  assert.strictEqual(new Set(assigns.map(a => a[0])).size, 3, 'each on a fresh element');
  // a stall-triggered reconnect also re-sets src
  p.element().emit('playing'); p.element().emit('waiting'); clock.advance(SP.STALL_TIMEOUT); clock.advance(2000);
  assert.strictEqual(FakeAudio.srcLog.filter(([, v]) => v === ST.byId('kissfm').url).length, 4);
});

const S = require('../js/settings.js');
test('migration: a pre-schema-2 stored "dronezone" (just the old default) becomes the new default; explicit choices survive', () => {
  const mk = txt => ({ getItem: () => txt, setItem(k, v) { this.saved = v; } });
  const old = new S.Store(mk(JSON.stringify({ global: { music_station: 'dronezone', music_volume: 50 } })));
  assert.strictEqual(old.data.global.music_station, 'kissfm');
  assert.strictEqual(old.data.global.music_volume, 50, 'other values are kept');
  assert.strictEqual(new S.Store(mk(JSON.stringify({ global: { music_station: 'spacestation' } }))).data.global.music_station, 'spacestation');
  assert.strictEqual(new S.Store(mk(JSON.stringify({ global: { music_station: 'kissfm' } }))).data.global.music_station, 'kissfm');
  // saved with the schema marker: an explicit dronezone is respected from now on
  const st = mk(null), a = new S.Store(st);
  a.data.global.music_station = 'dronezone'; a.save();
  assert.strictEqual(JSON.parse(st.saved)._v, 2);
  assert.strictEqual(new S.Store(mk(st.saved)).data.global.music_station, 'dronezone');
  assert.strictEqual(new S.Store(mk(null)).data.global.music_station, 'kissfm', 'first run');
});
