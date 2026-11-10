const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const info = JSON.parse(fs.readFileSync(path.join(root, 'appinfo.json'), 'utf8'));

function pngSize(file) {
  const b = fs.readFileSync(path.join(root, file));
  assert.deepStrictEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], file + ' is a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('appinfo.json has the required webOS keys and only documented keys', () => {
  ['id', 'version', 'vendor', 'type', 'main', 'title', 'icon'].forEach(k => assert.ok(info[k], 'missing ' + k));
  assert.strictEqual(info.type, 'web');
  assert.match(info.id, /^[a-z0-9]+(\.[a-z0-9-]+)+$/);
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
  const allowed = ['id', 'version', 'vendor', 'type', 'main', 'title', 'icon', 'largeIcon', 'bgImage', 'splashBackground', 'disallowScrolling', 'resolution', 'bgColor', 'iconColor', 'uiRevision'];
  Object.keys(info).forEach(k => assert.ok(allowed.includes(k), 'unexpected key ' + k));
  assert.strictEqual(info.disallowScrolling, true);
  assert.match(info.resolution, /^\d+x\d+$/);
});

test('appinfo files exist with the stated sizes', () => {
  assert.ok(fs.existsSync(path.join(root, info.main)));
  assert.deepStrictEqual(pngSize(info.icon), [80, 80]);
  assert.deepStrictEqual(pngSize(info.largeIcon), [130, 130]);
});

test('index.html loads every js file and every referenced file exists', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  refs.forEach(r => assert.ok(fs.existsSync(path.join(root, r)), 'missing ' + r));
  const jsFiles = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) jsFiles.push(path.relative(root, p));
    });
  })(path.join(root, 'js'));
  jsFiles.forEach(f => assert.ok(refs.includes(f), f + ' is not loaded by index.html'));
});

test('no external URLs are loaded by the page (offline-safe, no CDN)', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!/(?:src|href)="https?:/.test(html));
});

test('font license files are shipped next to the BDF files', () => {
  ['README', 'README.md', 'AUTHORS'].forEach(f => assert.ok(fs.existsSync(path.join(root, 'assets/fonts', f)), f));
});
