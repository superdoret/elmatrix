const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('./load.js');
const { Scheduler, Signal, isAbort } = require('../js/scheduler.js');
const { Framebuffer } = require('../js/framebuffer.js');
const { createContext } = require('../js/context.js');
const { parseBDF } = require('../js/bdf.js');
const S = require('../js/settings.js');
const { SettingsModel } = require('../js/settingsmodel.js');
const keys = require('../js/keys.js');
const { FakeClock } = require('./fakeclock.js');
const v8 = require('v8'), vm = require('vm');

const tick = () => new Promise(r => setImmediate(r));
async function run(clock, ms, step) {
  step = step || 50;
  for (let t = 0; t < ms; t += step) { clock.advance(step); await tick(); }
}
function adapter(clock) { return { now: () => clock.now, setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock) }; }
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

// ---- scheduler pin ----------------------------------------------------------------------------
// A widget that lasts `ms` but honours the pin like ctx.loop does.
function sched(opts) {
  opts = opts || {};
  const clock = new FakeClock(), log = [], events = [];
  const s = new Scheduler({
    clock: adapter(clock), rng: seeded(5),
    getEnabled: () => opts.ids || ['a', 'b', 'c'], getPauseSeconds: () => (opts.pause === undefined ? 2 : opts.pause), getOrder: () => 'sequence',
    onEvent: (t, d) => events.push([t, d]),
    runWidget: async (id, control) => {
      log.push(id);
      if (opts.oneShot) { await control.sleep(opts.oneShot); return; }
      const start = control.activeNow();
      for (;;) {
        if (control.activeNow() - start >= (opts.ms || 2000) && !control.isPinned()) break;
        await control.sleep(100);
      }
    }
  });
  return { s, clock, log, events };
}

test('pin keeps the same widget past its duration without restarting it; unpin resumes the rotation', async () => {
  const t = sched();
  t.s.start(); await tick();
  assert.deepStrictEqual(t.log, ['a']);
  await run(t.clock, 1000);
  t.s.setPin(true);
  await run(t.clock, 30000);
  assert.deepStrictEqual(t.log, ['a'], 'still the very same run of "a" after 30 s (duration 2 s)');
  assert.strictEqual(t.s.current, 'a');
  assert.ok(!t.events.some(e => e[0] === 'gap'), 'no pause gap while pinned');
  t.s.setPin(false); // duration long elapsed: finishes at once, then the normal gap, then the next mode
  await run(t.clock, 400); assert.strictEqual(t.s.current, null);
  await run(t.clock, 2500); assert.deepStrictEqual(t.log, ['a', 'b']);
  await t.s.stop();
});

test('unpinning before the duration elapsed lets the widget finish at its natural time', async () => {
  const t = sched({ ms: 5000 });
  t.s.start(); await tick();
  t.s.setPin(true); await run(t.clock, 1000); t.s.setPin(false);
  await run(t.clock, 3500); assert.strictEqual(t.s.current, 'a', 'not finished yet (4.5 s in)');
  await run(t.clock, 1500); assert.notStrictEqual(t.s.current, 'a');
  await t.s.stop();
});

test('manual next/prev while pinned change the mode and the pin follows the new mode', async () => {
  const t = sched();
  t.s.start(); await tick();
  t.s.setPin(true);
  t.s.skip(); await run(t.clock, 2500); // normal pause gap between modes
  assert.strictEqual(t.s.current, 'b'); assert.strictEqual(t.s.pinned, true);
  await run(t.clock, 20000); assert.deepStrictEqual(t.log, ['a', 'b'], 'b stays pinned');
  t.s.skip(); await run(t.clock, 2500); assert.strictEqual(t.s.current, 'c');
  t.s.prev(); await run(t.clock, 2500); assert.strictEqual(t.s.current, 'b'); assert.strictEqual(t.s.pinned, true);
  await run(t.clock, 10000); assert.strictEqual(t.s.current, 'b');
  await t.s.stop();
});

test('pin + pause: pause freezes, resume continues, the pin survives both', async () => {
  const t = sched({ ms: 1000 });
  t.s.start(); await tick();
  t.s.setPin(true); t.s.pause(); await run(t.clock, 5000);
  assert.strictEqual(t.s.paused, true); assert.strictEqual(t.s.pinned, true); assert.strictEqual(t.s.current, 'a');
  t.s.resume(); await run(t.clock, 5000);
  assert.strictEqual(t.s.current, 'a');
  t.s.setPin(false); t.s.pause(); await run(t.clock, 5000);
  assert.strictEqual(t.s.current, 'a', 'paused: still frozen even though unpinned');
  t.s.resume(); await run(t.clock, 1500); assert.notStrictEqual(t.s.current, 'a');
  await t.s.stop();
});

test('one-shot widgets are re-run immediately while pinned (no gap, one history entry); unpin resumes rotation', async () => {
  const t = sched({ oneShot: 1000 });
  t.s.start(); await tick();
  t.s.setPin(true);
  await run(t.clock, 10500);
  assert.ok(t.log.length >= 10 && t.log.every(id => id === 'a'), 'only "a": ' + t.log.join());
  assert.ok(!t.events.some(e => e[0] === 'gap'), 'no gap between re-runs');
  assert.deepStrictEqual(t.s.history, ['a'], 'a pinned re-run is not a new history entry');
  t.s.setPin(false); await run(t.clock, 4000);
  assert.ok(t.log.includes('b'), 'rotation resumed');
  await t.s.stop();
});

test('run-now while pinned runs that widget and the pin stays on it', async () => {
  const t = sched();
  t.s.start(); await tick(); t.s.setPin(true);
  t.s.runNow('c'); await run(t.clock, 300);
  assert.strictEqual(t.s.current, 'c'); assert.strictEqual(t.s.pinned, true);
  await run(t.clock, 10000); assert.strictEqual(t.s.current, 'c');
  await t.s.stop();
});

test('a widget that throws while pinned is retried (the pin keeps the mode)', async () => {
  const clock = new FakeClock(), log = [];
  const s = new Scheduler({ clock: adapter(clock), getEnabled: () => ['bad', 'ok'], getPauseSeconds: () => 0, getOrder: () => 'sequence', onEvent() {},
    runWidget: async id => { log.push(id); throw new Error('boom'); } });
  s.start(); await tick(); s.setPin(true);
  await run(clock, 8000, 100);
  assert.ok(log.length >= 3 && log.every(id => id === 'bad'), log.join());
  await s.stop();
});

test('pin is session-only and emits events; the green key toggles it on the banner only', () => {
  const t = sched();
  const events = []; t.s.deps.onEvent = (ty, d) => events.push([ty, d]);
  t.s.setPin(true); t.s.setPin(true); t.s.togglePin();
  assert.deepStrictEqual(events, [['pin', true], ['pin', false]]);
  assert.strictEqual(new Scheduler({ getEnabled: () => [], getPauseSeconds: () => 0, getOrder: () => 'shuffle', runWidget: async () => {} }).pinned, false);
  assert.ok(!/"pinned?"/.test(JSON.stringify(S.defaults())), 'not part of the persisted settings');
  assert.strictEqual(keys.bannerAction('green'), 'togglePin');
  assert.strictEqual(keys.bannerAction('yellow'), 'togglePause');
  // in settings, green is not routed to the pin (the model ignores it outside the keyboard)
  const m = new SettingsModel(S.defaults(), {});
  assert.strictEqual(m.handleKey('green'), null);
});

test('settings screen: first row "Fijar modo actual" toggles the pin with OK or left/right', () => {
  let pin = false;
  const m = new SettingsModel(S.defaults(), { getPin: () => pin, setPin: v => { pin = v; } });
  const v = m.view();
  assert.strictEqual(v.rows[0].label, 'Fijar modo actual'); assert.strictEqual(v.rows[0].value, 'No'); assert.ok(v.rows[0].focus);
  m.handleKey('ok'); assert.strictEqual(pin, true); assert.strictEqual(m.view().rows[0].value, 'Sí');
  m.handleKey('right'); assert.strictEqual(pin, false);
  m.handleKey('left'); assert.strictEqual(pin, true);
});

// ---- every widget respects the central duration helper (ctx.loop) --------------------------------------
const fonts = {};
['tom-thumb', '5x8', '6x13', '7x14B', '9x18B', '10x20'].forEach(n => { fonts[n] = parseBDF(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', n + '.bdf'), 'utf8')); });
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
const net = { getJson(url) {
  const map = [['coingecko', 'coingecko'], ['dolarapi', 'dolarapi'], ['geocoding', 'geocode'], ['open-meteo', 'forecast'], ['searchteams', 'sports-teams'], ['eventslast', 'sports-last'], ['eventsnext', 'sports-next']];
  for (const [k, f] of map) if (url.includes(k)) return Promise.resolve(fx(f));
  return Promise.reject(new Error('unexpected ' + url));
} };
const BASE = Date.UTC(2026, 10, 11, 12, 0, 0);

function harness(id, over, pinned) {
  const clock = new FakeClock();
  const sch = new Scheduler({ clock: adapter(clock), getEnabled: () => [], getPauseSeconds: () => 0, getOrder: () => 'shuffle', runWidget: async () => {} });
  sch.pinned = !!pinned;
  const signal = new Signal();
  const control = { signal, sleep: ms => sch.sleep(ms, signal), activeNow: () => sch.activeNow(), isPaused: () => false, isPinned: () => sch.pinned };
  const fb = new Framebuffer(192, 108);
  const cfg = Object.assign({}, S.defaults().widgets[id].config, { duration: 1 }, over || {});
  const ctx = createContext({ fb, fonts, cfg, control, net, rng: seeded(11), audio: null, nowMs: () => BASE + clock.now });
  let done = false, err = null;
  const p = E.widgets[id].run(ctx).then(() => { done = true; }, e => { if (!isAbort(e)) err = e; done = true; });
  return { clock, sch, fb, signal, p, isDone: () => done, err: () => err };
}

const ALL = [['clock'], ['tetris'], ['worldclock'], ['countdown'], ['rates'], ['forecast'], ['sports'], ['word'], ['pixelart', { style: 'scene' }], ['pixelart', { style: 'snake' }], ['pixelart', { style: 'navidad' }],
  ['matrixrain'], ['fireplace'], ['aquarium'], ['fireworks'], ['plasma'], ['life'], ['starfield'], ['visualizer']];

ALL.forEach(([id, over]) => {
  const name = id + (over ? ':' + over.style : '');
  test('pin: ' + name + ' keeps running past its duration, then ends when unpinned', async () => {
    const h = harness(id, over, true);
    await run(h.clock, 6000);
    assert.strictEqual(h.isDone(), false, name + ' must still be running (duration 1 s, pinned 6 s)');
    assert.strictEqual(h.err(), null);
    h.sch.pinned = false;
    await run(h.clock, 1200);
    assert.strictEqual(h.isDone(), true, name + ' ends right after unpinning');
    assert.strictEqual(h.err(), null);
  });
  test('control: ' + name + ' ends at its duration when not pinned', async () => {
    const h = harness(id, over, false);
    await run(h.clock, 2500);
    assert.strictEqual(h.isDone(), true, name);
  });
});

test('phrases (a scrolling one-shot) does not stretch: it ends and the pinned scheduler re-runs it at once', async () => {
  const h = harness('phrases', {}, true);
  await run(h.clock, 90000, 100);
  assert.strictEqual(h.isDone(), true, 'finished its scroll even though pinned');
  const clock = new FakeClock(), log = [];
  const sch = new Scheduler({ clock: adapter(clock), getEnabled: () => ['phrases'], getPauseSeconds: () => 2, getOrder: () => 'sequence', onEvent: (t) => { if (t === 'gap') log.push('gap'); },
    runWidget: (id, control) => { log.push(id); return E.widgets[id].run(createContext({ fb: new Framebuffer(192, 108), fonts, cfg: S.defaults().widgets[id].config, control, rng: seeded(3), nowMs: () => BASE + clock.now })); } });
  sch.start(); await tick(); sch.setPin(true);
  await run(clock, 120000, 100);
  assert.ok(log.filter(x => x === 'phrases').length >= 3, 'phrases re-run: ' + log.length);
  assert.ok(!log.includes('gap'));
  await sch.stop();
});

test('offline screens are fixed loops: a pinned rates widget retries instead of staying on "Sin conexión"', async () => {
  const clock = new FakeClock(), starts = [];
  const sch = new Scheduler({ clock: adapter(clock), getEnabled: () => ['rates'], getPauseSeconds: () => 2, getOrder: () => 'sequence', onEvent() {},
    runWidget: (id, control) => { starts.push(clock.now); return E.widgets.rates.run(createContext({ fb: new Framebuffer(192, 108), fonts, cfg: S.defaults().widgets.rates.config, control, net: { getJson: () => Promise.reject(new Error('offline')) }, rng: seeded(2), nowMs: () => BASE + clock.now })); } });
  sch.start(); await tick(); sch.setPin(true);
  await run(clock, 40000, 100);
  assert.ok(starts.length >= 4, 'retried ' + starts.length + ' times');
  await sch.stop();
});

// ---- pinned for a few simulated minutes: no blank frames, no frozen animation, no memory growth -----------------
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const ANIMATED = new Set(['clock', 'tetris', 'matrixrain', 'fireplace', 'aquarium', 'fireworks', 'plasma', 'life', 'starfield', 'visualizer', 'pixelart', 'forecast']);

ALL.forEach(([id, over]) => {
  const name = id + (over ? ':' + over.style : '');
  test('pinned for 3 simulated minutes: ' + name + ' never blanks, keeps animating if animated, no memory growth', async () => {
    const h = harness(id, over, true);
    await run(h.clock, 1000, 100);
    gc(); const heap0 = process.memoryUsage().heapUsed;
    let blank = 0, changes = 0, last = null;
    for (let t = 0; t < 180000; t += 100) {
      h.clock.advance(100); await tick();
      if (!h.fb.data.some(v => v !== 0)) blank++;
      if (t % 1000 === 0) { const sig = h.fb.data.reduce((a, v, i) => (a + v * (i % 97 + 1)) | 0, 0); if (sig !== last) changes++; last = sig; }
    }
    gc(); const grown = (process.memoryUsage().heapUsed - heap0) / 1048576;
    assert.strictEqual(h.isDone(), false, 'still the same run');
    assert.strictEqual(blank, 0, 'blank frames while pinned');
    if (ANIMATED.has(id)) assert.ok(changes > 20, 'frozen? distinct frames sampled: ' + changes);
    assert.ok(grown < 15, 'heap grew ' + grown.toFixed(1) + ' MB');
    h.signal.abort(); await h.p;
  });
});
