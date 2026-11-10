const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const T = require('../js/music/theory.js');
const C = require('../js/music/carols.js');

test('noteNum / midiToFreq', () => {
  assert.strictEqual(T.noteNum('C4'), 60);
  assert.strictEqual(T.noteNum('A4'), 69);
  assert.strictEqual(T.noteNum('F#4'), 66);
  assert.strictEqual(T.noteNum('Bb3'), 58);
  assert.throws(() => T.noteNum('H9'));
  assert.ok(Math.abs(T.midiToFreq(69) - 440) < 1e-9);
  assert.ok(Math.abs(T.midiToFreq(81) - 880) < 1e-9);
});

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = T.mulberry32(5), b = T.mulberry32(5);
  for (let i = 0; i < 100; i++) { const x = a(); assert.strictEqual(x, b()); assert.ok(x >= 0 && x < 1); }
  assert.notStrictEqual(T.mulberry32(1)(), T.mulberry32(2)());
});

function take(gen, n) { return Array.from({ length: n }, () => gen.next()); }

test('ambient: deterministic with a seed, different across seeds', () => {
  const a = take(T.createAmbient(42), 30), b = take(T.createAmbient(42), 30), c = take(T.createAmbient(43), 30);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
});

test('ambient: every event is in bounds (time, pitch, duration, velocity), plucks are pentatonic', () => {
  const blocks = take(T.createAmbient(7), 300);
  blocks.forEach(bl => {
    assert.ok(bl.length >= 14 && bl.length <= 20, 'block length ' + bl.length);
    const pads = bl.events.filter(e => e.kind === 'pad'), plucks = bl.events.filter(e => e.kind !== 'pad');
    assert.strictEqual(pads.length, 1);
    assert.ok(plucks.length >= 2 && plucks.length <= 5);
    bl.events.forEach(e => {
      assert.ok(e.t >= 0 && e.t <= bl.length, 'event time');
      assert.ok(e.dur > 0 && e.dur < 40);
      assert.ok(e.vel > 0 && e.vel <= 0.6, 'soft velocity');
      e.notes.forEach(n => assert.ok(n >= 36 && n <= 90, 'pitch ' + n));
    });
    plucks.forEach(p => assert.ok(T.PENTATONIC.includes(((p.notes[0] - bl.info.key) % 12 + 12) % 12), 'pentatonic'));
  });
});

test('ambient: evolves (several distinct chords and keys) and never repeats the same long loop', () => {
  const blocks = take(T.createAmbient(11), 200);
  const chords = new Set(blocks.map(b => b.info.key + ':' + b.info.chord.join()));
  assert.ok(chords.size >= 8, 'distinct chord/key combos ' + chords.size);
  const keys = new Set(blocks.map(b => b.info.key));
  assert.ok(keys.size >= 2);
  const sig = blocks.map(b => b.events.map(e => e.t.toFixed(2)).join());
  assert.strictEqual(new Set(sig).size, sig.length); // pluck timing never identical twice
});

test('voicing stays within a comfortable pad register', () => {
  Object.keys(T.QUALITY).forEach(q => T.KEY_ROOTS.forEach(r => T.PROGRESSIONS.forEach(p => p.forEach(ch => {
    T.voicing(r + ch[0], ch[1]).forEach(n => assert.ok(n >= 40 && n <= 84));
  }))));
});

// ---- carols: one test per melody ----------------------------------------------------------------
C.CAROLS.forEach(c => {
  test('carol "' + c.id + '": notes in range and durations sum to the expected bars', () => {
    const total = c.melody.reduce((s, n) => s + n[1], 0);
    assert.strictEqual(total, c.bars * c.beatsPerBar, 'beats ' + total);
    c.melody.forEach(n => {
      assert.ok(n[1] > 0 && n[1] <= c.beatsPerBar);
      if (n[0] !== null) assert.ok(n[0] >= 55 && n[0] <= 96, 'pitch ' + n[0]);
    });
    assert.strictEqual(c.harmony.length, c.bars);
    c.harmony.forEach(sym => assert.ok(C.CHORDS[sym], 'chord ' + sym));
    assert.ok(c.bpm >= 40 && c.bpm <= 70, 'slow tempo');
    // a bar never starts mid-note beyond the bar length: cumulative beats stay within the bar boundaries per note
    let beat = 0;
    c.melody.forEach(n => { const inBar = beat % c.beatsPerBar; assert.ok(inBar + n[1] <= c.beatsPerBar + 1e-9, 'note crosses a barline at beat ' + beat); beat += n[1]; });
  });
});

test('christmas playlist: cycles through all carols, never repeats back-to-back, soft and bounded', () => {
  const gen = C.createChristmas(3), rounds = 4, n = C.CAROLS.length;
  const blocks = take(gen, n * rounds);
  for (let r = 0; r < rounds; r++) {
    const ids = blocks.slice(r * n, (r + 1) * n).map(b => b.info.carol).sort();
    assert.deepStrictEqual(ids, C.CAROLS.map(c => c.id).sort(), 'round ' + r + ' plays every carol once');
  }
  for (let i = 1; i < blocks.length; i++) assert.notStrictEqual(blocks[i].info.carol, blocks[i - 1].info.carol, 'no immediate repeat at ' + i);
  blocks.forEach(bl => {
    const c = C.CAROLS.find(x => x.id === bl.info.carol);
    assert.ok(bl.info.bpm >= c.bpm * 0.92 - 1e-9 && bl.info.bpm <= c.bpm * 1.08 + 1e-9, 'tempo jitter');
    assert.ok(bl.info.gap >= 6 && bl.info.gap <= 15, 'gap between carols');
    assert.ok(Math.abs(bl.length - (c.bars * bl.info.bar + bl.info.gap)) < 1e-9);
    bl.events.forEach(e => {
      assert.ok(e.t >= 0 && e.t < bl.length);
      assert.ok(e.vel <= 0.45);
      e.notes.forEach(n2 => assert.ok(n2 >= 36 && n2 <= 96, 'pitch ' + n2));
    });
    const melody = bl.events.filter(e => e.kind !== 'pad');
    assert.strictEqual(melody.length, c.melody.filter(x => x[0] !== null).length);
    melody.forEach(e => assert.ok(e.notes[0] >= 55 && e.notes[0] <= 96, 'melody pitch in range after variation'));
    assert.ok(bl.events.filter(e => e.kind === 'pad').length >= 1);
  });
});

test('christmas variation: the same carol sounds different on each pass (key, octave, voice, pads, tempo)', () => {
  const blocks = take(C.createChristmas(5), C.CAROLS.length * 6);
  C.CAROLS.forEach(c => {
    const passes = blocks.filter(b => b.info.carol === c.id);
    assert.strictEqual(passes.length, 6);
    const sigs = new Set(passes.map(b => JSON.stringify([b.info.variant.shift, b.info.variant.melodyOctave, b.info.variant.voice, b.info.variant.padLift])));
    assert.ok(sigs.size >= 4, c.id + ' variants ' + sigs.size);
    assert.strictEqual(new Set(passes.map(b => b.info.bpm.toFixed(3))).size, 6, 'tempo differs every pass');
  });
  const voices = new Set(blocks.map(b => b.info.variant.voice));
  assert.deepStrictEqual([...voices].sort(), ['bell', 'pluck']);
  assert.ok(new Set(blocks.map(b => b.info.variant.melodyOctave)).size === 2);
  assert.ok(new Set(blocks.map(b => b.info.variant.padLift)).size === 2);
});

test('christmas generator is seedable', () => {
  assert.deepStrictEqual(take(C.createChristmas(9), 6), take(C.createChristmas(9), 6));
  assert.notDeepStrictEqual(take(C.createChristmas(9), 6), take(C.createChristmas(10), 6));
});
