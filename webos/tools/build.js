// Builds dist/: an ES5-only, single-bundle copy of the app for old webOS TVs (3.x = Chromium 38).
// Source stays modern; Babel (preset-env, chrome 38) compiles each script in index.html order.
// Usage: node tools/build.js   (or: npm run build)
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const rel = p => path.join(root, p);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'js'), { recursive: true });

const html = fs.readFileSync(rel('index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (!scripts.length) throw new Error('no scripts found in index.html');

const compiled = scripts.map(src => {
  const out = babel.transformSync(fs.readFileSync(rel(src), 'utf8'), {
    filename: rel(src),
    babelrc: false,
    configFile: false,
    sourceType: 'script',
    comments: false,
    compact: false,
    presets: [['@babel/preset-env', { targets: { chrome: '38' }, modules: false }]]
  });
  return '/* ' + src + ' */\n' + out.code;
});

// regenerator-runtime provides the generator machinery Babel emits for async/await.
const regen = fs.readFileSync(require.resolve('regenerator-runtime/runtime.js'), 'utf8');
fs.writeFileSync(path.join(dist, 'js', 'polyfills.js'), regen + '\n');
fs.writeFileSync(path.join(dist, 'js', 'elmatrix.js'), compiled.join('\n;\n') + '\n');

// index.html: replace the script list with the two bundles.
const first = html.indexOf('<script src=');
const lastTag = '</script>';
const last = html.lastIndexOf(lastTag) + lastTag.length;
const outHtml = html.slice(0, first) + '<script src="js/polyfills.js"></script>\n  <script src="js/elmatrix.js"></script>' + html.slice(last);
fs.writeFileSync(path.join(dist, 'index.html'), outHtml);

// static files
fs.cpSync(rel('css'), path.join(dist, 'css'), { recursive: true });
fs.cpSync(rel('assets'), path.join(dist, 'assets'), { recursive: true });
['appinfo.json', 'icon.png', 'largeIcon.png'].forEach(f => fs.copyFileSync(rel(f), path.join(dist, f)));

const kb = f => (fs.statSync(path.join(dist, f)).size / 1024).toFixed(0) + ' KB';
console.log('dist/ built: js/elmatrix.js ' + kb('js/elmatrix.js') + ', js/polyfills.js ' + kb('js/polyfills.js') + ' (' + scripts.length + ' scripts compiled)');
console.log('Next: ares-package dist');
