const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'compat.js'), 'utf8');

// Run compat.js in a fresh realm where the APIs missing on Chromium 38 have been removed.
function oldRealm(extra) {
  const ctx = vm.createContext(Object.assign({ console }, extra || {}));
  vm.runInContext(`
    delete Object.assign; delete Number.isFinite; delete Number.isInteger; delete Math.sign; delete Math.trunc;
    delete Array.prototype.fill; delete Array.prototype.includes; delete Array.prototype.find; delete Array.prototype.findIndex; delete Array.from;
    delete String.prototype.startsWith; delete String.prototype.endsWith; delete String.prototype.includes; delete String.prototype.repeat; delete String.prototype.padStart;
    var TA = Object.getPrototypeOf(Uint8Array.prototype); delete TA.fill; delete TA.slice;
    var window = this; this.window = this;`, ctx);
  vm.runInContext(src, ctx);
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);

test('compat polyfills the APIs Chromium 38 lacks', () => {
  const c = oldRealm();
  assert.strictEqual(run(c, 'typeof Object.assign'), 'function');
  assert.strictEqual(run(c, 'JSON.stringify(Object.assign({a:1},{b:2},null,{a:3}))'), '{"a":3,"b":2}');
  assert.strictEqual(run(c, 'Number.isFinite(1) && !Number.isFinite("1") && Number.isInteger(2) && !Number.isInteger(2.5)'), true);
  assert.strictEqual(run(c, '[Math.sign(-3), Math.sign(0), Math.trunc(-2.7)].join()'), '-1,0,-2');
  assert.strictEqual(run(c, '[1,2,3].fill(9,1).join()'), '1,9,9');
  assert.strictEqual(run(c, '[1,NaN].includes(NaN) && ![1].includes(2)'), true);
  assert.strictEqual(run(c, '[1,2,3].find(function(x){return x>1}) + "," + [1,2,3].findIndex(function(x){return x>5})'), '2,-1');
  assert.strictEqual(run(c, 'Array.from({length:2,0:"a",1:"b"}).join()'), 'a,b');
  assert.strictEqual(run(c, '["abc".startsWith("ab"), "abc".endsWith("bc"), "abc".includes("d"), "ab".repeat(2), "7".padStart(3,"0")].join()'), 'true,true,false,abab,007');
});

test('compat: typed array fill/slice (used by the framebuffer and renderer)', () => {
  const c = oldRealm();
  assert.strictEqual(run(c, 'new Uint32Array(5).fill(7, 1, 3).join()'), '0,7,7,0,0');
  assert.strictEqual(run(c, 'new Uint32Array(3).fill(0xffffffff).join()'), '4294967295,4294967295,4294967295');
  assert.strictEqual(run(c, 'new Uint8Array([1,2,3,4]).slice(1,3).join()'), '2,3');
  assert.strictEqual(run(c, 'new Uint32Array(4).fill(1, -2).join()'), '0,0,1,1');
});

test('compat: fetch over XHR resolves json, flags HTTP errors, rejects on network errors', async () => {
  function FakeXHR() { FakeXHR.last = this; }
  FakeXHR.prototype.open = function (m, u) { this.method = m; this.url = u; };
  FakeXHR.prototype.send = function () {
    const self = this;
    setTimeout(() => {
      if (self.url.includes('fail')) return self.onerror();
      self.status = self.url.includes('403') ? 403 : 200;
      self.responseText = '{"a":1}';
      self.onload();
    }, 1);
  };
  const c = oldRealm({ XMLHttpRequest: FakeXHR });
  const ok = await run(c, 'fetch("https://x/ok")');
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await ok.json())), { a: 1 });
  assert.strictEqual(FakeXHR.last.method, 'GET');
  const bad = await run(c, 'fetch("https://x/403")');
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.status, 403);
  await assert.rejects(run(c, 'fetch("https://x/fail")'), /Network request failed/);
});

test('compat does nothing when the engine is modern', () => {
  const before = Array.prototype.fill;
  require('../js/compat.js').install(global);
  assert.strictEqual(Array.prototype.fill, before);
});
