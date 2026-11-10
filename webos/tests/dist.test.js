// Guards for the ES5 build (dist/): it must parse as ES5 and avoid APIs/CSS missing in Chromium 38 (webOS 3.x).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const acorn = require('acorn');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

test.before(() => { execFileSync(process.execPath, [path.join(root, 'tools', 'build.js')], { stdio: 'pipe' }); });

const distJs = () => fs.readdirSync(path.join(dist, 'js')).filter(f => f.endsWith('.js')).map(f => path.join(dist, 'js', f));

test('dist contains the package files', () => {
  ['index.html', 'appinfo.json', 'icon.png', 'largeIcon.png', 'css/app.css', 'js/elmatrix.js', 'js/polyfills.js', 'assets/fonts/7x14B.bdf', 'assets/fonts/README.md'].forEach(f =>
    assert.ok(fs.existsSync(path.join(dist, f)), f));
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  refs.forEach(r => assert.ok(fs.existsSync(path.join(dist, r)), 'missing ' + r));
  assert.deepStrictEqual(refs.filter(r => r.endsWith('.js')), ['js/polyfills.js', 'js/elmatrix.js']);
});

test('every dist JS file parses as ES5 (acorn, ecmaVersion 5)', () => {
  distJs().forEach(f => {
    assert.doesNotThrow(() => acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 5, sourceType: 'script' }), path.basename(f));
  });
});

test('dist JS tokens contain no ES2015+ constructs', () => {
  distJs().forEach(f => {
    const src = fs.readFileSync(f, 'utf8'), toks = [...acorn.tokenizer(src, { ecmaVersion: 5 })], name = path.basename(f);
    toks.forEach((tok, i) => {
      ['`', '=>', '...'].forEach(l => assert.notStrictEqual(tok.type.label, l, l + ' in ' + name));
      if (tok.type.label !== 'name') return;
      const prev = toks[i - 1], next = toks[i + 1];
      const isProp = prev && prev.type.label === '.'; // e.g. runtime.async = ... is a property name, not syntax
      if (isProp) return;
      // keyword-like identifiers that would mean unconverted ES2015+ syntax
      if (['let', 'const', 'await'].includes(tok.value)) assert.fail('identifier ' + tok.value + ' in ' + name);
      if (tok.value === 'async' && next && (next.type.label === 'function' || next.type.label === 'name')) assert.fail('async syntax in ' + name);
    });
  });
});

// APIs missing in Chromium 38 and NOT polyfilled by js/compat.js (or regenerator).
const FORBIDDEN_API = [
  /URLSearchParams/, /formatToParts/, /hourCycle/, /Object\.(entries|values|getOwnPropertyDescriptors|fromEntries)/,
  /roundRect/, /\.ellipse\(/, /\.closest\(/, /\.matches\(/, /\.flatMap?\(/, /\.replaceAll\(/, /Promise\.allSettled/, /\.finally\(/,
  /\?\./, /\?\?/, /IntersectionObserver|ResizeObserver|structuredClone|TextEncoder|TextDecoder/, /new URL\(/,
  /\bgetContext\(['"]2d['"],\s*\{/, /\.(padEnd|trimStart|trimEnd)\(/, /\.at\(-?\d/
];

test('app source and dist avoid APIs that Chromium 38 lacks (compat.js polyfills excepted)', () => {
  const files = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js') && e.name !== 'compat.js') files.push(p);
    });
  })(path.join(root, 'js'));
  files.push(path.join(dist, 'js', 'elmatrix.js'));
  files.forEach(f => {
    let src = fs.readFileSync(f, 'utf8');
    if (f.endsWith('elmatrix.js')) { // drop the compat.js section from the bundle: it only defines polyfills
      const a = src.indexOf('/* js/compat.js */'), b = src.indexOf('/* js/fallbackfont.js */');
      assert.ok(a >= 0 && b > a, 'compat section markers');
      src = src.slice(0, a) + src.slice(b);
    }
    src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    FORBIDDEN_API.forEach(re => assert.ok(!re.test(src), re + ' found in ' + path.relative(root, f)));
  });
});

// CSS features missing in Chromium 38. Exceptions: none.
const FORBIDDEN_CSS = [
  [/var\(/, 'custom properties'], [/--[a-z]/, 'custom property definition'], [/display:\s*(inline-)?grid|grid-(template|area|column|row|gap)/, 'CSS grid'],
  [/position:\s*sticky/, 'sticky'], [/(^|[;{\s])inset:/, 'inset'], [/aspect-ratio/, 'aspect-ratio'], [/\b(clamp|min|max)\(/, 'clamp()/min()/max()'],
  [/backdrop-filter/, 'backdrop-filter'], [/:focus-visible/, ':focus-visible'], [/(^|[;{\s])(row-|column-)?gap:/, 'gap'],
  [/:is\(|:where\(|:has\(/, 'modern selectors'], [/@supports|@container|@layer/, 'modern at-rules']
];

test('CSS (source and dist) avoids features missing in Chromium 38', () => {
  [path.join(root, 'css', 'app.css'), path.join(dist, 'css', 'app.css')].forEach(f => {
    const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    FORBIDDEN_CSS.forEach(([re, what]) => assert.ok(!re.test(css), what + ' in ' + path.relative(root, f)));
    // unprefixed keyframes/animation need -webkit- twins on Chromium < 43
    if (/@keyframes/.test(css)) assert.ok(/@-webkit-keyframes/.test(css) && /-webkit-animation/.test(css), 'missing -webkit- animation fallback');
  });
});

test('dist HTML has no inline modern-only constructs and loads nothing external', () => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.ok(!/https?:\/\//.test(html.replace(/<html[^>]*>/, '')));
  assert.ok(!/type="module"|nomodule/.test(html));
});

test('audio engine only uses Web Audio calls available on Chromium 38 and guards resume()', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'audio.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/webkitAudioContext/.test(src), 'prefixed constructor fallback');
  const resumes = src.match(/\.resume\(/g) || [];
  assert.strictEqual(resumes.length, 1);
  assert.ok(/typeof ctx\.resume === 'function'/.test(src), 'resume() must be feature-checked');
  assert.ok(!/\.state\s*=[^=]/.test(src));
  // ctx.state may be undefined on old engines: only compared, never required
  assert.ok(/ctx\.state === undefined/.test(src));
});
