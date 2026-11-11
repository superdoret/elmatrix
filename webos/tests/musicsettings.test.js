// Music settings must apply LIVE (no app restart). These tests drive the engine with a fake <audio> element and fake clock
// exactly like the app does, and drive the settings model like the settings screen.
const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const ST = require('../js/music/stations.js');
const A = require('../js/audio.js');
const S = require('../js/settings.js');
const { SettingsModel } = require('../js/settingsmodel.js');
const { FakeClock, FakeAudio } = require('./fakeclock.js');

function setup(patch) {
  FakeAudio.all.length = 0; FakeAudio.srcLog.length = 0;
  const clock = new FakeClock(), settings = S.defaults();
  Object.assign(settings.global, patch || {});
  let creates = 0;
  const eng = A.createEngine({ timers: clock, analyser: false, probe() {}, createElement: () => { creates++; return new FakeAudio(); },
    source: settings.global.music_source, station: settings.global.music_station, christmasSource: settings.global.christmas_source });
  eng.init();
  return { eng, clock, settings, creates: () => creates, els: FakeAudio.all };
}
// What app.js does on every settings change.
const apply = t => A.applySettings(t.eng, t.settings.global);
const settle = t => t.clock.advance(6000);
const live = t => FakeAudio.all.filter(e => !e.paused);
const curEl = t => t.eng._debug().cur.player.element();
const urlOf = id => ST.byId(id).url;

function screen(t) {
  const m = new SettingsModel(t.settings, { onChange: () => apply(t) });
  const goto = label => { for (let i = 0; i < 60 && m.view().rows[m.view().cursor].label !== label; i++) m.handleKey('down'); assert.strictEqual(m.view().rows[m.view().cursor].label, label); };
  return { m, goto };
}

test('RED: changing the station while the radio is still connecting is not swallowed (no stuck swap)', () => {
  const t = setup({ music_station: 'dronezone' });
  t.eng.start();                                      // radio connecting (no "playing" yet)
  const first = curEl(t);
  assert.strictEqual(first.src, urlOf('dronezone'));
  t.settings.global.music_station = 'kissfm'; apply(t);   // user changes the station: fade-out of the connecting stream starts
  t.clock.advance(300);
  first.emit('playing');                              // ... and the old stream starts playing right then
  settle(t);
  assert.strictEqual(curEl(t).src, urlOf('kissfm'), 'the new station must be playing after the swap');
  assert.strictEqual(live(t).length, 1);
});

test('RED: the engine reuses ONE <audio> element for the whole session (one media pipeline on webOS 3)', () => {
  const t = setup({ music_station: 'dronezone' });
  t.eng.start(); curEl(t).emit('playing'); settle(t);
  t.settings.global.music_station = 'kissfm'; apply(t); settle(t); curEl(t).emit('playing'); settle(t);
  t.settings.global.music_source = 'incluida'; apply(t); settle(t); curEl(t).emit('playing'); settle(t);
  t.settings.global.music_source = 'stream'; apply(t); settle(t);
  assert.strictEqual(t.creates(), 1, 'one element created, not one per connect');
  assert.strictEqual(FakeAudio.all.length, 1);
  const srcs = FakeAudio.srcLog.map(x => x[1]);
  assert.ok(srcs.includes(urlOf('dronezone')) && srcs.includes(urlOf('kissfm')) && srcs.includes('assets/music/ambient.mp3'), srcs.join());
});

test('RED: settings are applied by one central function used by the app', () => {
  assert.strictEqual(typeof A.applySettings, 'function');
});

// ---- every setting, while playing, without recreating the engine -----------------------------------------------------------
function playing(patch) {
  const t = setup(Object.assign({ music_station: 'dronezone' }, patch));
  t.eng.start(); curEl(t).emit('playing'); settle(t);
  return t;
}

test('station change while playing: fade-out, swap to the new url, fade-in (within ~2-4 s)', () => {
  const t = playing();
  const el = curEl(t), vol0 = el.volume;
  t.settings.global.music_station = 'kissfm'; apply(t);
  t.clock.advance(700); assert.ok(el.volume < vol0, 'fading out');
  t.clock.advance(1000); // fade-out done
  assert.strictEqual(el.src, urlOf('kissfm'));
  assert.strictEqual(el.volume, 0, 'new stream starts silent');
  el.emit('playing'); settle(t);
  assert.ok(el.volume > 0);
  assert.strictEqual(t.eng.station, 'kissfm');
});

test('source change radio <-> incluida while playing', () => {
  const t = playing();
  const el = curEl(t);
  t.settings.global.music_source = 'incluida'; apply(t); t.clock.advance(1700);
  assert.strictEqual(el.src, 'assets/music/ambient.mp3'); assert.strictEqual(el.loop, true);
  el.emit('playing'); settle(t);
  t.settings.global.music_source = 'stream'; apply(t); t.clock.advance(1700);
  assert.strictEqual(el.src, urlOf('dronezone')); assert.ok(!el.loop);
});

test('on/off and volume change the element at once; turning on again reconnects', () => {
  const t = playing();
  const el = curEl(t), v = el.volume;
  t.settings.global.music_volume = 80; apply(t);
  assert.ok(el.volume > v, 'volume applied immediately: ' + el.volume);
  t.settings.global.music_enabled = false; apply(t);
  assert.strictEqual(el.volume, 0); t.clock.advance(800); assert.strictEqual(el.paused, true);
  t.settings.global.music_enabled = true; apply(t);
  assert.strictEqual(el.paused, false, 'playback restarted');
  assert.strictEqual(el.src, urlOf('dronezone'));
});

test('station level change applies immediately to the playing element', () => {
  const t = playing();
  const el = curEl(t), v = el.volume;
  t.settings.global.station_levels = { dronezone: 60 }; apply(t);
  assert.ok(Math.abs(el.volume - v * 0.6) < 1e-6, el.volume + ' vs ' + v * 0.6);
});

test('Christmas: the new choices apply to the ambient track and to the christmas track on request or at once if active', () => {
  const t = playing();
  t.eng.setTrack('christmas'); t.clock.advance(1700); curEl(t).emit('playing'); settle(t);
  assert.strictEqual(curEl(t).src, 'assets/music/christmas.mp3');
  // station change while the christmas track is active: ambient picks it up when released
  t.settings.global.music_station = 'kissfm'; apply(t); settle(t);
  assert.strictEqual(curEl(t).src, 'assets/music/christmas.mp3', 'christmas carols keep playing');
  t.eng.setTrack(null); t.clock.advance(1700);
  assert.strictEqual(curEl(t).src, urlOf('kissfm'), 'default track uses the new station');
  curEl(t).emit('playing'); settle(t);
  // christmas source change: applies immediately when the christmas track is active
  t.eng.setTrack('christmas'); t.clock.advance(1700); curEl(t).emit('playing'); settle(t);
  t.settings.global.christmas_source = 'radio'; apply(t); t.clock.advance(1700);
  assert.strictEqual(curEl(t).src, urlOf('christmas'), 'live switch to the christmas radio');
  curEl(t).emit('playing'); settle(t);
  t.settings.global.christmas_source = 'carols'; apply(t); t.clock.advance(1700);
  assert.strictEqual(curEl(t).src, 'assets/music/christmas.mp3');
});

test('changes made during a fade or while on the fallback still apply (latest wins)', () => {
  const t = playing();
  t.settings.global.music_station = 'deepspaceone'; apply(t); t.clock.advance(400);
  t.settings.global.music_station = 'kissfm'; apply(t); t.clock.advance(400);
  t.settings.global.music_station = 'spacestation'; apply(t); settle(t);
  assert.strictEqual(curEl(t).src, urlOf('spacestation'));
  // radio failed -> fallback mp3 -> user picks another station: the radio is tried again at once
  const el = curEl(t);
  el.emit('error'); t.clock.advance(2000); el.emit('error'); t.clock.advance(4000); el.emit('error');
  assert.strictEqual(curEl(t).src, 'assets/music/ambient.mp3');
  t.settings.global.music_station = 'kissfm'; apply(t); t.clock.advance(1700);
  assert.strictEqual(curEl(t).src, urlOf('kissfm'));
});

// ---- driven through the settings screen -----------------------------------------------------------------------------------------
test('settings screen: left/right on every music row reaches the engine immediately', () => {
  const t = playing();
  const { m, goto } = screen(t);
  goto('Emisora de fondo'); m.handleKey('right'); t.clock.advance(1800);
  assert.strictEqual(t.eng.station, 'deepspaceone');
  assert.strictEqual(curEl(t).src, urlOf('deepspaceone'));
  curEl(t).emit('playing'); settle(t);
  goto('Fuente de la música'); m.handleKey('right'); t.clock.advance(1800);
  assert.strictEqual(t.eng.source, 'incluida'); assert.strictEqual(curEl(t).src, 'assets/music/ambient.mp3');
  curEl(t).emit('playing'); settle(t);
  goto('Volumen de la música (%)'); m.handleKey('right');
  assert.ok(Math.abs(curEl(t).volume - 0.40) < 1e-6, 'volume 40 %: ' + curEl(t).volume);
  goto('Música de fondo'); m.handleKey('ok'); assert.strictEqual(curEl(t).volume, 0);
  m.handleKey('ok'); settle(t);
  goto('Nivel de esta estación'); m.handleKey('left');
  assert.strictEqual(t.settings.global.station_levels.bundled, 95);
  goto('Música en Navidad'); m.handleKey('right'); assert.strictEqual(t.eng.christmasSource, 'radio');
});

test('the app uses the central applySettings for every settings change', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.ok(/A?E\.audio\.applySettings\(audio,/.test(src) || /audio\.applySettings|applySettings\(audio/.test(src));
});
