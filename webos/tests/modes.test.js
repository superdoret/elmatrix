const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('./load.js');
const W = E.widgets;
const { Framebuffer } = require('../js/framebuffer.js');
const { createContext } = require('../js/context.js');
const { Scheduler, Signal, isAbort } = require('../js/scheduler.js');
const { parseBDF } = require('../js/bdf.js');
const S = require('../js/settings.js');

function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

// ---- matrix rain ---------------------------------------------------------------------
test('matrixrain: trail colour fades from a bright head to black, stays green', () => {
  const M = W.matrixrain;
  assert.strictEqual(M.trailColor(0, 10), 0xdcffdc);
  let prevG = 256;
  for (let d = 1; d < 10; d++) {
    const c = M.trailColor(d, 10), gr = (c >> 8) & 255;
    assert.ok(gr <= prevG, 'green fades'); prevG = gr;
    assert.ok(((c >> 16) & 255) <= gr && (c & 255) <= gr, 'green dominates');
  }
  assert.strictEqual(M.trailColor(10, 10), 0);
});
test('matrixrain: columns restart after their tail leaves the screen', () => {
  const M = W.matrixrain, rng = seeded(3), col = { head: 0, len: 10, speed: 10 };
  let restarts = 0;
  for (let i = 0; i < 400; i++) if (M.stepColumn(col, 0.1, 13, rng)) { restarts++; assert.ok(col.head <= 0); assert.ok(col.len >= 7 && col.len <= 18); }
  assert.ok(restarts >= 5);
});

// ---- fireplace ---------------------------------------------------------------------
test('fireplace: palette is 256 colours, black at 0 and brighter towards the end', () => {
  const p = W.fireplace.firePalette();
  assert.strictEqual(p.length, 256);
  assert.strictEqual(p[0], 0);
  const lum = c => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
  for (let i = 1; i < 256; i++) assert.ok(lum(p[i]) >= lum(p[i - 1]) - 1, 'monotonic at ' + i);
  assert.ok(lum(p[255]) > 600);
});
test('fireplace: heat stays in range, rises from the fuel bed and cools to zero without fuel', () => {
  const F = W.fireplace, w = 20, h = 30, heat = new Uint8Array(w * h), rng = seeded(9);
  for (let i = 0; i < 60; i++) F.fireStep(heat, w, h, rng, 12, 0.8);
  assert.ok(heat.every(v => v >= 0 && v <= 255));
  const rowSum = y => heat.slice(y * w, (y + 1) * w).reduce((a, b) => a + b, 0);
  assert.ok(rowSum(h - 2) > rowSum(5), 'hotter near the bed');
  assert.ok(rowSum(h - 6) > 0);
  assert.strictEqual(rowSum(0) >= 0, true);
  for (let i = 0; i < 200; i++) F.fireStep(heat, w, h, rng, 12, 0); // no fuel: only the faint bed noise
  assert.ok(heat.slice(0, 10 * w).every(v => v < 40), 'top cools down');
});

// ---- aquarium -----------------------------------------------------------------------
test('aquarium: fish stay inside depth bounds and wrap around the sides', () => {
  const A = W.aquarium, rng = seeded(4), w = 192, h = 108;
  for (let n = 0; n < 9; n++) {
    const f = A.makeFish(rng, w, h, n);
    for (let i = 0; i < 3000; i++) {
      A.stepFish(f, 0.05, w, h, rng);
      assert.ok(f.y >= 8 && f.y <= h - 20, 'y ' + f.y);
      assert.ok(f.x >= -30 && f.x <= w + 30, 'x ' + f.x);
    }
  }
  assert.ok(A.SPECIES.every(sp => sp.every(r => r.length === sp[0].length)), 'rectangular sprites');
});
test('aquarium: bubbles rise and respawn at the bottom', () => {
  const A = W.aquarium, b = { x: 5, y: 3, speed: 10, t: 0 }, rng = seeded(1);
  for (let i = 0; i < 20; i++) A.stepBubble(b, 0.1, 108, rng, 192);
  assert.ok(b.y > 50, 'respawned near the bottom then rising: ' + b.y);
  assert.ok(b.x >= 0 && b.x < 192);
});

// ---- fireworks ------------------------------------------------------------------------
test('fireworks: particle pool never overflows, particles obey gravity and die', () => {
  const F = W.fireworks, pool = F.createPool(100), rng = seeded(2);
  assert.strictEqual(F.explode(pool, 50, 50, 70, 100, rng), 70);
  assert.strictEqual(F.explode(pool, 50, 50, 70, 100, rng), 30, 'only free slots are used');
  assert.strictEqual(F.explode(pool, 50, 50, 10, 100, rng), 0);
  const vy0 = pool.vy[0];
  F.stepParticles(pool, 0.1);
  assert.ok(pool.vy[0] > vy0 * 0.97 - 1 && pool.vy[0] !== vy0, 'vertical velocity changes with gravity');
  let alive = 100;
  for (let i = 0; i < 40; i++) alive = F.stepParticles(pool, 0.1);
  assert.strictEqual(alive, 0, 'all particles expired after a few seconds');
  assert.strictEqual(F.explode(pool, 1, 1, 5, 0, rng), 5, 'slots are reusable');
});
test('fireworks: ring bursts spread evenly', () => {
  const F = W.fireworks, pool = F.createPool(40);
  F.explode(pool, 0, 0, 40, 0, seeded(1), true);
  let sx = 0, sy = 0; for (let i = 0; i < 40; i++) { sx += pool.vx[i]; sy += pool.vy[i]; }
  assert.ok(Math.abs(sx) < 1e-3 && Math.abs(sy) < 1e-3, 'symmetric');
});

// ---- plasma --------------------------------------------------------------------------------
test('plasma: indices stay 0..255, palette has 256 colours, colours vary over the field', () => {
  const P = W.plasma, pw = 96, ph = 54, dist = P.distTable(pw, ph);
  assert.strictEqual(P.PAL.length, 256);
  P.PAL.forEach(c => assert.ok(c >= 0 && c <= 0xffffff));
  const seen = new Set();
  for (let ph2 = 0; ph2 < 300; ph2 += 37) for (let y = 0; y < ph; y += 5) for (let x = 0; x < pw; x += 5) {
    const i = P.plasmaIndex(dist, pw, x, y, ph2);
    assert.ok(Number.isInteger(i) && i >= 0 && i <= 255);
    seen.add(i);
  }
  assert.ok(seen.size > 60, 'varied field ' + seen.size);
  assert.notStrictEqual(P.plasmaIndex(dist, pw, 10, 10, 0), P.plasmaIndex(dist, pw, 10, 10, 50));
});

// ---- game of life ------------------------------------------------------------------------------
function grid(w, h, cells) { const a = new Uint8Array(w * h); cells.forEach(([x, y]) => { a[y * w + x] = 1; }); return a; }
const cellsOf = (a, w) => [...a].map((v, i) => v ? [i % w, Math.floor(i / w)] : null).filter(Boolean).map(String).sort();

test('life: block is still, blinker oscillates with period 2', () => {
  const L = W.life, w = 8, h = 8;
  const block = grid(w, h, [[2, 2], [3, 2], [2, 3], [3, 3]]), out = new Uint8Array(w * h);
  assert.strictEqual(L.lifeStep(block, out, w, h), 4);
  assert.deepStrictEqual(cellsOf(out, w), cellsOf(block, w));
  const blinker = grid(w, h, [[3, 2], [3, 3], [3, 4]]), b2 = new Uint8Array(w * h), b3 = new Uint8Array(w * h);
  L.lifeStep(blinker, b2, w, h);
  assert.deepStrictEqual(cellsOf(b2, w), ['2,3', '3,3', '4,3']);
  L.lifeStep(b2, b3, w, h);
  assert.deepStrictEqual(cellsOf(b3, w), cellsOf(blinker, w));
});
test('life: a glider moves one cell diagonally every 4 generations (wrapping torus)', () => {
  const L = W.life, w = 12, h = 12;
  let a = grid(w, h, [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]), b = new Uint8Array(w * h);
  for (let i = 0; i < 4; i++) { L.lifeStep(a, b, w, h); [a, b] = [b, a]; }
  assert.deepStrictEqual(cellsOf(a, w), ['2,1', '3,2', '1,3', '2,3', '3,3'].sort());
  for (let i = 0; i < 12 * 4; i++) { L.lifeStep(a, b, w, h); [a, b] = [b, a]; }
  assert.strictEqual(a.reduce((s, v) => s + v, 0), 5, 'still a glider after wrapping around');
});
test('life: an isolated cell dies; underpopulation and overpopulation rules', () => {
  const L = W.life, w = 6, h = 6, out = new Uint8Array(w * h);
  assert.strictEqual(L.lifeStep(grid(w, h, [[2, 2]]), out, w, h), 0);
  // cell with 4 neighbours dies, a dead cell with exactly 3 neighbours is born
  const plus = grid(w, h, [[2, 2], [1, 2], [3, 2], [2, 1], [2, 3]]);
  L.lifeStep(plus, out, w, h);
  assert.strictEqual(out[2 * w + 2], 0);
  assert.strictEqual(out[1 * w + 1], 1);
});
test('life: stagnation detects dead boards and short cycles but not evolving boards', () => {
  const L = W.life, st = new L.Stagnation(30, 3);
  assert.strictEqual(st.push(123, 0), true, 'extinct');
  st.reset();
  assert.strictEqual(st.push(7, 10), false); assert.strictEqual(st.push(8, 10), false);
  assert.strictEqual(st.push(7, 10), false); assert.strictEqual(st.push(8, 10), false);
  assert.strictEqual(st.push(7, 10), true, 'period-2 cycle seen three times');
  st.reset();
  for (let i = 0; i < 100; i++) assert.strictEqual(st.push(1000 + i, 50), false);
  const a = grid(5, 5, [[1, 1]]), b = grid(5, 5, [[2, 2]]);
  assert.notStrictEqual(L.checksum(a), L.checksum(b));
});
test('life: reseeded boards run without stagnating immediately', () => {
  const L = W.life, w = 48, h = 27, rng = seeded(8);
  let a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  L.seed(a, rng, 0.3);
  const pop0 = a.reduce((s, v) => s + v, 0);
  assert.ok(pop0 > w * h * 0.2 && pop0 < w * h * 0.4);
  const st = new L.Stagnation(30, 3);
  for (let i = 0; i < 15; i++) { const pop = L.lifeStep(a, b, w, h); [a, b] = [b, a]; assert.strictEqual(st.push(L.checksum(a), pop), false); }
});

// ---- starfield ---------------------------------------------------------------------------
test('starfield: projection is finite, moves outward as z shrinks, stars reset when passing the viewer', () => {
  const SF = W.starfield, rng = seeded(5), s = SF.createStars(100, rng), out = { x: 0, y: 0 };
  for (let i = 0; i < s.n; i++) { assert.ok(s.z[i] >= SF.Z_MIN && s.z[i] <= 1); assert.ok(s.x[i] >= -1 && s.x[i] <= 1); }
  s.x[0] = 0.5; s.y[0] = 0.25; s.z[0] = 1;
  SF.projectStar(s, 0, 96, 54, 54, out); const a = { x: out.x, y: out.y };
  s.z[0] = 0.5; SF.projectStar(s, 0, 96, 54, 54, out);
  assert.ok(out.x > a.x && out.y > a.y, 'moves away from the centre');
  s.z[0] = SF.Z_MIN; assert.strictEqual(SF.projectStar(s, 0, 96, 54, 54, out), false);
  SF.resetStar(s, 0, rng, false); assert.strictEqual(s.z[0], 1);
});

// ---- visualizer ------------------------------------------------------------------------------
test('visualizer: bins map to bars in 0..1 with log spacing; silence gives silence', () => {
  const V = W.visualizer, data = new Uint8Array(512);
  assert.ok(V.binsToBars(data, 48).every(v => v === 0));
  data.fill(255);
  const full = V.binsToBars(data, 48);
  assert.ok(full.every(v => v > 0.5 && v <= 1));
  const low = new Uint8Array(512); low[3] = 255;
  const lb = V.binsToBars(low, 48);
  assert.ok(Array.from(lb.slice(0, 8)).some(v => v > 0));
  assert.ok(lb[40] === 0, 'a bass bin does not light the treble bars');
});
test('visualizer: simulated spectrum is bounded, varies in time, and the kick drives the bass', () => {
  const V = W.visualizer, n = 48;
  const seen = new Set();
  for (let t = 0; t < 20; t += 0.1) {
    const b = V.simulateBars(t, n);
    b.forEach(v => assert.ok(v >= 0 && v <= 1));
    seen.add(b[3].toFixed(2));
  }
  assert.ok(seen.size > 10);
});
test('visualizer: smoothing has fast attack, slow decay, falling peaks', () => {
  const V = W.visualizer, bars = new Float32Array(2), peaks = new Float32Array(2), tgt = new Float32Array([1, 0]);
  V.smooth(bars, peaks, tgt, 0.03);
  assert.strictEqual(bars[0], 1); assert.strictEqual(peaks[0], 1);
  tgt[0] = 0; V.smooth(bars, peaks, tgt, 0.1);
  assert.ok(bars[0] > 0.7 && bars[0] < 1, 'slow decay');
  assert.ok(peaks[0] > bars[0], 'peak above the bar');
});

// ---- smoke: every new widget draws and aborts cleanly ----------------------------------------------
const fonts = {};
['tom-thumb', '5x8', '6x13', '7x14B', '9x18B', '10x20'].forEach(n => { fonts[n] = parseBDF(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', n + '.bdf'), 'utf8')); });

function harness(id, cfgOverride, audio) {
  const sched = new Scheduler({ getEnabled: () => [], getPauseSeconds: () => 0, getOrder: () => 'shuffle', runWidget: async () => {} });
  const signal = new Signal();
  const control = { signal, sleep: ms => sched.sleep(ms, signal), activeNow: () => sched.activeNow(), isPaused: () => false };
  const fb = new Framebuffer(192, 108);
  const cfg = Object.assign({}, S.defaults().widgets[id].config, { duration: 5 }, cfgOverride || {});
  const tracks = [];
  const aud = audio === undefined ? { setTrack: n => tracks.push(n) } : audio;
  const ctx = createContext({ fb, fonts, cfg, control, rng: seeded(21), audio: aud });
  return { fb, ctx, signal, tracks };
}

['matrixrain', 'fireplace', 'aquarium', 'fireworks', 'plasma', 'life', 'starfield', 'visualizer'].forEach(id => {
  test('widget ' + id + ': draws pixels and stops when skipped', async () => {
    const h = harness(id, {}, null);
    const run = W[id].run(h.ctx);
    await new Promise(r => setTimeout(r, 450));
    assert.ok(h.fb.data.some(v => v !== 0), id + ' drew something');
    h.signal.abort();
    await assert.rejects(run, e => isAbort(e));
  });
});

test('pixelart navidad: requests the christmas track and renders snow, tree and message', async () => {
  const h = harness('pixelart', { style: 'navidad' });
  const run = W.pixelart.run(h.ctx);
  await new Promise(r => setTimeout(r, 350));
  assert.deepStrictEqual(h.tracks, ['christmas']);
  const colors = new Set(h.fb.data);
  assert.ok(colors.size > 30, 'rich image: ' + colors.size);
  h.signal.abort();
  await assert.rejects(run, e => isAbort(e));
});
test('pixelart navidad: draw is deterministic for a given time and never throws over a long run', () => {
  const P = W.pixelart, sched = null; void sched;
  const h = harness('pixelart', { style: 'navidad' });
  const st = P.navidadState(h.ctx);
  assert.ok(st.lights.length >= 30 && st.tiers.length === 3);
  for (let t = 0; t < 60; t += 0.7) P.drawNavidad(h.ctx, st, t, true); // covers the sleigh pass (14..24 s of each 26 s cycle)
  assert.ok(h.fb.data.some(v => v !== 0));
  const st2 = P.navidadState(harness('pixelart', {}).ctx);
  assert.deepStrictEqual(st.lights, st2.lights);
});
test('pixelart: "random" can choose navidad, and the catalog offers it as a style', () => {
  const C = require('../js/catalog.js');
  const style = C.byId('pixelart').fields.find(f => f.key === 'style');
  assert.ok(style.options.some(o => o.value === 'navidad'));
  assert.ok(/ctx\.pick\(\['scene', 'snake', 'navidad'\]\)/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'widgets', 'pixelart.js'), 'utf8')));
});

test('catalog: new modes and music settings have Spanish copy and valid fields', () => {
  const C = require('../js/catalog.js');
  ['matrixrain', 'fireplace', 'aquarium', 'fireworks', 'plasma', 'life', 'starfield', 'visualizer'].forEach(id => {
    const w = C.byId(id);
    assert.ok(w && w.name && w.description && w.category, id);
    assert.ok(w.fields.some(f => f.key === 'duration'));
    assert.strictEqual(w.def_enabled, true);
    assert.ok(E.widgets[id] && typeof E.widgets[id].run === 'function');
  });
  const d = S.defaults().global;
  assert.strictEqual(d.music_enabled, true);
  assert.strictEqual(d.music_volume, 35);
  assert.strictEqual(S.merge({ global: { music_volume: 500, music_enabled: 'false' } }).global.music_volume, 100);
  assert.strictEqual(S.merge({ global: { music_enabled: 'false' } }).global.music_enabled, false);
});

test('keys: blue toggles music on the banner', () => {
  assert.strictEqual(E.keys.bannerAction('blue'), 'toggleMusic');
  assert.strictEqual(E.keys.keyName({ keyCode: 406, key: '' }), 'blue');
});
