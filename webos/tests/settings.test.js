const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const S = require('../js/settings.js');
const C = require('../js/catalog.js');

test('defaults come from the catalog', () => {
  const d = S.defaults();
  assert.strictEqual(d.global.pause_seconds, 2);
  assert.strictEqual(d.global.order, 'shuffle');
  C.WIDGETS.forEach(w => {
    assert.strictEqual(d.widgets[w.id].enabled, true);
    w.fields.forEach(f => assert.deepStrictEqual(d.widgets[w.id].config[f.key], f.def));
  });
  assert.deepStrictEqual(d.widgets.worldclock.config.zones[0], 'Barcelona|Europe/Madrid');
});

test('widget ids: the catalog.py ones plus the new modes', () => {
  assert.deepStrictEqual(C.WIDGETS.map(w => w.id).sort(),
    ['aquarium', 'clock', 'countdown', 'fireplace', 'fireworks', 'forecast', 'life', 'matrixrain', 'navidad', 'phrases', 'pixelart', 'plasma', 'rates', 'sports', 'starfield', 'tetris', 'visualizer', 'word', 'worldclock']);
});

test('merge ignores garbage and keeps valid values', () => {
  assert.deepStrictEqual(S.merge(null), S.defaults());
  assert.deepStrictEqual(S.merge('x'), S.defaults());
  assert.deepStrictEqual(S.merge([1, 2]), S.defaults());
  const m = S.merge({
    global: { pause_seconds: '5', order: 'sequence', evil: 1 },
    widgets: {
      clock: { enabled: false, config: { duration: 9999, format24h: 'false', unknown: 1 } },
      ghost: { enabled: true }
    }
  });
  assert.strictEqual(m.global.pause_seconds, 5);
  assert.strictEqual(m.global.order, 'sequence');
  assert.strictEqual('evil' in m.global, false);
  assert.strictEqual(m.widgets.clock.enabled, false);
  assert.strictEqual(m.widgets.clock.config.duration, 120); // clamped to max
  assert.strictEqual(m.widgets.clock.config.format24h, false);
  assert.strictEqual('unknown' in m.widgets.clock.config, false);
  assert.strictEqual('ghost' in m.widgets, false);
});

test('coerceField: number, select, list, text, bool', () => {
  const num = { type: 'number', def: 5, min: 1, max: 10 };
  assert.strictEqual(S.coerceField(num, '0'), 1);
  assert.strictEqual(S.coerceField(num, 'abc'), 5);
  assert.strictEqual(S.coerceField(num, 7), 7);
  const sel = { type: 'select', def: 3, options: [{ value: 2, label: 'a' }, { value: 3, label: 'b' }] };
  assert.strictEqual(S.coerceField(sel, '2'), 2); // string from storage -> option value type
  assert.strictEqual(S.coerceField(sel, 9), 3);
  const list = { type: 'list', def: ['x'] };
  assert.deepStrictEqual(S.coerceField(list, 'a\n\n b \n'), ['a', 'b']);
  assert.deepStrictEqual(S.coerceField(list, 5), ['x']);
  assert.strictEqual(S.coerceField({ type: 'text', def: 'd' }, '  hola '), 'hola');
  assert.strictEqual(S.coerceField({ type: 'text', def: 'd' }, null), 'd');
  assert.strictEqual(S.coerceField({ type: 'bool', def: true }, 'nope'), true);
});

function fakeStorage(initial) {
  const m = new Map(initial ? [[S.STORAGE_KEY, initial]] : []);
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), map: m };
}

test('Store round-trips through storage', () => {
  const st = fakeStorage();
  const a = new S.Store(st);
  a.data.widgets.clock.enabled = false;
  assert.ok(a.save());
  const b = new S.Store(st);
  assert.strictEqual(b.data.widgets.clock.enabled, false);
});

test('Store survives corrupt JSON, missing storage and throwing storage', () => {
  assert.deepStrictEqual(new S.Store(fakeStorage('{not json')).data, S.defaults());
  const none = new S.Store(null);
  assert.deepStrictEqual(none.data, S.defaults());
  assert.strictEqual(none.save(), false);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const t = new S.Store(throwing);
  assert.deepStrictEqual(t.data, S.defaults());
  assert.strictEqual(t.save(), false);
});
