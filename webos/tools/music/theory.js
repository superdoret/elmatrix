/* Music theory and generative sequencing (pure, deterministic with a seed). No Web Audio here:
 * generators return "blocks" of events with times relative to the block start, in seconds.
 * Event: { t, kind: 'pad' | 'pluck' | 'bell', notes: [midi...], dur, vel, attack?, release? } */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  function mulberry32(seed) {
    seed = (seed === undefined || seed === null) ? Math.floor(Math.random() * 4294967296) : seed;
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // 'F#4' -> 66, 'Bb3' -> 58 (C4 = 60)
  function noteNum(name) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!m) throw new Error('bad note ' + name);
    return 12 * (parseInt(m[3], 10) + 1) + NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }

  var QUALITY = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], add9: [0, 4, 7, 14], sus2: [0, 2, 7], six: [0, 4, 7, 9], dom7: [0, 4, 7, 10] };
  var PENTATONIC = [0, 2, 4, 7, 9];

  // Chord progressions: [semitones above the key root, quality]
  var PROGRESSIONS = [
    [[0, 'maj7'], [9, 'min7'], [5, 'maj7'], [7, 'six']],
    [[0, 'add9'], [7, 'sus2'], [9, 'min7'], [5, 'maj7']],
    [[9, 'min7'], [5, 'maj7'], [0, 'add9'], [7, 'six']],
    [[5, 'maj7'], [0, 'add9'], [2, 'min7'], [7, 'sus2']]
  ];
  var KEY_ROOTS = [43, 45, 48, 50, 52]; // G2 A2 C3 D3 E3: a calm low register

  // Soft pad voicing: root, then the other chord tones lifted into the 2nd octave.
  function voicing(root, quality) {
    var iv = QUALITY[quality], out = [root, root + 12]; // root and its octave
    for (var i = 1; i < iv.length; i++) out.push(root + 12 + (iv[i] % 12)); // chord tones in the octave above
    return out;
  }

  /* Endless generative ambient: a chord pad per block plus a few sparse pentatonic plucks/bells. */
  function createAmbient(seed) {
    var rng = mulberry32(seed), prog = PROGRESSIONS[Math.floor(rng() * PROGRESSIONS.length)];
    var keyRoot = KEY_ROOTS[Math.floor(rng() * KEY_ROOTS.length)], idx = 0;
    return {
      next: function () {
        var ch = prog[idx], usedKey = keyRoot, root = keyRoot + ch[0], length = 14 + rng() * 6;
        var events = [{ t: 0, kind: 'pad', notes: voicing(root, ch[1]), dur: length + 1.5, vel: 0.5, attack: 3, release: 4 }];
        var n = 2 + Math.floor(rng() * 4), times = [];
        for (var i = 0; i < n; i++) times.push(1.5 + rng() * (length - 3));
        times.sort(function (a, b) { return a - b; });
        times.forEach(function (t) {
          var deg = PENTATONIC[Math.floor(rng() * PENTATONIC.length)], oct = 12 + 12 * Math.floor(rng() * 2);
          events.push({ t: t, kind: rng() < 0.25 ? 'bell' : 'pluck', notes: [keyRoot + oct + deg], dur: 3, vel: 0.22 + rng() * 0.2 });
        });
        idx++;
        if (idx >= prog.length) { // progression finished: sometimes change progression and key
          idx = 0;
          if (rng() < 0.5) prog = PROGRESSIONS[Math.floor(rng() * PROGRESSIONS.length)];
          if (rng() < 0.4) keyRoot = KEY_ROOTS[Math.floor(rng() * KEY_ROOTS.length)];
        }
        return { length: length, events: events, info: { key: usedKey, chord: ch } };
      }
    };
  }

  var api = {
    mulberry32: mulberry32, midiToFreq: midiToFreq, noteNum: noteNum, QUALITY: QUALITY, PENTATONIC: PENTATONIC,
    PROGRESSIONS: PROGRESSIONS, KEY_ROOTS: KEY_ROOTS, voicing: voicing, createAmbient: createAmbient
  };
  E.theory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
