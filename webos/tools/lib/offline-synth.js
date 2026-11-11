// Pure-JS offline synthesizer: renders the generated music (tools/music/*) to mono PCM.
// Same voices as the original Web Audio design (warm pads, plucks, bells) plus a Schroeder reverb,
// a soft echo, a soft limiter and loop-friendly fades. Deterministic for a given seed. No dependencies.
const path = require('path');
const T = require(path.join(__dirname, '..', 'music', 'theory.js'));
const C = require(path.join(__dirname, '..', 'music', 'carols.js'));

const SR = 32000;
const TAU = Math.PI * 2;
const TAIL = 7; // seconds of reverb tail folded back onto the start (seamless loop)

/** Plan a track: sequential generator blocks until at least `minSeconds`. -> {blocks, total, kind} */
function planTrack(kind, seed, minSeconds) {
  const gen = kind === 'christmas' ? C.createChristmas(seed) : T.createAmbient(seed);
  const blocks = [];
  let total = 0, rounds = 0;
  while (total < minSeconds || (kind === 'christmas' && blocks.length < C.CAROLS.length)) {
    const b = gen.next();
    blocks.push({ block: b, start: total });
    total += b.length;
    if (++rounds > 200) break;
  }
  return { kind, blocks, total };
}

const tri = p => 4 * Math.abs(p - Math.floor(p + 0.5)) - 1;

function addPad(buf, sr, t0, notes, dur, vel, attack, release, cutoff) {
  const n = Math.floor((dur + release) * sr), start = Math.floor(t0 * sr);
  const peak = vel * 0.8 / Math.max(2, notes.length), a = Math.exp(-TAU * cutoff / sr);
  const holdEnd = Math.max(dur, attack);
  const phases = [];
  notes.forEach(m => { const f = T.midiToFreq(m); phases.push([f * 0.997, 0], [f * 1.003, 0]); });
  let lp = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / sr;
    const env = t < attack ? peak * t / attack : t < holdEnd ? peak : peak * Math.max(0, 1 - (t - holdEnd) / release);
    let s = 0;
    for (let k = 0; k < phases.length; k++) {
      const ph = phases[k];
      ph[1] += ph[0] / sr; if (ph[1] > 1) ph[1] -= 1;
      s += (k & 1) ? Math.sin(TAU * ph[1]) : tri(ph[1]);
    }
    lp = (1 - a) * s + a * lp;
    buf[start + i] += lp * env;
  }
}

function addPluck(buf, sr, t0, midi, dur, vel, bell) {
  const f = T.midiToFreq(midi), start = Math.floor(t0 * sr), n = Math.floor(dur * sr);
  const partials = bell ? [[1, 1], [2.76, 0.28], [5.4, 0.1]] : [[1, 1], [2, 0.25]];
  for (const [ratio, amp] of partials) {
    const pdur = dur * (ratio === 1 ? 1 : 0.45), pn = Math.min(n, Math.floor(pdur * sr)), w = TAU * f * ratio / sr;
    for (let i = 0; i < pn && start + i < buf.length; i++) {
      const t = i / sr;
      const env = t < 0.012 ? vel * 0.5 * t / 0.012 : t < Math.min(0.4, dur * 0.3) ? vel * (0.5 - 0.38 * (t - 0.012) / (Math.min(0.4, dur * 0.3) - 0.012)) : vel * 0.12 * Math.max(0, 1 - (t - Math.min(0.4, dur * 0.3)) / Math.max(1e-3, pdur - Math.min(0.4, dur * 0.3)));
      buf[start + i] += Math.sin(w * i) * amp * env;
    }
  }
}

// Schroeder reverb (6 damped combs + 2 allpass) in place-safe: returns a new buffer.
function reverb(input, sr, feedback) {
  const scale = sr / 44100, out = new Float32Array(input.length);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(d => ({ d: Math.round(d * scale), buf: null, i: 0, lp: 0 }));
  combs.forEach(c => { c.buf = new Float32Array(c.d); });
  const aps = [225, 556].map(d => ({ d: Math.round(d * scale), buf: null, i: 0 }));
  aps.forEach(c => { c.buf = new Float32Array(c.d); });
  const damp = 0.3;
  for (let n = 0; n < input.length; n++) {
    const x = input[n];
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * (1 - damp) + c.lp * damp;
      c.buf[c.i] = x + c.lp * feedback;
      if (++c.i >= c.d) c.i = 0;
      s += y;
    }
    s /= combs.length;
    for (const ap of aps) {
      const y = ap.buf[ap.i], v = s + 0.5 * y;
      ap.buf[ap.i] = v;
      s = y - 0.5 * v;
      if (++ap.i >= ap.d) ap.i = 0;
    }
    out[n] = s;
  }
  return out;
}

function echo(input, sr, delaySec, fb) {
  const d = Math.round(delaySec * sr), ring = new Float32Array(d), out = new Float32Array(input.length);
  let i = 0, lp = 0;
  for (let n = 0; n < input.length; n++) {
    const y = ring[i];
    lp = 0.55 * y + 0.45 * lp;
    ring[i] = input[n] + lp * fb;
    out[n] = y;
    if (++i >= d) i = 0;
  }
  return out;
}

const REVERB = { ambient: { send: 0.55, fb: 0.86, wet: 1.0, echo: 0.22 }, christmas: { send: 0.8, fb: 0.88, wet: 1.0, echo: 0.3 } };

/** Render a plan to mono Float32Array (length = round(total * sr)), loop-friendly, normalized to ~targetRmsDb. */
function render(plan, opts) {
  opts = opts || {};
  const sr = opts.sampleRate || SR, targetDb = opts.targetRmsDb === undefined ? -19 : opts.targetRmsDb, cfg = REVERB[plan.kind];
  const length = Math.round(plan.total * sr), full = length + TAIL * sr;
  const dry = new Float32Array(full);
  for (const { block, start } of plan.blocks) {
    for (const ev of block.events) {
      const t = start + ev.t;
      if (ev.kind === 'pad') addPad(dry, sr, t, ev.notes, ev.dur, ev.vel, ev.attack || 2.5, ev.release || 3.5, (ev.cutoff || 900) * 1.0);
      else addPluck(dry, sr, t, ev.notes[0], ev.dur, ev.vel, ev.kind === 'bell');
    }
  }
  const send = new Float32Array(full);
  for (let i = 0; i < full; i++) send[i] = dry[i] * cfg.send;
  const wet = reverb(send, sr, cfg.fb), ec = echo(send, sr, 0.47, 0.3);
  const mix = new Float32Array(full);
  for (let i = 0; i < full; i++) mix[i] = dry[i] + wet[i] * cfg.wet * 1.6 + ec[i] * cfg.echo;
  // fold the tail back onto the start so the loop has no gap or click
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = mix[i] + (i < full - length ? mix[length + i] : 0);
  // fades (raised cosine) at both ends, then loudness + soft limiter
  const fade = Math.floor(1.5 * sr);
  for (let i = 0; i < fade; i++) { const g = 0.5 - 0.5 * Math.cos(Math.PI * i / fade); out[i] *= g; out[length - 1 - i] *= g; }
  let sum = 0;
  for (let i = 0; i < length; i++) sum += out[i] * out[i];
  const rms = Math.sqrt(sum / length) || 1, gain = Math.pow(10, targetDb / 20) / rms, limit = 0.9;
  for (let i = 0; i < length; i++) out[i] = limit * Math.tanh(out[i] * gain / limit);
  return out;
}

function toWav16(samples, sr) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples.length * 2, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(sr, 24);
  data.writeUInt32LE(sr * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return data;
}

module.exports = { SR, TAIL, planTrack, render, toWav16, REVERB };
