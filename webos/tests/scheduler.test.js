const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const { ShuffleBag, Picker, Scheduler, Signal, isAbort } = require('../js/scheduler.js');

function seeded(seed) { // deterministic rng
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('ShuffleBag plays every item once per round and never repeats across rounds', () => {
  const bag = new ShuffleBag(seeded(1)), items = ['a', 'b', 'c', 'd'];
  let prev = null;
  for (let round = 0; round < 50; round++) {
    const seen = [];
    for (let i = 0; i < items.length; i++) {
      const id = bag.next(items);
      seen.push(id);
      if (i === 0 && prev) assert.notStrictEqual(id, prev, 'repeat at round boundary');
    }
    assert.deepStrictEqual([...seen].sort(), items);
    prev = seen[seen.length - 1];
  }
});

test('ShuffleBag handles empty, single and changing sets', () => {
  const bag = new ShuffleBag(seeded(2));
  assert.strictEqual(bag.next([]), null);
  assert.strictEqual(bag.next(['x']), 'x');
  assert.strictEqual(bag.next(['x']), 'x');
  bag.next(['x', 'y', 'z']);
  for (let i = 0; i < 20; i++) assert.ok(['y', 'z'].includes(bag.next(['y', 'z'])));
});

test('Picker sequence order follows the enabled list and wraps', () => {
  const p = new Picker();
  const ids = ['a', 'b', 'c'];
  assert.deepStrictEqual([1, 2, 3, 4].map(() => p.pick(ids, 'sequence')), ['a', 'b', 'c', 'a']);
  assert.strictEqual(p.pick(['b', 'c'], 'sequence'), 'b'); // 'a' was disabled -> next valid
  assert.strictEqual(p.pick([], 'sequence'), null);
});

function makeScheduler(opts) {
  const log = [];
  const state = { enabled: ['a', 'b', 'c'], pause: 0, order: 'sequence', runMs: 15 };
  Object.assign(state, opts || {});
  const s = new Scheduler({
    getEnabled: () => state.enabled, getPauseSeconds: () => state.pause, getOrder: () => state.order,
    runWidget: async (id, control) => { log.push('start:' + id); await control.sleep(state.runMs); log.push('end:' + id); },
    onEvent: (t, d) => { if (t === 'error') log.push('error:' + d.id); },
    rng: seeded(3)
  });
  return { s, log, state };
}

test('runs widgets in sequence order and stops cleanly', async () => {
  const { s, log } = makeScheduler();
  s.start();
  await sleep(120);
  await s.stop();
  const starts = log.filter(l => l.startsWith('start:')).map(l => l.slice(6));
  assert.deepStrictEqual(starts.slice(0, 4), ['a', 'b', 'c', 'a']);
});

test('skip aborts the current widget early', async () => {
  const { s, log } = makeScheduler({ runMs: 5000 });
  s.start();
  await sleep(30);
  assert.strictEqual(s.current, 'a');
  s.skip();
  await sleep(30);
  assert.deepStrictEqual(log.filter(l => l.startsWith('start:')).slice(0, 2), ['start:a', 'start:b']);
  assert.ok(!log.includes('end:a') || log.indexOf('end:a') < log.indexOf('start:b'));
  await s.stop();
});

test('prev goes back to the previous widget; runNow forces one', async () => {
  const { s, log } = makeScheduler({ runMs: 5000 });
  s.start();
  await sleep(20);
  s.skip(); await sleep(20);
  s.skip(); await sleep(20);
  assert.strictEqual(s.current, 'c');
  s.prev(); await sleep(20);
  assert.strictEqual(s.current, 'b');
  s.runNow('a'); await sleep(20);
  assert.strictEqual(s.current, 'a');
  await s.stop();
  void log;
});

test('pause freezes widget time; resume continues', async () => {
  const { s, log } = makeScheduler({ runMs: 120 });
  s.start();
  await sleep(30);
  s.pause();
  await sleep(250); // longer than the widget duration
  assert.ok(!log.includes('end:a'), 'widget must not finish while paused');
  s.resume();
  await sleep(160);
  assert.ok(log.includes('end:a'));
  await s.stop();
});

test('activeNow does not advance while paused', async () => {
  const { s } = makeScheduler();
  const t0 = s.activeNow();
  s.pause();
  await sleep(60);
  const t1 = s.activeNow();
  assert.ok(Math.abs(t1 - t0) < 15);
  s.resume();
  await sleep(40);
  assert.ok(s.activeNow() - t1 >= 30);
});

test('a throwing widget does not stop the rotation', async () => {
  const seen = [];
  const s = new Scheduler({
    getEnabled: () => ['bad', 'ok'], getPauseSeconds: () => 0, getOrder: () => 'sequence',
    runWidget: async id => { seen.push(id); if (id === 'bad') throw new Error('boom'); await sleep(5); },
    onEvent() {}
  });
  s.start();
  await sleep(1800);
  await s.stop();
  assert.ok(seen.includes('ok'), 'rotation continued after the error: ' + seen.join(','));
});

test('no enabled widgets -> idle event, no crash; settings changes are picked up', async () => {
  const events = [];
  const state = { enabled: [] };
  const s = new Scheduler({
    getEnabled: () => state.enabled, getPauseSeconds: () => 0, getOrder: () => 'shuffle',
    runWidget: async (id, c) => { events.push('run:' + id); await c.sleep(5); },
    onEvent: t => { if (t === 'idle') events.push('idle'); }
  });
  s.start();
  await sleep(40);
  assert.ok(events.includes('idle'));
  state.enabled = ['z'];
  s.skip();
  await sleep(60);
  assert.ok(events.includes('run:z'));
  await s.stop();
});

test('Signal and AbortError helpers', () => {
  const sig = new Signal();
  let n = 0;
  sig.onAbort(() => n++);
  sig.abort(); sig.abort();
  assert.strictEqual(n, 1);
  assert.ok(sig.aborted);
  sig.onAbort(() => n++);
  assert.strictEqual(n, 2); // late subscribers fire immediately
  assert.ok(isAbort(Object.assign(new Error('x'), { name: 'AbortError' })));
});
