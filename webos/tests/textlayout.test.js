const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const TL = require('../js/textlayout.js');
const { parseBDF } = require('../js/bdf.js');

const load = n => parseBDF(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', n + '.bdf'), 'utf8'));
const fonts = { '5x8': load('5x8'), '7x14B': load('7x14B'), '10x20': load('10x20') };

test('fitText picks the largest candidate that fits', () => {
  const big = TL.fitText(fonts, ['10x20', '7x14B', '5x8'], '88:88', 180, 60, 4);
  assert.strictEqual(big.name, '10x20');
  assert.strictEqual(big.scale, 3); // 5 chars * 10 * 3 = 150 <= 180; scale 4 would be 200
  const small = TL.fitText(fonts, ['10x20', '7x14B', '5x8'], 'ESPERANZA', 100, 20, 4);
  assert.ok(small.width <= 100 && small.height <= 20);
});

test('fitText falls back to the smallest candidate when nothing fits', () => {
  const f = TL.fitText(fonts, ['10x20', '5x8'], 'X'.repeat(80), 50, 10, 2);
  assert.strictEqual(f.name, '5x8');
  assert.strictEqual(f.scale, 1);
});

test('alignX', () => {
  assert.strictEqual(TL.alignX(10, 100, 40, 'left'), 10);
  assert.strictEqual(TL.alignX(10, 100, 40, 'center'), 40);
  assert.strictEqual(TL.alignX(10, 100, 40, 'right'), 70);
});

test('truncate adds a dot only when needed', () => {
  assert.strictEqual(TL.truncate(fonts['5x8'], 'HOLA', 100), 'HOLA');
  const t = TL.truncate(fonts['5x8'], 'BARCELONA CLUB', 40);
  assert.ok(t.endsWith('.') && fonts['5x8'].measure(t) <= 40);
});

test('wrapText never exceeds the width except for single long words', () => {
  const lines = TL.wrapText(fonts['5x8'], 'UNO DOS TRES CUATRO CINCO', 60);
  lines.forEach(l => assert.ok(fonts['5x8'].measure(l) <= 60 || l.indexOf(' ') < 0));
  assert.strictEqual(lines.join(' '), 'UNO DOS TRES CUATRO CINCO');
});

test('marquee maths: starts at the right edge, ends fully off the left edge', () => {
  const view = 192, textW = 300, speed = 60;
  assert.strictEqual(TL.marqueeX(view, textW, speed, 0), 192);
  const dur = TL.marqueeDuration(view, textW, speed);
  assert.strictEqual(dur, (192 + 300) / 60);
  assert.ok(TL.marqueeX(view, textW, speed, dur) + textW <= 0);
});

test('asciiFold and pad2', () => {
  assert.strictEqual(TL.asciiFold('Atlético Ñandú'), 'Atletico Ñandu');
  assert.strictEqual(TL.pad2(7), '07');
});
