const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const ST = require('../js/music/stations.js');
const A = require('../js/audio.js');
const S = require('../js/settings.js');
const { SettingsModel } = require('../js/settingsmodel.js');
const { FakeClock, FakeAudio } = require('./fakeclock.js');

function engine(extra) {
  FakeAudio.all.length = 0;
  const clock = new FakeClock();
  const eng = A.createEngine(Object.assign({ timers: clock, source: 'stream', createElement: () => new FakeAudio(), analyser: false, probe() {} }, extra));
  eng.init();
  return { eng, clock, els: FakeAudio.all };
}
const settle = t => t.clock.advance(A.FADE_IN * 1000 + 300);
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('stations: every trim is within 0.05..1.0; Kiss FM is the reference (1.0), SomaFM is an unmeasured 0.7 estimate', () => {
  ST.STATIONS.forEach(s => assert.ok(s.trim >= 0.05 && s.trim <= 1, s.id));
  assert.strictEqual(ST.byId('kissfm').trim, 1.0);
  ['dronezone', 'deepspaceone', 'spacestation', 'christmas', 'xmasinfrisko'].forEach(id => assert.strictEqual(ST.byId(id).trim, 0.7, id));
  assert.deepStrictEqual([ST.fileTrim('ambient'), ST.fileTrim('christmas')], [1, 1]);
  assert.ok(ST.levelKeys().includes('bundled') && ST.levelKeys().includes('kissfm'));
});

test('effective element volume = fade x user volume x station trim x station level', () => {
  const kiss = engine({ station: 'kissfm' });
  kiss.eng.start(); kiss.els[0].emit('playing'); settle(kiss);
  assert.ok(near(kiss.els[0].volume, 0.35), 'kiss: ' + kiss.els[0].volume);
  const soma = engine();
  soma.eng.start(); soma.els[0].emit('playing'); settle(soma);
  assert.ok(near(soma.els[0].volume, 0.35 * 0.7), 'soma trimmed to 0.7: ' + soma.els[0].volume);
  soma.eng.setLevels({ dronezone: 80 });
  assert.ok(near(soma.els[0].volume, 0.35 * 0.7 * 0.8), 'live level applies at once: ' + soma.els[0].volume);
  soma.eng.setVolume(1);
  assert.ok(near(soma.els[0].volume, 0.7 * 0.8));
});

test('the element volume is never above 1.0, and levels are clamped to 5..100 %', () => {
  const t = engine({ station: 'kissfm' });
  const k = ST.byId('kissfm'), old = k.trim;
  try {
    k.trim = 5; // absurd trim must still be clamped
    t.eng.start(); t.eng.setVolume(1); t.els[0].emit('playing'); settle(t);
    assert.strictEqual(t.els[0].volume, 1);
    k.trim = old;
  } finally { k.trim = old; }
  const u = engine({ station: 'kissfm' });
  u.eng.start(); u.eng.setVolume(1); u.els[0].emit('playing'); settle(u);
  {
    const t = u;
    t.eng.setLevels({ kissfm: 1000 }); assert.ok(t.els[0].volume <= 1);
    t.eng.setLevels({ kissfm: -20 }); assert.ok(t.els[0].volume > 0 && t.els[0].volume <= 0.06 + 1e-9, 'floor 5%: ' + t.els[0].volume);
    t.eng.setLevels(null); assert.strictEqual(t.els[0].volume, 1, 'bad map ignored');
    t.eng.setLevels({ nope: 10 }); assert.strictEqual(t.els[0].volume, 1, 'unknown ids ignored');
  }
});

test('levels interplay with fades, mute, and track changes', () => {
  const t = engine();
  t.eng.setLevels({ dronezone: 70, bundled: 60 });
  t.eng.start(); t.els[0].emit('playing');
  t.clock.advance(A.FADE_IN * 500); // halfway through the fade-in
  const half = t.els[0].volume;
  assert.ok(half > 0 && half < 0.35 * 0.7 * 0.7, 'mid fade ' + half);
  t.eng.setLevels({ dronezone: 100, bundled: 60 });
  assert.ok(t.els[0].volume > half, 'raising the level mid-fade scales the current fade value');
  settle(t);
  assert.ok(near(t.els[0].volume, 0.35 * 0.7));
  t.eng.setEnabled(false); assert.strictEqual(t.els[0].volume, 0);
  t.clock.advance(800); t.eng.setEnabled(true);
  const fresh = t.els[t.els.length - 1]; fresh.emit('playing'); settle(t);
  assert.ok(near(fresh.volume, 0.35 * 0.7), 'unmute restores the same level');
  // radio failure -> bundled fallback uses the "bundled" level and its own trim
  fresh.emit('error'); t.clock.advance(2000); t.els[t.els.length - 1].emit('error'); t.clock.advance(4000); t.els[t.els.length - 1].emit('error');
  const file = t.els[t.els.length - 1]; file.emit('playing'); settle(t);
  assert.ok(file.src.endsWith('ambient.mp3'));
  assert.ok(near(file.volume, 0.35 * 1.0 * 0.6), 'bundled level 60 %: ' + file.volume);
});

test('changing station applies that station level; fade-in of the new element starts from silence', () => {
  const t = engine();
  t.eng.setLevels({ dronezone: 90, kissfm: 55 });
  t.eng.start(); t.els[0].emit('playing'); settle(t);
  assert.ok(near(t.els[0].volume, 0.35 * 0.7 * 0.9));
  t.eng.setStation('kissfm'); t.clock.advance(A.FADE_OUT * 1000 + 100);
  const kiss = t.els[t.els.length - 1];
  assert.strictEqual(kiss.volume, 0); kiss.emit('playing'); settle(t);
  assert.ok(near(kiss.volume, 0.35 * 1.0 * 0.55), 'kiss: ' + kiss.volume);
});

// ---- settings persistence and the settings row -------------------------------------------------------
test('settings: station_levels are validated, clamped, rounded to 5, unknown ids dropped; default is empty', () => {
  assert.deepStrictEqual(S.defaults().global.station_levels, {});
  const m = S.merge({ global: { station_levels: { kissfm: 72, dronezone: 10, deepspaceone: 999, bundled: 'abc', nope: 80, spacestation: '85' } } }).global.station_levels;
  assert.deepStrictEqual(m, { kissfm: 70, dronezone: 50, deepspaceone: 100, spacestation: 85 });
  assert.deepStrictEqual(S.merge({ global: { station_levels: [1, 2] } }).global.station_levels, {});
  assert.deepStrictEqual(S.merge({ global: { station_levels: 'x' } }).global.station_levels, {});
  const store = new S.Store({ getItem: () => JSON.stringify({ global: { station_levels: { kissfm: 65 } } }), setItem() {} });
  assert.strictEqual(store.data.global.station_levels.kissfm, 65);
});

function model(patch) {
  const settings = S.defaults();
  Object.assign(settings.global, patch || {});
  let changes = 0;
  const m = new SettingsModel(settings, { onChange: () => changes++ });
  const goto = label => { for (let i = 0; i < 40 && m.view().rows[m.view().cursor].label !== label; i++) m.handleKey('down'); };
  return { m, settings, goto, changes: () => changes };
}

test('settings row "Nivel de esta estación": 50..100 in 5 % steps, per selected station, toast with the percentage', () => {
  const { m, settings, goto, changes } = model();
  goto('Nivel de esta estación');
  assert.strictEqual(m.view().rows[m.view().cursor].value, '100%');
  assert.deepStrictEqual(m.handleKey('left'), { type: 'redraw', toast: 'Nivel: 95%' });
  assert.strictEqual(settings.global.station_levels.dronezone, 95);
  for (let i = 0; i < 20; i++) m.handleKey('left');
  assert.strictEqual(settings.global.station_levels.dronezone, 50, 'clamped at 50 %');
  assert.strictEqual(m.handleKey('right').toast, 'Nivel: 55%');
  assert.ok(changes() >= 2, 'persisted through onChange');
  assert.strictEqual(m.handleKey('ok').toast, 'Nivel: 60%', 'OK also steps up');
});

test('the level row follows the selected station and the source', () => {
  const { m, settings, goto } = model({ music_station: 'kissfm' });
  goto('Nivel de esta estación'); m.handleKey('left'); m.handleKey('left');
  assert.deepStrictEqual(settings.global.station_levels, { kissfm: 90 });
  settings.global.music_station = 'dronezone';
  assert.strictEqual(m.view().rows[m.view().cursor].value, '100%', 'another station keeps its own level');
  settings.global.music_station = 'kissfm';
  assert.strictEqual(m.view().rows[m.view().cursor].value, '90%', 'the saved level comes back');
  settings.global.music_source = 'incluida';
  assert.strictEqual(m.view().rows[m.view().cursor].value, '100%');
  m.handleKey('left');
  assert.deepStrictEqual(settings.global.station_levels, { kissfm: 90, bundled: 95 }, 'bundled music has its own level');
});
