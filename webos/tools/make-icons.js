// Generates icon.png (80x80) and largeIcon.png (130x130): an LED-dot "E" on a dark tile. No dependencies.
// Usage: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LETTER = ['#####', '#....', '#....', '####.', '#....', '#....', '#####']; // 5x7 "E"

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const cols = 9, rows = 9, cell = size / cols;
  const ox = 2, oy = 1; // place the 5x7 letter inside the 9x9 grid
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const dx = (x + 0.5) / cell - cx - 0.5, dy = (y + 0.5) / cell - cy - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      const lr = cy - oy, lc = cx - ox;
      const lit = lr >= 0 && lr < 7 && lc >= 0 && lc < 5 && LETTER[lr][lc] === '#';
      const hue = (cx * 40 + cy * 10) % 360;
      const col = lit ? hsv(hue + 20, 0.85, 1) : [26, 26, 38];
      const core = d < 0.36 ? 1 : d < 0.44 ? (0.44 - d) / 0.08 : 0;
      const halo = lit && d >= 0.44 ? Math.max(0, 1 - (d - 0.44) / 0.1) * 0.25 : 0;
      const bg = [8, 8, 14];
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, Math.round(bg[k] + (col[k] - bg[k]) * core + col[k] * halo));
      px[i + 3] = 255;
    }
  }
  return px;
}
function hsv(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255].map(Math.round);
}
function crc(buf) { return zlib.crc32(buf) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size) {
  const raw = render(size), rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.concat([Buffer.from([0]), raw.subarray(y * size * 4, (y + 1) * size * 4)]));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const root = path.join(__dirname, '..');
fs.writeFileSync(path.join(root, 'icon.png'), png(80));
fs.writeFileSync(path.join(root, 'largeIcon.png'), png(130));
console.log('icons written');
