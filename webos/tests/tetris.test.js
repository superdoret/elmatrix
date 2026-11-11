const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('./load.js');
const { Framebuffer } = require('../js/framebuffer.js');
const { createContext } = require('../js/context.js');
const { Scheduler, Signal, isAbort } = require('../js/scheduler.js');
const { parseBDF } = require('../js/bdf.js');
const S = require('../js/settings.js');
const C = require('../js/catalog.js');
const { FakeClock } = require('./fakeclock.js');
const v8 = require('v8'), vm = require('vm');

const T = E.widgets.tetris;
// Reference glyphs (6 x 10 blocks per digit), computed independently from src/tetris_led.py num_0..num_9 with a Python script.
const GLYPHS = [
[
"######",
"######",
"##..##",
"##..##",
"##..##",
"##..##",
"##..##",
"##..##",
"######",
"######"
],
[
"....##",
"....##",
"....##",
"....##",
"....##",
"....##",
"....##",
"....##",
"....##",
"....##"
],
[
"######",
"######",
"....##",
"....##",
"######",
"######",
"##....",
"##....",
"######",
"######"
],
[
"######",
"######",
"....##",
"....##",
"######",
"######",
"....##",
"....##",
"######",
"######"
],
[
"##..##",
"##..##",
"##..##",
"##..##",
"######",
"######",
"....##",
"....##",
"....##",
"....##"
],
[
"######",
"######",
"##....",
"##....",
"######",
"######",
"....##",
"....##",
"######",
"######"
],
[
"######",
"######",
"##....",
"##....",
"######",
"######",
"##..##",
"##..##",
"######",
"######"
],
[
"######",
"######",
"....##",
"....##",
"....##",
"....##",
"....##",
"....##",
"....##",
"....##"
],
[
"######",
"######",
"##..##",
"##..##",
"######",
"######",
"##..##",
"##..##",
"######",
"######"
],
[
"######",
"######",
"##..##",
"##..##",
"######",
"######",
"....##",
"....##",
"######",
"######"
]
];

const fonts = {};
['tom-thumb', '5x8', '6x13', '7x14B', '9x18B', '10x20'].forEach(n => { fonts[n] = parseBDF(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', n + '.bdf'), 'utf8')); });
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const tick = () => new Promise(r => setImmediate(r));
const adapter = clock => ({ now: () => clock.now, setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock) });
async function run(clock, ms, step) { step = step || 100; for (let t = 0; t < ms; t += step) { clock.advance(step); await tick(); } }

test('every digit 0-9 is formed exactly by its pieces (matches the original data), with no overlapping blocks', () => {
  for (let d = 0; d < 10; d++) {
    const ch = String(d), pieces = T.digitPieces(ch), seen = new Set();
    assert.deepStrictEqual(T.glyph(ch), GLYPHS[d], 'glyph of ' + ch);
    pieces.forEach(p => {
      assert.ok(p.cells.length > 0 && p.cells.length <= 4, 'tetromino-sized: ' + p.cells.length);
      assert.ok(p.color >= 0 && p.color < 8);
      p.cells.forEach(c => {
        const k = c[0] + ',' + c[1];
        assert.ok(!seen.has(k), 'digit ' + ch + ' cell ' + k + ' shared by two pieces');
        seen.add(k);
        assert.ok(c[0] >= 0 && c[0] < 6 && c[1] >= 6 && c[1] < 16, 'inside the 6x10 digit box');
      });
    });
    const lit = GLYPHS[d].join('').split('').filter(c => c === '#').length;
    assert.strictEqual(seen.size, lit, 'block count of ' + ch);
  }
});

test('the original piece data is intact: 13 pieces for 8, 5 for 1; shapes have 4 rotations of 1-2 rects', () => {
  assert.deepStrictEqual(T.DIGITS.map(d => d.length), [12, 5, 11, 11, 9, 11, 12, 7, 13, 12]);
  assert.strictEqual(T.SHAPES.length, 8);
  T.SHAPES.forEach(s => { assert.strictEqual(s.length, 4); s.forEach(r => assert.ok(r.length >= 1 && r.length <= 2)); });
});

test('digitsFor: 24h with leading zero, rollover 23:59 -> 00:00, 12h without leading zero', () => {
  assert.deepStrictEqual(T.digitsFor(new Date(2026, 0, 1, 23, 59), true), ['2', '3', '5', '9']);
  assert.deepStrictEqual(T.digitsFor(new Date(2026, 0, 2, 0, 0), true), ['0', '0', '0', '0']);
  assert.deepStrictEqual(T.digitsFor(new Date(2026, 0, 1, 7, 5), true), ['0', '7', '0', '5']);
  assert.deepStrictEqual(T.digitsFor(new Date(2026, 0, 1, 0, 5), false), ['1', '2', '0', '5']);
  assert.deepStrictEqual(T.digitsFor(new Date(2026, 0, 1, 12, 30), false), ['1', '2', '3', '0']);
  assert.deepStrictEqual(T.digitsFor(new Date(2026, 0, 1, 13, 0), false), [null, '1', '0', '0']);
  assert.deepStrictEqual(T.digitsFor(new Date(2026, 0, 1, 9, 41), false), [null, '9', '4', '1']);
  assert.deepStrictEqual(T.digitsFor(new Date(2026, 0, 1, 23, 59), false), ['1', '1', '5', '9']);
});

function restCells(slot) { const s = new Set(); slot.pieces.forEach(p => { if (p.phase === 'rest') p.p.cells.forEach(c => s.add(c.join(','))); }); return s; }

test('stepSlot: pieces of a digit fall one after another, land on their final cells, and the digit completes', () => {
  const slot = T.makeSlot(); let landed = 0, firstLanded = null, last = -1;
  for (let t = 0; t < 8; t += 0.02) {
    landed += T.stepSlot(slot, '8', t);
    const n = slot.pieces.filter(p => p.phase === 'rest').length;
    assert.ok(n >= last, 'pieces never un-land'); last = n;
    assert.ok(slot.pieces.filter(p => p.phase === 'fall').length <= 1, 'sequential: one falling piece per digit');
    if (n === 1 && firstLanded === null) firstLanded = t;
  }
  assert.strictEqual(landed, 13); assert.strictEqual(restCells(slot).size, GLYPHS[8].join('').split('').filter(c => c === '#').length);
  assert.ok(firstLanded > 0.2 && slot.doneAt > 2 && slot.doneAt < 8, 'build takes a few seconds: ' + slot.doneAt);
  // pieces rotate while falling and arrive at their final rotation
  const s2 = T.makeSlot(); T.stepSlot(s2, '2', 0); T.stepSlot(s2, '2', 0.05);
  const fp = s2.pieces.find(p => p.phase === 'fall');
  assert.ok(fp.rot <= fp.p.finalRot);
});

test('minute change: only changed digits drop away (top first) and are rebuilt; unchanged digits stay still', () => {
  const slots = [0, 1, 2, 3].map(() => T.makeSlot());
  let t = 0;
  const step = chars => slots.forEach((s, i) => T.stepSlot(s, chars[i], t));
  for (; t < 12; t += 0.05) step(['1', '4', '0', '7']);
  const before = slots.map(s => [...restCells(s)].sort().join('|'));
  assert.ok(slots.every(s => s.pieces.every(p => p.phase === 'rest')));
  // 14:07 -> 14:08
  const t0 = t;
  for (; t < t0 + 0.4; t += 0.05) step(['1', '4', '0', '8']);
  assert.strictEqual(slots[3].away, true);
  assert.ok(slots[3].pieces.some(p => p.phase === 'away' && p.y > p.p.top), 'old pieces are falling out of the field');
  for (let i = 0; i < 3; i++) assert.strictEqual([...restCells(slots[i])].sort().join('|'), before[i], 'digit ' + i + ' untouched');
  for (; t < t0 + 14; t += 0.05) step(['1', '4', '0', '8']);
  assert.strictEqual(slots[3].shown, '8');
  assert.strictEqual(restCells(slots[3]).size, GLYPHS[8].join('').split('').filter(c => c === '#').length);
  assert.ok(slots[3].pieces.every(p => p.phase === 'rest'));
  // rollover of every digit: 23:59 -> 00:00
  const r = [0, 1, 2, 3].map(() => T.makeSlot()); let u = 0;
  for (; u < 12; u += 0.05) r.forEach((s, i) => T.stepSlot(s, ['2', '3', '5', '9'][i], u));
  const u0 = u; for (; u < u0 + 16; u += 0.05) r.forEach((s, i) => T.stepSlot(s, ['0', '0', '0', '0'][i], u));
  assert.deepStrictEqual(r.map(s => s.shown), ['0', '0', '0', '0']);
  r.forEach(s => assert.ok(s.pieces.every(p => p.phase === 'rest')));
});

test('a blank slot (12h format) stays empty and can be filled when the hour grows to two digits', () => {
  const s = T.makeSlot(); let t = 0;
  for (; t < 2; t += 0.05) T.stepSlot(s, null, t);
  assert.strictEqual(s.pieces.length, 0);
  for (; t < 3; t += 0.05) T.stepSlot(s, '1', t);
  assert.strictEqual(s.away, false); // an empty slot "drops away" instantly and rebuilds
  for (; t < 12; t += 0.05) T.stepSlot(s, '1', t);
  assert.ok(restCells(s).size > 0 && s.shown === '1');
});

// ---- widget ------------------------------------------------------------------------------------------------------------------
function harness(over, pinned, w, h) {
  const clock = new FakeClock();
  const sch = new Scheduler({ clock: adapter(clock), getEnabled: () => [], getPauseSeconds: () => 0, getOrder: () => 'shuffle', runWidget: async () => {} });
  sch.pinned = !!pinned;
  const signal = new Signal();
  const control = { signal, sleep: ms => sch.sleep(ms, signal), activeNow: () => sch.activeNow(), isPaused: () => false, isPinned: () => sch.pinned };
  const fb = new Framebuffer(w || 192, h || 101);
  const cfg = Object.assign({}, S.defaults().widgets.tetris.config, { duration: 5 }, over || {});
  const base = new Date(2026, 5, 15, 14, 7, 0).getTime();
  const ctx = createContext({ fb, fonts, cfg, control, rng: seeded(5), audio: null, nowMs: () => base + clock.now });
  let done = false, err = null;
  const p = T.run(ctx).then(() => { done = true; }, e => { if (!isAbort(e)) err = e; done = true; });
  return { clock, sch, fb, signal, p, isDone: () => done, err: () => err };
}
const lit = fb => fb.data.reduce((n, v) => n + (v ? 1 : 0), 0);

test('catalog: Reloj Tetris is a default-enabled clock widget with format24h and duration', () => {
  const c = C.byId('tetris');
  assert.ok(c && c.name === 'Reloj Tetris' && c.category === 'Reloj' && c.def_enabled === true && /Tetris/.test(c.description));
  assert.deepStrictEqual(c.fields.map(f => f.key), ['format24h', 'duration']);
  assert.strictEqual(c.fields[0].def, true);
});

test('widget: draws the framed field and a full clock; honours duration and the pin; no blank frames; aborts cleanly', async () => {
  const h = harness({ duration: 4 });
  let min = Infinity;
  for (let t = 0; t < 3000; t += 100) { h.clock.advance(100); await tick(); min = Math.min(min, lit(h.fb)); }
  assert.ok(min > 5000, 'always a lit frame: ' + min);
  await run(h.clock, 3000);
  assert.strictEqual(h.isDone(), true, 'ends at its duration');
  const p = harness({ duration: 4 }, true);
  await run(p.clock, 20000);
  assert.strictEqual(p.isDone(), false, 'pinned: keeps running');
  p.sch.pinned = false; await run(p.clock, 500); assert.strictEqual(p.isDone(), true);
  const a = harness({ duration: 30 }, false, 182, 93);
  await run(a.clock, 2000); a.signal.abort(); await a.p; assert.strictEqual(a.err(), null);
});

test('widget: frame time bound and no memory growth over simulated minutes (including minute changes)', async () => {
  v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
  const h = harness({ duration: 600 }, true);
  await run(h.clock, 5000); gc();
  const h0 = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint(); let frames = 0;
  for (let t = 0; t < 130000; t += 33) { h.clock.advance(33); await tick(); frames++; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / frames;
  gc(); const grown = (process.memoryUsage().heapUsed - h0) / 1048576;
  assert.ok(grown < 12, 'heap grew ' + grown.toFixed(1) + ' MB');
  assert.ok(ms < 20, 'avg step ' + ms.toFixed(2) + ' ms');
  assert.strictEqual(h.isDone(), false); h.signal.abort(); await h.p;
});
