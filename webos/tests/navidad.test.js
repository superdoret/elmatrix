const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const E = require('./load.js');
const { Framebuffer } = require('../js/framebuffer.js');
const { createContext } = require('../js/context.js');
const { Scheduler, Signal, isAbort } = require('../js/scheduler.js');
const { parseBDF } = require('../js/bdf.js');
const S = require('../js/settings.js');
const C = require('../js/catalog.js');
const { SettingsModel } = require('../js/settingsmodel.js');
const { FakeClock } = require('./fakeclock.js');
const v8 = require('v8'), vm = require('vm');

const W = E.widgets.navidad, SCENES = E.navidadScenes, L = E.navidadLib;
const fonts = {};
['tom-thumb', '5x8', '6x13', '7x14B', '9x18B', '10x20'].forEach(n => { fonts[n] = parseBDF(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', n + '.bdf'), 'utf8')); });
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const tick = () => new Promise(r => setImmediate(r));
async function run(clock, ms, step) { step = step || 100; for (let t = 0; t < ms; t += step) { clock.advance(step); await tick(); } }
const adapter = clock => ({ now: () => clock.now, setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock) });
const BASE = Date.UTC(2026, 11, 20, 20, 0, 0);

function frameCtx(w, h, seed) {
  const clock = new FakeClock();
  const sch = new Scheduler({ clock: adapter(clock), getEnabled: () => [], getPauseSeconds: () => 0, getOrder: () => 'shuffle', runWidget: async () => {} });
  const signal = new Signal();
  const control = { signal, sleep: ms => sch.sleep(ms, signal), activeNow: () => sch.activeNow(), isPaused: () => false, isPinned: () => sch.pinned };
  const fb = new Framebuffer(w, h);
  const ctx = createContext({ fb, fonts, cfg: S.defaults().widgets.navidad.config, control, rng: seeded(seed || 1), audio: null, nowMs: () => BASE });
  return { ctx, fb, clock, sch, signal };
}
const hash = fb => crypto.createHash('sha1').update(Buffer.from(fb.data.buffer)).digest('hex');
const lit = fb => fb.data.reduce((n, v) => n + (v ? 1 : 0), 0);

// ---- registry ------------------------------------------------------------------------------------------------
test('gallery has at least 14 scenes with unique ids, Spanish names, and a catalog switch each', () => {
  assert.ok(SCENES.length >= 14, 'scenes: ' + SCENES.length);
  assert.strictEqual(new Set(SCENES.map(s => s.id)).size, SCENES.length);
  const cat = C.byId('navidad');
  assert.ok(cat && cat.category === 'Entretenimiento' && cat.def_enabled === true && /escenas/i.test(cat.description));
  SCENES.forEach(s => {
    assert.ok(typeof s.make === 'function' && typeof s.draw === 'function' && s.name.length > 3, s.id);
    const f = cat.fields.find(x => x.key === 'scene_' + s.id);
    assert.ok(f && f.type === 'bool' && f.def === true && f.label === 'Escena: ' + s.name, 'catalog field for ' + s.id);
  });
  ['arbol', 'muneco', 'santa', 'chimenea', 'belen', 'reyes', 'pueblo', 'jengibre', 'globo', 'corona', 'aurora', 'pinguinos', 'chocolate', 'bolas', 'anonuevo'].forEach(id => assert.ok(SCENES.some(s => s.id === id), id));
  const dur = cat.fields.find(f => f.key === 'duration');
  assert.deepStrictEqual([dur.def, dur.min, dur.max], [18, 6, 60]);
  const ord = cat.fields.find(f => f.key === 'order');
  assert.deepStrictEqual([ord.def, ord.options.map(o => o.value)], ['aleatorio', ['aleatorio', 'secuencial']]);
});

// ---- every scene ------------------------------------------------------------------------------------------------------
SCENES.forEach(scene => {
  test('scene ' + scene.id + ': draws rich frames, is deterministic, animated and inside the framebuffer at several sizes', () => {
    [[192, 101], [182, 93], [160, 90]].forEach(([w, h]) => {
      const a = frameCtx(w, h, 7), b = frameCtx(w, h, 7);
      const sa = scene.make(a.ctx, seeded(99)), sb = scene.make(b.ctx, seeded(99));
      scene.draw(a.ctx, sa, 3.3); scene.draw(b.ctx, sb, 3.3);
      assert.strictEqual(hash(a.fb), hash(b.fb), 'deterministic ' + w + 'x' + h);
      assert.ok(lit(a.fb) > w * h * 0.4, 'lit pixels ' + lit(a.fb));
      assert.strictEqual(a.fb.data.length, w * h);
      const colors = new Set(a.fb.data);
      assert.ok(colors.size > 12, 'colours ' + colors.size);
      scene.draw(a.ctx, sa, 3.9);
      assert.notStrictEqual(hash(a.fb), hash(b.fb), 'animated: frame changes over time');
    });
  });
  test('scene ' + scene.id + ': frame time bound, no memory growth over simulated time', () => {
    const f = frameCtx(192, 101, 3), st = scene.make(f.ctx, seeded(5));
    for (let i = 0; i < 5; i++) scene.draw(f.ctx, st, i / 20); // warm up
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 40; i++) scene.draw(f.ctx, st, 1 + i / 20);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 40;
    assert.ok(ms < 25, scene.id + ' avg frame ' + ms.toFixed(2) + ' ms');
    gc(); const h0 = process.memoryUsage().heapUsed;
    const fps = scene.fps || 20;
    for (let i = 0; i < fps * 30; i++) scene.draw(f.ctx, st, 3 + i / fps); // 30 simulated seconds
    gc(); const grown = (process.memoryUsage().heapUsed - h0) / 1048576;
    assert.ok(grown < 8, scene.id + ' heap grew ' + grown.toFixed(1) + ' MB');
  });
});
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

test('scene art covers the sky at the top of the grid and never draws into a reserved strip (fb is exactly the LED grid)', () => {
  // the reserved bottom strip is outside the framebuffer: widgets only see rows 0..h-1
  const f = frameCtx(192, 101, 1);
  SCENES.forEach(s => { const st = s.make(f.ctx, seeded(1)); s.draw(f.ctx, st, 2); assert.strictEqual(f.fb.data.length, 192 * 101); });
});

// ---- order logic -------------------------------------------------------------------------------------------------------------
test('order: random never repeats the previous scene; sequential wraps; disabled scenes are skipped; all disabled -> all', () => {
  const rng = seeded(4);
  let last = null;
  for (let i = 0; i < 400; i++) { const n = W.chooseNext('aleatorio', SCENES, last, rng); assert.notStrictEqual(n.id, last); last = n.id; }
  const seen = new Set(); last = null;
  for (let i = 0; i < 400; i++) { const n = W.chooseNext('aleatorio', SCENES, last, rng); seen.add(n.id); last = n.id; }
  assert.strictEqual(seen.size, SCENES.length, 'every scene appears');
  // sequential
  const ids = []; last = null;
  for (let i = 0; i < SCENES.length + 2; i++) { const n = W.chooseNext('secuencial', SCENES, last, rng); ids.push(n.id); last = n.id; }
  assert.deepStrictEqual(ids.slice(0, SCENES.length), SCENES.map(s => s.id));
  assert.deepStrictEqual(ids.slice(SCENES.length), [SCENES[0].id, SCENES[1].id], 'wraps around');
  // disabled scenes
  const cfg = Object.assign({}, S.defaults().widgets.navidad.config);
  cfg.scene_arbol = false; cfg.scene_santa = false;
  const on = W.enabledScenes(cfg, SCENES);
  assert.strictEqual(on.length, SCENES.length - 2);
  assert.ok(!on.some(s => s.id === 'arbol' || s.id === 'santa'));
  let l2 = 'muneco';
  assert.strictEqual(W.chooseNext('secuencial', on, l2, rng).id, 'chimenea', 'sequential skips disabled scenes');
  // all disabled -> fall back to all
  SCENES.forEach(s => { cfg['scene_' + s.id] = false; });
  assert.strictEqual(W.enabledScenes(cfg, SCENES).length, SCENES.length);
  // a single scene may repeat (nothing else to play)
  assert.strictEqual(W.chooseNext('aleatorio', [SCENES[0]], SCENES[0].id, rng).id, SCENES[0].id);
  assert.strictEqual(W.chooseNext('aleatorio', [], null, rng), null);
  // an unknown last id (scene removed from settings) starts at the beginning
  assert.strictEqual(W.chooseNext('secuencial', SCENES, 'nope', rng).id, SCENES[0].id);
});

test('year logic for "Feliz <año>": January shows the current year, every other month the coming one', () => {
  assert.strictEqual(W.newYear(new Date(2026, 11, 31, 23, 59)), 2027);
  assert.strictEqual(W.newYear(new Date(2026, 11, 1)), 2027);
  assert.strictEqual(W.newYear(new Date(2027, 0, 1, 0, 1)), 2027);
  assert.strictEqual(W.newYear(new Date(2027, 0, 31)), 2027);
  assert.strictEqual(W.newYear(new Date(2026, 5, 15)), 2027);
  assert.strictEqual(W.newYear(new Date(2026, 1, 1)), 2027);
});
test('Año Nuevo scene shows the computed year in its headline', () => {
  const sc = SCENES.find(s => s.id === 'anonuevo');
  [[new Date(2026, 11, 20), 2027], [new Date(2027, 0, 5), 2027], [new Date(2030, 6, 1), 2031]].forEach(([d, y]) => {
    const f = frameCtx(192, 101, 2);
    f.ctx.date = () => d;
    const drawn = [];
    const orig = f.fb.drawText.bind(f.fb);
    f.fb.drawText = function (font, text) { drawn.push(text); return orig.apply(null, arguments); };
    sc.draw(f.ctx, sc.make(f.ctx, seeded(1)), 1);
    assert.ok(drawn.includes('Feliz ' + y), 'headline for ' + d.toISOString() + ': ' + drawn.join('|'));
  });
});

test('fadeFb darkens proportionally and 0 blanks', () => {
  const fb = new Framebuffer(4, 1); fb.data.set([0xffffff, 0x804020, 0, 0x102030]);
  L.fadeFb(fb, 0.5);
  assert.strictEqual(fb.data[0], 0x7f7f7f); assert.strictEqual(fb.data[2], 0);
  assert.ok((fb.data[1] >> 16 & 255) === 0x40);
  L.fadeFb(fb, 0); assert.ok(fb.data.every(v => v === 0));
});

// ---- widget behaviour (fake clock) ----------------------------------------------------------------------------------------------
function widgetHarness(cfgOver, pinned) {
  const clock = new FakeClock(), tracks = [];
  const sch = new Scheduler({ clock: adapter(clock), getEnabled: () => [], getPauseSeconds: () => 0, getOrder: () => 'shuffle', runWidget: async () => {} });
  sch.pinned = !!pinned;
  const signal = new Signal();
  const control = { signal, sleep: ms => sch.sleep(ms, signal), activeNow: () => sch.activeNow(), isPaused: () => false, isPinned: () => sch.pinned };
  const fb = new Framebuffer(192, 101);
  const cfg = Object.assign({}, S.defaults().widgets.navidad.config, cfgOver || {});
  const ctx = createContext({ fb, fonts, cfg, control, rng: seeded(21), audio: { setTrack: n => tracks.push(n) }, nowMs: () => BASE + clock.now });
  let done = false, err = null;
  const p = W.run(ctx).then(() => { done = true; }, e => { if (!isAbort(e)) err = e; done = true; });
  return { clock, sch, fb, signal, p, tracks, isDone: () => done, err: () => err };
}

test('widget: requests the christmas track, plays "scenes per visit" scenes with a fade between them, then ends', async () => {
  W.memory.last = null;
  const h = widgetHarness({ duration: 6, scenes_per_visit: 3 });
  assert.deepStrictEqual(h.tracks, ['christmas']);
  const sample = [];
  for (let t = 0; t < 21000; t += 100) { h.clock.advance(100); await tick(); sample.push(lit(h.fb)); }
  assert.strictEqual(h.isDone(), true, '3 scenes x 6 s finished');
  assert.strictEqual(h.err(), null);
  // soft transitions: the frame fades through dark (min lit is much lower than the typical lit count) around 6 s and 12 s
  const mid = sample.slice(20, 40).sort((a, b) => a - b)[10];
  assert.ok(mid > 3000, 'scene body is bright: ' + mid);
});

test('widget: pin keeps the current scene animating with no transition; unpin lets it finish', async () => {
  W.memory.last = null;
  const h = widgetHarness({ duration: 6, scenes_per_visit: 4, scene_only: 'globo' }, true);
  let darkest = Infinity, first = null, changes = 0, last = null;
  for (let t = 0; t < 40000; t += 100) {
    h.clock.advance(100); await tick();
    if (t > 2000) darkest = Math.min(darkest, lit(h.fb));
    if (t % 1000 === 0) { const x = hash(h.fb); if (x !== last) changes++; last = x; first = first || x; }
  }
  assert.strictEqual(h.isDone(), false, 'still on the same scene after 40 s (duration 6 s)');
  assert.ok(darkest > 3000, 'never faded out while pinned: ' + darkest);
  assert.ok(changes > 10, 'kept animating: ' + changes);
  h.sch.pinned = false;
  await run(h.clock, 3000);
  assert.strictEqual(h.isDone(), true, 'finishes (fade-out) once unpinned');
  assert.strictEqual(h.err(), null);
});

test('widget: skip (next) aborts cleanly; scene_only debug config plays one scene', async () => {
  const h = widgetHarness({ duration: 10 });
  await run(h.clock, 2000);
  h.signal.abort();
  await h.p;
  assert.strictEqual(h.isDone(), true);
  assert.strictEqual(h.err(), null);
});

// ---- settings screen (remote only) --------------------------------------------------------------------------------------------------
test('settings screen: duration, order, scenes per visit and each scene switch are editable with the remote', () => {
  const settings = S.defaults(), m = new SettingsModel(settings, {});
  const goto = label => { for (let i = 0; i < 80 && m.view().rows[m.view().cursor].label !== label; i++) m.handleKey('down'); assert.strictEqual(m.view().rows[m.view().cursor].label, label); };
  goto('Navidad'); m.handleKey('right');
  assert.strictEqual(m.view().title, 'Navidad');
  const labels = m.view().rows.map(r => r.label);
  assert.ok(labels.includes('Duración (segundos)') && labels.includes('Orden de las escenas') && labels.includes('Escenas por visita'));
  SCENES.forEach(s => assert.ok(labels.includes('Escena: ' + s.name), s.name));
  const row = label => { for (let i = 0; i < 40 && m.view().rows[m.view().cursor].label !== label; i++) m.handleKey('down'); };
  row('Duración (segundos)'); m.handleKey('right'); m.handleKey('right');
  assert.strictEqual(settings.widgets.navidad.config.duration, 20);
  for (let i = 0; i < 40; i++) m.handleKey('right'); assert.strictEqual(settings.widgets.navidad.config.duration, 60, 'max 60 s');
  row('Orden de las escenas'); m.handleKey('right');
  assert.strictEqual(settings.widgets.navidad.config.order, 'secuencial');
  row('Escena: Belén'); m.handleKey('ok');
  assert.strictEqual(settings.widgets.navidad.config.scene_belen, false);
  const merged = S.merge(JSON.parse(JSON.stringify(settings)));
  assert.strictEqual(merged.widgets.navidad.config.scene_belen, false, 'persists through merge');
  assert.strictEqual(S.merge({ widgets: { navidad: { config: { duration: 2, order: 'x', scenes_per_visit: 99 } } } }).widgets.navidad.config.duration, 6);
  assert.strictEqual(S.merge({ widgets: { navidad: { config: { order: 'x' } } } }).widgets.navidad.config.order, 'aleatorio');
});

test('existing pixelart "navidad" style still works and "random" is intact', () => {
  const P = E.widgets.pixelart, f = frameCtx(192, 101, 1);
  const st = P.navidadState(f.ctx); P.drawNavidad(f.ctx, st, 2, true);
  assert.ok(lit(f.fb) > 1000);
  assert.ok(/ctx\.pick\(\['scene', 'snake', 'navidad'\]\)/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'widgets', 'pixelart.js'), 'utf8')));
});
