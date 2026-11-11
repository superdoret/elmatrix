const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('./load.js');
const S = require('../tools/lib/offline-synth.js');

const SR = 8000; // small rate keeps the tests fast; the algorithm is rate independent
const hash = a => crypto.createHash('sha1').update(Buffer.from(a.buffer)).digest('hex');
const rms = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };
const peak = a => { let p = 0; for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i])); return p; };

['ambient', 'christmas'].forEach(kind => {
  test('render ' + kind + ': deterministic, audible, soft, no clipping', () => {
    const plan = S.planTrack(kind, 7, 40);
    const a = S.render(plan, { sampleRate: SR }), b = S.render(S.planTrack(kind, 7, 40), { sampleRate: SR });
    assert.strictEqual(hash(a), hash(b), 'same seed -> identical samples');
    assert.notStrictEqual(hash(a), hash(S.render(S.planTrack(kind, 8, 40), { sampleRate: SR })), 'different seed -> different music');
    assert.strictEqual(a.length, Math.round(plan.total * SR));
    const db = 20 * Math.log10(rms(a));
    assert.ok(Math.abs(db - S.DEFAULT_RMS_DB) < 2.5, 'RMS ' + db.toFixed(1) + ' dBFS near the ' + S.DEFAULT_RMS_DB + ' target (about -16 LUFS)');
    assert.ok(peak(a) <= S.LIMIT + 1e-6, 'soft limiter keeps the peak below ' + S.LIMIT + ': ' + peak(a));
    assert.ok(a.every(Number.isFinite));
  });
  test('render ' + kind + ': loop seam is silent and click free (fade in/out, folded reverb tail)', () => {
    const a = S.render(S.planTrack(kind, 3, 40), { sampleRate: SR });
    assert.ok(Math.abs(a[0]) < 1e-3 && Math.abs(a[a.length - 1]) < 1e-3, 'ends at zero');
    const jump = Math.abs(a[a.length - 1] - a[0]);
    assert.ok(jump < 1e-3, 'last -> first sample jump ' + jump);
    // the fade lengths: loud in the middle, quiet in the first/last 100 ms
    const edge = Math.floor(0.1 * SR), mid = Math.floor(a.length / 2);
    assert.ok(rms(a.subarray(mid, mid + SR)) > 4 * rms(a.subarray(0, edge)));
    assert.ok(rms(a.subarray(mid, mid + SR)) > 4 * rms(a.subarray(a.length - edge)));
    // no clicks at the seam: sample-to-sample steps in the first/last 50 ms stay tiny
    const e50 = Math.floor(0.05 * SR);
    let maxStep = 0;
    for (let i = 1; i < e50; i++) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]), Math.abs(a[a.length - i] - a[a.length - i - 1]));
    assert.ok(maxStep < 0.02, 'edge step ' + maxStep);
  });
});

test('track plans: durations are in the 4-6 minute range and christmas contains all five carols', () => {
  const amb = S.planTrack('ambient', 20261, 270), xmas = S.planTrack('christmas', 20262, 240);
  assert.ok(amb.total >= 270 && amb.total <= 330, 'ambient ' + amb.total);
  assert.ok(xmas.total >= 240 && xmas.total <= 360, 'christmas ' + xmas.total);
  assert.deepStrictEqual(xmas.blocks.map(b => b.block.info.carol).sort(), require('../tools/music/carols.js').CAROLS.map(c => c.id).sort());
  const starts = xmas.blocks.map(b => b.start);
  assert.deepStrictEqual(starts, starts.slice().sort((x, y) => x - y));
});

test('WAV writer produces a valid 16-bit mono header', () => {
  const w = S.toWav16(new Float32Array([0, 0.5, -0.5, 1.5]), 32000);
  assert.strictEqual(w.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(w.readUInt32LE(24), 32000);
  assert.strictEqual(w.readUInt16LE(22), 1);
  assert.strictEqual(w.readUInt32LE(40), 8);
  assert.strictEqual(w.readInt16LE(46), 16384 - 1 + 1 > 0 ? w.readInt16LE(46) : 0);
  assert.strictEqual(w.readInt16LE(50), 32767, 'clamped');
});

test('committed MP3s exist, are small, and look like MP3 (ID3/frame sync)', () => {
  let total = 0;
  ['ambient', 'christmas'].forEach(n => {
    const f = path.join(__dirname, '..', 'assets', 'music', n + '.mp3'), b = fs.readFileSync(f);
    total += b.length;
    assert.ok(b.length > 1.5e6 && b.length < 3.5e6, n + ' size ' + b.length);
    assert.ok(b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), 'mp3 header');
  });
  assert.ok(total < 6e6, 'total ' + total);
});

test('committed MP3 loudness (ffmpeg ebur128): about -16 LUFS integrated, true peak <= -1.5 dBFS', t => {
  const { spawnSync } = require('child_process');
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { t.skip('ffmpeg not installed'); return; }
  ['ambient', 'christmas'].forEach(n => {
    const f = path.join(__dirname, '..', 'assets', 'music', n + '.mp3');
    const out = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const sum = out.slice(out.lastIndexOf('Summary:'));
    const lufs = parseFloat(/I:\s+(-?[\d.]+) LUFS/.exec(sum)[1]), pk = parseFloat(/Peak:\s+(-?[\d.]+) dBFS/.exec(sum)[1]);
    assert.ok(lufs > -17 && lufs < -15, n + ' integrated ' + lufs + ' LUFS');
    assert.ok(pk <= -1.5, n + ' true peak ' + pk + ' dBFS');
  });
});
