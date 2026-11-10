const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseBDF } = require('../js/bdf.js');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const read = n => fs.readFileSync(path.join(FONT_DIR, n + '.bdf'), 'utf8');

test('parses header metrics of a real BDF (7x14B)', () => {
  const f = parseBDF(read('7x14B'), '7x14B');
  assert.strictEqual(f.width, 7);
  assert.strictEqual(f.height, 14);
  assert.strictEqual(f.ascent, 12);
  assert.strictEqual(f.descent, 2);
  assert.ok(Object.keys(f.glyphs).length > 900);
});

test('decodes glyph bitmaps: "!" has two columns at 0x30', () => {
  const f = parseBDF(read('7x14B'));
  const g = f.glyph(33);
  assert.strictEqual(g.w, 7);
  assert.strictEqual(g.h, 14);
  // rows 2..8 are 0x30 = 00110000 -> pixels at x=2,3
  for (let r = 2; r <= 8; r++) {
    assert.deepStrictEqual([...g.pix.slice(r * 7, r * 7 + 7)], [0, 0, 1, 1, 0, 0, 0]);
  }
  assert.deepStrictEqual([...g.pix.slice(0, 7)], [0, 0, 0, 0, 0, 0, 0]);
});

test('measures strings and handles Spanish accents', () => {
  const f = parseBDF(read('7x14B'));
  assert.strictEqual(f.measure('HOLA'), 28);
  for (const ch of 'áéíóúñ¿¡ÁÑ') assert.ok(f.hasGlyph(ch.charCodeAt(0)), 'missing ' + ch);
});

test('unknown code points fall back to the default glyph, never throw', () => {
  const f = parseBDF(read('5x8'));
  assert.ok(f.glyph(0x1F600));
  assert.strictEqual(f.measure('\u{1F600}'.charAt(0)) >= 0, true);
});

test('every copied font parses', () => {
  for (const n of fs.readdirSync(FONT_DIR).filter(x => x.endsWith('.bdf'))) {
    const f = parseBDF(read(n.replace('.bdf', '')), n);
    assert.ok(f.height > 0 && f.glyph(65), n);
  }
});

test('rejects non-BDF input', () => {
  assert.throws(() => parseBDF('hello world'));
});

test('parses a tiny synthetic font with 16-bit rows', () => {
  const txt = 'STARTFONT 2.1\nFONTBOUNDINGBOX 9 2 0 0\nCHARS 1\nSTARTCHAR A\nENCODING 65\nDWIDTH 10 0\nBBX 9 2 0 0\nBITMAP\nFF80\n0080\nENDCHAR\nENDFONT\n';
  const f = parseBDF(txt);
  const g = f.glyph(65);
  assert.deepStrictEqual([...g.pix], [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.strictEqual(f.ascent, 2);
});
