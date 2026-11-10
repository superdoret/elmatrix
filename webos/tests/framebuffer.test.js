const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { Framebuffer, rgb, mix, parseHex, hsv } = require('../js/framebuffer.js');
const { parseBDF } = require('../js/bdf.js');

const font = parseBDF(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', '5x8.bdf'), 'utf8'));

test('setPixel / getPixel clip out of range', () => {
  const fb = new Framebuffer(4, 3);
  fb.setPixel(1, 1, 0xff0000);
  fb.setPixel(-1, 0, 0x00ff00);
  fb.setPixel(4, 0, 0x00ff00);
  assert.strictEqual(fb.getPixel(1, 1), 0xff0000);
  assert.strictEqual(fb.getPixel(9, 9), 0);
  assert.strictEqual(fb.data.reduce((a, v) => a + (v ? 1 : 0), 0), 1);
});

test('fillRect clips to the buffer', () => {
  const fb = new Framebuffer(5, 5);
  fb.fillRect(-2, -2, 4, 4, 1);
  assert.strictEqual(fb.data.filter(Boolean).length, 4);
  fb.clear(0);
  fb.fillRect(3, 3, 10, 10, 1);
  assert.strictEqual(fb.data.filter(Boolean).length, 4);
});

test('drawText returns the advance and lights pixels; scale multiplies', () => {
  const fb = new Framebuffer(60, 30);
  const adv = fb.drawText(font, 'AB', 0, 0, 0xffffff, 1);
  assert.strictEqual(adv, font.measure('AB'));
  const lit1 = fb.data.filter(Boolean).length;
  assert.ok(lit1 > 10);
  fb.clear(0);
  const adv2 = fb.drawText(font, 'AB', 0, 0, 0xffffff, 2);
  assert.strictEqual(adv2, adv * 2);
  assert.strictEqual(fb.data.filter(Boolean).length, lit1 * 4);
});

test('drawText colorFn overrides colour per pixel and text can start off-screen', () => {
  const fb = new Framebuffer(20, 10);
  fb.drawText(font, 'I', -3, 0, 0, 1, { colorFn: () => 0x123456 });
  assert.ok(fb.data.every(v => v === 0 || v === 0x123456));
});

test('drawBitmap uses a palette and treats "." as transparent', () => {
  const fb = new Framebuffer(4, 2);
  fb.drawBitmap(['#.', '.o'], 1, 0, { '#': 1, o: 2 });
  assert.strictEqual(fb.getPixel(1, 0), 1);
  assert.strictEqual(fb.getPixel(2, 0), 0);
  assert.strictEqual(fb.getPixel(2, 1), 2);
});

test('colour helpers', () => {
  assert.strictEqual(rgb(255, 0, 128), 0xff0080);
  assert.strictEqual(rgb(300, -5, 0), 0xff0000);
  assert.strictEqual(mix(0x000000, 0xffffff, 0.5), 0x808080);
  assert.strictEqual(parseHex('#00ff10'), 0x00ff10);
  assert.strictEqual(parseHex('nope', 7), 7);
  assert.strictEqual(hsv(0, 1, 1), 0xff0000);
  assert.strictEqual(hsv(120, 1, 1), 0x00ff00);
});

test('line and arrow draw without throwing', () => {
  const fb = new Framebuffer(10, 10);
  fb.line(0, 0, 9, 9, 1);
  assert.strictEqual(fb.getPixel(5, 5), 1);
  fb.arrow(0, 0, 7, 'up', 2);
  assert.strictEqual(fb.getPixel(3, 0), 2);
});
