const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const ST = require('../js/music/stations.js');
const SP = require('../js/music/stream.js');
const A = require('../js/audio.js');
const { FakeClock, FakeAudio } = require('./fakeclock.js');

function engine(extra) {
  FakeAudio.all.length = 0;
  const clock = new FakeClock(), online = { v: true }, probes = [];
  const eng = A.createEngine(Object.assign({
    timers: clock, source: 'stream', station: 'dronezone', reuseElement: false, createElement: () => new FakeAudio(), isOnline: () => online.v, analyser: false,
    probe: (url, cb) => probes.push({ url, cb })
  }, extra));
  return { eng, clock, online, probes, els: FakeAudio.all, live: () => FakeAudio.all.filter(e => !e.paused) };
}
const MP3_AMBIENT = 'assets/music/ambient.mp3', MP3_XMAS = 'assets/music/christmas.mp3';

test('stations: bundled file table', () => {
  assert.strictEqual(ST.fileFor('ambient'), MP3_AMBIENT);
  assert.strictEqual(ST.fileFor('christmas'), MP3_XMAS);
  assert.strictEqual(ST.fileFor(null), MP3_AMBIENT);
});

test('no audio element available -> unavailable, silent, never throws', () => {
  const eng = A.createEngine({ createElement: null, analyser: false, timers: new FakeClock() });
  assert.strictEqual(eng.init(), false);
  assert.doesNotThrow(() => { eng.start(); eng.setTrack('christmas'); eng.setEnabled(false); eng.setVolume(0.5); eng.unlock(); eng.dispose(); });
  assert.strictEqual(eng.getSpectrum(new Uint8Array(4)), false);
  assert.strictEqual(eng.describe(), 'sin audio');
  const thrower = A.createEngine({ createElement: () => { throw new Error('no Audio'); }, analyser: false, timers: new FakeClock() });
  assert.doesNotThrow(() => { thrower.init(); thrower.start(); thrower.setTrack('christmas'); thrower.setEnabled(false); thrower.setEnabled(true); });
});

test('source "incluida": plays the bundled ambient MP3 on a looping element with fade-in, no network', () => {
  const t = engine({ source: 'incluida' });
  t.eng.init(); t.eng.start();
  assert.strictEqual(t.els.length, 1);
  assert.strictEqual(t.els[0].src, MP3_AMBIENT);
  assert.strictEqual(t.els[0].loop, true);
  assert.strictEqual(t.els[0].volume, 0, 'starts silent');
  t.els[0].emit('playing');
  t.clock.advance(A.FADE_IN * 1000 + 200);
  assert.ok(Math.abs(t.els[0].volume - 0.35) < 1e-6, 'fades to the master volume: ' + t.els[0].volume);
  assert.strictEqual(t.eng.describe(), 'música incluida');
  // 'ended' on a looping file restarts it instead of failing
  t.els[0].emit('ended');
  assert.strictEqual(t.els[0].plays, 2);
  assert.strictEqual(t.eng.streamState, 'playing');
  assert.strictEqual(t.probes.length, 0);
});

test('radio source: connects to the station, loop is off, volume follows fade, SomaFM trim and master volume', () => {
  const t = engine();
  t.eng.init(); t.eng.start();
  assert.strictEqual(t.els[0].src, ST.byId('dronezone').url);
  assert.ok(!t.els[0].loop);
  t.els[0].emit('playing'); t.clock.advance(3000);
  assert.ok(Math.abs(t.els[0].volume - 0.35 * 0.7) < 1e-6, 'trimmed: ' + t.els[0].volume);
  t.eng.setVolume(0.8); assert.ok(Math.abs(t.els[0].volume - 0.8 * 0.7) < 1e-6);
  t.eng.setVolume(5); assert.ok(Math.abs(t.els[0].volume - 0.7) < 1e-6);
  t.eng.setVolume(-1); assert.strictEqual(t.els[0].volume, 0);
  assert.strictEqual(t.eng.describe(), 'radio en línea');
});

test('radio failure -> bundled ambient MP3 (one element at a time), then quiet recovery attempts with a probe', () => {
  const t = engine();
  t.eng.init(); t.eng.start();
  t.els[0].emit('error'); t.clock.advance(2000); t.els[1].emit('error'); t.clock.advance(4000); t.els[2].emit('error');
  const file = t.els[t.els.length - 1];
  assert.strictEqual(file.src, MP3_AMBIENT);
  assert.strictEqual(file.loop, true);
  assert.strictEqual(t.live().length, 1, 'only one element playing');
  assert.ok(t.els.slice(0, -1).every(e => e.paused && e.src === ''), 'radio elements torn down');
  file.emit('playing'); t.clock.advance(3000);
  assert.strictEqual(t.eng.describe(), 'sin conexión: música incluida');
  assert.ok(Math.abs(file.volume - 0.35) < 1e-6);
  // no concurrent radio attempts: nothing happens until the recovery timer, and then only a probe
  const n = t.els.length;
  t.clock.advance(A.RECOVER_MS - 100); assert.strictEqual(t.els.length, n);
  t.clock.advance(200); assert.strictEqual(t.probes.length, 1);
  assert.strictEqual(t.probes[0].url, ST.byId('dronezone').url);
  assert.strictEqual(t.els.length, n, 'probing creates no element');
  t.probes[0].cb(false); // radio still unreachable: keep the file, try again later
  assert.strictEqual(file.paused, false);
  t.clock.advance(A.RECOVER_MS + 100); assert.strictEqual(t.probes.length, 2);
  t.probes[1].cb(true); // reachable: sequential swap file -> radio
  assert.strictEqual(t.live().length, 1, 'file still playing while it fades out');
  t.clock.advance(A.FADE_OUT * 1000 + 200);
  assert.strictEqual(file.paused, true);
  const radio = t.els[t.els.length - 1];
  assert.strictEqual(radio.src, ST.byId('dronezone').url);
  assert.strictEqual(t.live().length, 1);
  radio.emit('playing'); t.clock.advance(3000);
  assert.strictEqual(t.eng.describe(), 'radio en línea');
});

test('a failed recovery attempt goes straight back to the bundled file (single attempt)', () => {
  const t = engine();
  t.eng.init(); t.eng.start();
  t.els[0].emit('error'); t.clock.advance(2000); t.els[1].emit('error'); t.clock.advance(4000); t.els[2].emit('error');
  t.els[t.els.length - 1].emit('playing'); t.clock.advance(3000);
  t.clock.advance(A.RECOVER_MS + 100); t.probes[0].cb(true); t.clock.advance(A.FADE_OUT * 1000 + 200);
  const radio = t.els[t.els.length - 1];
  radio.emit('error'); // one failure is enough for a recovery attempt
  const file2 = t.els[t.els.length - 1];
  assert.strictEqual(file2.src, MP3_AMBIENT);
  assert.strictEqual(t.live().length, 1);
});

test('offline at start: straight to the bundled file, no radio element ever created', () => {
  const t = engine(); t.online.v = false;
  t.eng.init(); t.eng.start();
  assert.strictEqual(t.els.length, 1);
  assert.strictEqual(t.els[0].src, MP3_AMBIENT);
});

test('christmas request: sequential fade-out, swap to christmas.mp3, release returns to the previous track', () => {
  const t = engine({ source: 'incluida' });
  t.eng.init(); t.eng.start(); t.els[0].emit('playing'); t.clock.advance(3000);
  const amb = t.els[0];
  t.eng.setTrack('christmas');
  assert.strictEqual(t.els.length, 1, 'new element is not created before the old one has faded out');
  t.clock.advance(A.FADE_OUT * 1000 / 2);
  assert.ok(amb.volume > 0 && amb.volume < 0.35, 'fading out: ' + amb.volume);
  assert.strictEqual(amb.paused, false);
  t.clock.advance(A.FADE_OUT * 1000);
  assert.strictEqual(amb.paused, true);
  assert.strictEqual(t.els.length, 2);
  const xmas = t.els[1];
  assert.strictEqual(xmas.src, MP3_XMAS);
  assert.strictEqual(xmas.loop, true);
  assert.strictEqual(xmas.volume, 0, 'fade-in starts from silence');
  assert.strictEqual(t.live().length, 1);
  xmas.emit('playing'); t.clock.advance(3000);
  assert.ok(Math.abs(xmas.volume - 0.35) < 1e-6);
  assert.strictEqual(t.eng.currentTrack, 'christmas');
  t.eng.setTrack(null);
  t.clock.advance(A.FADE_OUT * 1000 + 100);
  assert.strictEqual(xmas.paused, true);
  assert.strictEqual(t.els[2].src, MP3_AMBIENT);
  assert.strictEqual(t.eng.currentTrack, 'ambient');
  assert.strictEqual(t.live().length, 1);
});

test('default Christmas source is the bundled carols even in radio mode; "radio" streams the Christmas station and falls back to christmas.mp3', () => {
  const t = engine();
  t.eng.init(); t.eng.start(); t.els[0].emit('playing'); t.clock.advance(3000);
  t.eng.setTrack('christmas'); t.clock.advance(A.FADE_OUT * 1000 + 100);
  assert.strictEqual(t.els[t.els.length - 1].src, MP3_XMAS);
  t.eng.setChristmasSource('radio'); t.clock.advance(A.FADE_OUT * 1000 + 100);
  const radio = t.els[t.els.length - 1];
  assert.strictEqual(radio.src, ST.byId('christmas').url);
  radio.emit('error'); t.clock.advance(2000); t.els[t.els.length - 1].emit('error'); t.clock.advance(4000); t.els[t.els.length - 1].emit('error');
  assert.strictEqual(t.els[t.els.length - 1].src, MP3_XMAS, 'carols are the fallback of the Christmas radio');
  assert.strictEqual(t.live().length, 1);
});

test('rapid track changes: the latest request wins and elements never overlap', () => {
  const t = engine({ source: 'incluida' });
  t.eng.init(); t.eng.start(); t.els[0].emit('playing'); t.clock.advance(3000);
  t.eng.setTrack('christmas'); t.clock.advance(300); t.eng.setTrack(null); t.clock.advance(300); t.eng.setTrack('christmas'); t.clock.advance(300); t.eng.setTrack(null);
  t.clock.advance(A.FADE_OUT * 1000 + 100);
  assert.strictEqual(t.eng.currentTrack, 'ambient');
  assert.strictEqual(t.els[t.els.length - 1].src, MP3_AMBIENT);
  assert.strictEqual(t.live().length, 1);
  assert.ok(t.els.length <= 3);
});

test('station change swaps sequentially; source change radio <-> bundled', () => {
  const t = engine();
  t.eng.init(); t.eng.start(); t.els[0].emit('playing'); t.clock.advance(3000);
  t.eng.setStation('deepspaceone');
  assert.strictEqual(t.els.length, 1);
  t.clock.advance(A.FADE_OUT * 1000 + 100);
  assert.strictEqual(t.els[1].src, ST.byId('deepspaceone').url);
  assert.strictEqual(t.els[0].paused, true);
  t.eng.setSource('incluida'); t.clock.advance(A.FADE_OUT * 1000 + 100);
  assert.strictEqual(t.els[t.els.length - 1].src, MP3_AMBIENT);
  assert.strictEqual(t.live().length, 1);
  t.eng.setStation('spacestation'); // not streaming: no change
  assert.strictEqual(t.els.length, 3);
});

test('mute: volume 0 immediately, download stopped after 0.7 s, unmute reconnects; muted start stays idle', () => {
  const t = engine();
  t.eng.init(); t.eng.start(); t.els[0].emit('playing'); t.clock.advance(3000);
  t.eng.setEnabled(false);
  assert.strictEqual(t.els[0].volume, 0);
  assert.strictEqual(t.els[0].paused, false);
  t.clock.advance(800);
  assert.strictEqual(t.els[0].paused, true);
  t.eng.setEnabled(true);
  assert.strictEqual(t.els.length, 2);
  const m = engine();
  m.eng.setEnabled(false); m.eng.init(); m.eng.start();
  assert.strictEqual(m.els.length, 0, 'muted at start: nothing downloads');
  m.eng.setEnabled(true);
  assert.strictEqual(m.els.length, 1);
});

test('autoplay blocked: needsGesture until a key press kicks the element', async () => {
  const err = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
  let reject = true;
  const t = engine({ source: 'incluida', createElement: () => new FakeAudio(() => (reject ? Promise.reject(err) : undefined)) });
  t.eng.init(); t.eng.start();
  await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(t.eng.needsGesture, true);
  assert.strictEqual(t.eng.describe(), 'pulsa una tecla para activar el sonido');
  reject = false;
  t.eng.unlock();
  assert.strictEqual(t.els[0].plays, 2);
  assert.strictEqual(t.eng.needsGesture, false);
  t.els[0].emit('playing');
  assert.strictEqual(t.eng.streamState, 'playing');
});

test('nothing audible depends on Web Audio: the engine never creates oscillators/destinations and works with analyser disabled', () => {
  const t = engine({ source: 'incluida' });
  t.eng.init(); t.eng.start(); t.els[0].emit('playing');
  assert.strictEqual(t.eng._debug().ctx, null);
  assert.strictEqual(t.eng.binCount(), 0);
  assert.strictEqual(t.eng.getSpectrum(new Uint8Array(8)), false);
});

// ---- analyser tap (modern browsers) and the silence fallback ----------------------------------------------
class FakeCtx {
  constructor() { FakeCtx.last = this; this.state = 'running'; this.nodes = []; this.destination = { kind: 'dest' }; this.sources = []; }
  createAnalyser() { const a = { kind: 'analyser', frequencyBinCount: 512, fill: 100, connect: n => { a.out = n; }, getByteFrequencyData(arr) { arr.fill(a.fill); } }; this.analyser = a; return a; }
  createMediaElementSource(el) { const s = { el, connect: n => { s.out = n; } }; this.sources.push(s); return s; }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

test('analyser: element routed element -> analyser -> destination; real spectrum while playing', () => {
  const now = { v: 0 };
  const t = engine({ analyser: true, AudioContext: FakeCtx, now: () => now.v, source: 'incluida' });
  t.eng.init(); t.eng.start();
  const c = FakeCtx.last;
  assert.strictEqual(c.sources[0].el, t.els[0]);
  assert.strictEqual(c.sources[0].out, c.analyser);
  assert.strictEqual(c.analyser.out, c.destination);
  assert.strictEqual(t.eng.binCount(), 512);
  const buf = new Uint8Array(512);
  assert.strictEqual(t.eng.getSpectrum(buf), false, 'not playing yet');
  t.els[0].emit('playing');
  assert.strictEqual(t.eng.getSpectrum(buf), true);
  assert.strictEqual(buf[0], 100);
  t.eng.setEnabled(false);
  assert.strictEqual(t.eng.getSpectrum(buf), false, 'muted');
});

test('analyser silence (all zeros for ~2 s) makes the visualizer fall back to the simulated spectrum', () => {
  const now = { v: 1000 };
  const t = engine({ analyser: true, AudioContext: FakeCtx, now: () => now.v, source: 'incluida' });
  t.eng.init(); t.eng.start(); t.els[0].emit('playing');
  FakeCtx.last.analyser.fill = 0;
  const buf = new Uint8Array(512);
  assert.strictEqual(t.eng.getSpectrum(buf), true, 'a moment of silence is still real');
  now.v += A.SILENCE_MS - 1; assert.strictEqual(t.eng.getSpectrum(buf), true);
  now.v += 2; assert.strictEqual(t.eng.getSpectrum(buf), false, 'dead tap: simulate');
  FakeCtx.last.analyser.fill = 50; // signal returns
  assert.strictEqual(t.eng.getSpectrum(buf), true);
});

test('analyser: context suspended until a key press, a throwing context never breaks playback', async () => {
  class Suspended extends FakeCtx { constructor() { super(); this.state = 'suspended'; } resume() { this.state = 'running'; return Promise.resolve(); } }
  const t = engine({ analyser: true, AudioContext: Suspended, source: 'incluida' });
  t.eng.init(); t.eng.start();
  assert.strictEqual(t.eng.needsGesture, true);
  t.eng.unlock();
  await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(t.eng.needsGesture, false);
  const bad = engine({ analyser: true, AudioContext: function () { throw new Error('nope'); }, source: 'incluida' });
  assert.doesNotThrow(() => { bad.eng.init(); bad.eng.start(); bad.els[0].emit('playing'); });
  assert.strictEqual(bad.eng.describe(), 'música incluida');
});

test('selecting Kiss FM as the ambient station streams the plain URL and falls back to the bundled ambient MP3', () => {
  const t = engine({ station: 'kissfm' });
  t.eng.init(); t.eng.start();
  assert.strictEqual(t.els[0].src, 'https://bbkissfm.kissfmradio.cires21.com/bbkissfm.mp3');
  t.els[0].emit('error'); t.clock.advance(2000); t.els[1].emit('error'); t.clock.advance(4000); t.els[2].emit('error');
  assert.strictEqual(t.els[t.els.length - 1].src, MP3_AMBIENT);
  const u = engine(); u.eng.init(); u.eng.setStation('kissfm'); u.eng.start(); u.els[0].emit('playing'); u.clock.advance(3000);
  u.eng.setStation('dronezone'); u.clock.advance(A.FADE_OUT * 1000 + 100);
  assert.strictEqual(u.els[u.els.length - 1].src, ST.byId('dronezone').url);
});
