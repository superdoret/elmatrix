const test = require('node:test');
const assert = require('node:assert');
const E = require('./load.js');
const { computeGrid, buildMasks } = require('../js/renderer.js');
const keys = require('../js/keys.js');
const { Net } = require('../js/net.js');
const { SettingsModel } = require('../js/settingsmodel.js');
const S = require('../js/settings.js');
const { createContext } = require('../js/context.js');
const { Scheduler, isAbort } = require('../js/scheduler.js');
const { Framebuffer } = require('../js/framebuffer.js');

// ---- renderer grid -----------------------------------------------------------
test('computeGrid: 1920x1080 -> 192x108 with 10 px cells', () => {
  assert.deepStrictEqual(computeGrid(1920, 1080), { cell: 10, cols: 192, rows: 108 });
});
test('computeGrid: other window sizes keep ~192 columns and a minimum cell', () => {
  const hd = computeGrid(1280, 720);
  assert.strictEqual(hd.cell, 7);
  assert.ok(hd.cols * hd.cell <= 1280 && hd.rows * hd.cell <= 720);
  assert.ok(Math.abs(hd.cols - 192) <= 12);
  const tiny = computeGrid(300, 200);
  assert.ok(tiny.cell >= 4 && tiny.cols >= 8);
});
test('LED masks: opaque core in the centre, soft halo, nothing in the corner', () => {
  const m = buildMasks(10);
  assert.strictEqual(m.core[5 * 10 + 5], 255);
  assert.strictEqual(m.core[0], 0);
  assert.ok(m.halo[0] < 5 && Math.max.apply(null, m.halo) > 20);
});

// ---- keys ---------------------------------------------------------------------------
test('remote keys map to logical names and banner actions', () => {
  const k = code => keys.keyName({ keyCode: code, key: '' });
  assert.deepStrictEqual([37, 38, 39, 40, 13, 461, 403, 404, 405, 406, 457, 415, 19].map(k),
    ['left', 'up', 'right', 'down', 'ok', 'back', 'red', 'green', 'yellow', 'blue', 'info', 'play', 'pause']);
  assert.strictEqual(k(27), 'back'); // Esc on desktop
  assert.strictEqual(k(65), null);
  assert.strictEqual(keys.keyName({ keyCode: 0, key: 'y' }), 'yellow'); // desktop shortcut
  assert.strictEqual(keys.bannerAction('right'), 'next');
  assert.strictEqual(keys.bannerAction('left'), 'prev');
  assert.strictEqual(keys.bannerAction('yellow'), 'togglePause');
  assert.strictEqual(keys.bannerAction('pause'), 'togglePause');
  assert.strictEqual(keys.bannerAction('ok'), 'openSettings');
  assert.strictEqual(keys.bannerAction('red'), 'openSettings');
  assert.strictEqual(keys.bannerAction('back'), null); // Back must stay with the OS (exit app)
});

// ---- net ------------------------------------------------------------------------------
test('Net: caches within the TTL, serves stale data on failure, rejects without cache', async () => {
  let calls = 0, fail = false, now = 1000;
  const net = new Net({
    now: () => now,
    fetch: async () => { calls++; if (fail) throw new Error('down'); return { ok: true, json: async () => ({ n: calls }) }; }
  });
  assert.deepStrictEqual(await net.getJson('u', 60000), { n: 1 });
  assert.deepStrictEqual(await net.getJson('u', 60000), { n: 1 });
  assert.strictEqual(calls, 1);
  now += 61000; fail = true;
  assert.deepStrictEqual(await net.getJson('u', 60000), { n: 1 }); // stale fallback
  await assert.rejects(net.getJson('other', 60000), /down/);
});
test('Net: HTTP errors and timeouts reject', async () => {
  const bad = new Net({ fetch: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(bad.getJson('x', 0), /HTTP 403/);
  const hang = new Net({ fetch: () => new Promise(() => {}), timeoutMs: 20 });
  await assert.rejects(hang.getJson('x', 0), /timeout/);
  const none = new Net({ fetch: null });
  none.fetchImpl = null;
  await assert.rejects(none.getJson('x', 0), /fetch unavailable/);
});

// ---- settings model (remote-only navigation) -------------------------------------------------
function model() {
  const settings = S.defaults();
  let saved = 0;
  const m = new SettingsModel(settings, { onChange: () => saved++ });
  return { m, settings, saved: () => saved };
}
const press = (m, ...names) => names.map(n => m.handleKey(n));

test('settings model: navigate, adjust number and select with left/right', () => {
  const { m, settings } = model();
  press(m, 'down', 'right'); // row 0 is "Fijar modo actual"; row 1 is pause_seconds
  assert.strictEqual(settings.global.pause_seconds, 3);
  press(m, 'left', 'left', 'left');
  assert.strictEqual(settings.global.pause_seconds, 0);
  press(m, 'left'); // wraps to max
  assert.strictEqual(settings.global.pause_seconds, 30);
  press(m, 'down', 'right');
  assert.strictEqual(settings.global.order, 'sequence');
  press(m, 'ok');
  assert.strictEqual(settings.global.order, 'shuffle');
});

test('settings model: OK toggles a widget, right opens its options, back returns', () => {
  const { m, settings, saved } = model();
  for (let i = 0; i < 10 && m.view().rows[m.view().cursor].label !== 'Frases positivas'; i++) m.handleKey('down'); // first widget row
  assert.strictEqual(m.view().rows[m.view().cursor].label, 'Frases positivas');
  press(m, 'ok');
  assert.strictEqual(settings.widgets.phrases.enabled, false);
  assert.ok(saved() >= 1);
  press(m, 'right');
  assert.strictEqual(m.view().type, 'widget');
  assert.strictEqual(m.view().title, 'Frases positivas');
  press(m, 'ok'); // "Activado" row
  assert.strictEqual(settings.widgets.phrases.enabled, true);
  press(m, 'back');
  assert.strictEqual(m.view().type, 'main');
  assert.deepStrictEqual(m.handleKey('back'), { type: 'close' });
});

function openWidget(m, label) {
  // move down to the widget row and open it
  for (let i = 0; i < 30; i++) {
    const v = m.view();
    if (v.rows[v.cursor].label === label) break;
    m.handleKey('down');
  }
  m.handleKey('right');
}

test('settings model: text field via on-screen keyboard (type, delete, accept)', () => {
  const { m, settings } = model();
  openWidget(m, 'Pronóstico');
  press(m, 'down'); // city row
  assert.strictEqual(m.view().rows[m.view().cursor].label, 'Ciudad');
  press(m, 'ok');
  assert.strictEqual(m.view().mode, 'keyboard');
  assert.strictEqual(m.view().text, 'Barcelona');
  // delete the whole word with Verde (backspace)
  for (let i = 0; i < 9; i++) m.handleKey('green');
  assert.strictEqual(m.view().text, '');
  // keyboard starts at row 1 ("qwertyuiop"), col 0: press q
  press(m, 'ok');
  assert.strictEqual(m.view().text, 'q');
  press(m, 'right', 'ok'); // w
  assert.strictEqual(m.view().text, 'qw');
  m.typeChar('x'); // physical keyboard
  assert.strictEqual(m.view().text, 'qwx');
  press(m, 'yellow', 'ok'); // shift one-shot -> 'Q' then back to lowercase
  assert.strictEqual(m.view().text, 'qwxW');
  // go to the special row and press "Listo"
  press(m, 'down', 'down', 'down');
  assert.strictEqual(m.view().r, 4);
  for (let i = 0; i < 3; i++) m.handleKey('right'); // col 1 -> 4 = "Listo"
  m.handleKey('ok');
  assert.strictEqual(m.view().mode, 'menu');
  assert.strictEqual(settings.widgets.forecast.config.city, 'qwxW');
});

test('settings model: text presets cycle with left/right; keyboard cancel keeps the value', () => {
  const { m, settings } = model();
  openWidget(m, 'Pronóstico');
  press(m, 'down', 'right');
  assert.strictEqual(settings.widgets.forecast.config.city, 'Madrid');
  press(m, 'ok', 'back');
  assert.strictEqual(m.view().mode, 'menu');
  assert.strictEqual(settings.widgets.forecast.config.city, 'Madrid');
});

test('settings model: list editor adds, edits and deletes items', () => {
  const { m, settings } = model();
  openWidget(m, 'Reloj mundial');
  press(m, 'down'); // zones
  press(m, 'ok');
  assert.strictEqual(m.view().type, 'list');
  assert.strictEqual(m.view().rows.length, 3 + 2);
  press(m, 'yellow'); // delete first zone
  assert.strictEqual(settings.widgets.worldclock.config.zones.length, 2);
  // add: go to "+ Añadir"
  press(m, 'down', 'down');
  assert.strictEqual(m.view().rows[m.view().cursor].label, '+ Añadir');
  press(m, 'ok');
  'Lima|UTC'.split('').forEach(ch => m.typeChar(ch));
  m.finishKeyboard();
  assert.deepStrictEqual(settings.widgets.worldclock.config.zones.pop(), 'Lima|UTC');
  // edit to empty deletes
  press(m, 'up', 'up'); // back to the first item
  press(m, 'ok');
  for (let i = 0; i < 40; i++) m.backspace();
  m.finishKeyboard();
  assert.strictEqual(settings.widgets.worldclock.config.zones.length, 1);
});

test('settings model: run now and reset', () => {
  const { m, settings } = model();
  settings.global.pause_seconds = 9;
  openWidget(m, 'Reloj');
  assert.strictEqual(m.view().type, 'widget');
  m.handleKey('up'); // wraps to "Volver"
  m.handleKey('up'); // "Mostrar ahora"
  const fx = m.handleKey('ok');
  assert.deepStrictEqual(fx, { type: 'runNow', id: 'clock' });
  m.handleKey('back');
  // walk down to the reset action
  for (let i = 0; i < 30 && m.view().rows[m.view().cursor].label !== 'Restablecer valores'; i++) m.handleKey('down');
  assert.strictEqual(m.view().rows[m.view().cursor].label, 'Restablecer valores');
  m.handleKey('ok');
  assert.strictEqual(settings.global.pause_seconds, 2);
});

test('settings model: view always has exactly one focused row and a hint', () => {
  const { m } = model();
  for (let i = 0; i < 40; i++) {
    const v = m.view();
    assert.strictEqual(v.rows.filter(r => r.focus).length, 1);
    assert.ok(v.hint.length > 0);
    m.handleKey(i % 7 === 6 ? 'right' : 'down');
    if (m.view().mode === 'menu' && m.view().type === 'widget' && i % 5 === 0) m.handleKey('back');
  }
});

// ---- widget context -------------------------------------------------------------------------------
function fakeControl() {
  const sched = new Scheduler({ getEnabled: () => [], getPauseSeconds: () => 0, getOrder: () => 'shuffle', runWidget: async () => {} });
  const { Signal } = require('../js/scheduler.js');
  const signal = new Signal();
  return { signal, sleep: ms => sched.sleep(ms, signal), activeNow: () => sched.activeNow(), isPaused: () => false, sched };
}

test('ctx.loop runs frames for the requested time and stops when draw returns "stop"', async () => {
  const control = fakeControl();
  const ctx = createContext({ fb: new Framebuffer(20, 10), fonts: {}, cfg: {}, control });
  let frames = 0;
  const t = await ctx.loop(0.2, 50, () => { frames++; });
  assert.ok(frames >= 5 && frames <= 14, 'frames ' + frames);
  assert.ok(t >= 0.2);
  let n = 0;
  await ctx.loop(10, 100, () => (++n === 3 ? 'stop' : undefined));
  assert.strictEqual(n, 3);
});

test('ctx.loop and ctx.abortable reject with AbortError when skipped', async () => {
  const control = fakeControl();
  const ctx = createContext({ fb: new Framebuffer(20, 10), fonts: {}, cfg: {}, control });
  const p = ctx.loop(10, 20, () => {});
  setTimeout(() => control.signal.abort(), 30);
  await assert.rejects(p, e => isAbort(e));
  const control2 = fakeControl();
  const ctx2 = createContext({ fb: new Framebuffer(20, 10), fonts: {}, cfg: {}, control: control2 });
  const never = ctx2.abortable(new Promise(() => {}));
  control2.signal.abort();
  await assert.rejects(never, e => isAbort(e));
});

test('offline widgets: network failure shows the offline screen instead of throwing', async () => {
  const fs = require('fs'), path = require('path');
  const { parseBDF } = require('../js/bdf.js');
  const fonts = {};
  ['5x8', '6x13', '7x14B', '9x18B', '10x20'].forEach(n => { fonts[n] = parseBDF(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', n + '.bdf'), 'utf8')); });
  const failing = { getJson: () => Promise.reject(new Error('offline')) };
  for (const id of ['rates', 'forecast', 'sports']) {
    const control = fakeControl();
    const fb = new Framebuffer(192, 108);
    const cfg = Object.assign({}, S.defaults().widgets[id].config, { duration: 3 });
    const ctx = createContext({ fb, fonts, cfg, control, net: failing });
    const run = E.widgets[id].run(ctx);
    await new Promise(r => setTimeout(r, 150));
    assert.ok(fb.data.some(v => v !== 0), id + ' drew something');
    control.signal.abort();
    await assert.rejects(run, e => isAbort(e), id); // still running the offline screen until skipped
  }
});
