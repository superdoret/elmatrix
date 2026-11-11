/* Public-domain carols as note data, arranged slowly for the christmas track.
 * melody: [[midi | null (rest), beats], ...]; harmony: one chord symbol per bar.
 * NOTE: melodies were written from memory (no score available); they are close to the traditional tunes,
 * but not guaranteed note-perfect. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  var T = E.theory || require('./theory.js');

  function m(list) { return list.map(function (p) { return [p[0] === null ? null : T.noteNum(p[0]), p[1]]; }); }

  var CHORDS = {
    C: [48, 52, 55, 60], G: [43, 50, 55, 59], F: [41, 48, 53, 57], D: [50, 54, 57, 62], Am: [45, 52, 57, 60],
    Em: [40, 47, 52, 55], Dm: [50, 53, 57, 62], G7: [43, 50, 53, 59], D7: [50, 54, 60, 57], Bm: [47, 54, 59, 62]
  };

  var CAROLS = [
    { id: 'silent-night', title: 'Noche de paz', bpm: 46, beatsPerBar: 3, bars: 16,
      melody: m([
        ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3], ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
        ['D5', 2], ['D5', 1], ['B4', 3], ['C5', 2], ['C5', 1], ['G4', 3],
        ['A4', 2], ['A4', 1], ['C5', 1.5], ['B4', 0.5], ['A4', 1], ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
        ['C5', 2], ['G4', 1], ['E4', 1.5], ['G4', 0.5], ['F4', 1], ['D4', 3], ['C4', 3]]),
      harmony: ['C', 'C', 'C', 'C', 'G', 'G', 'C', 'C', 'F', 'F', 'C', 'C', 'C', 'C', 'G', 'C'] },
    { id: 'away-in-a-manger', title: 'Away in a Manger', bpm: 44, beatsPerBar: 3, bars: 9,
      melody: m([
        [null, 2], ['D4', 1],
        ['G4', 2], ['G4', 1], ['G4', 1.5], ['A4', 0.5], ['B4', 1], ['D5', 3],
        ['B4', 2], ['B4', 1], ['A4', 1.5], ['G4', 0.5], ['A4', 1], ['G4', 3],
        ['G4', 2], ['B4', 1], ['A4', 3]]),
      harmony: ['G', 'G', 'G', 'D', 'G', 'C', 'G', 'D', 'G'] },
    { id: 'o-christmas-tree', title: 'Oh abeto', bpm: 48, beatsPerBar: 3, bars: 9,
      melody: m([
        [null, 2], ['G4', 1],
        ['C5', 1.5], ['C5', 0.5], ['C5', 1], ['E5', 1.5], ['D5', 0.5], ['D5', 1], ['D5', 3],
        ['D5', 1.5], ['D5', 0.5], ['D5', 1], ['F5', 1.5], ['E5', 0.5], ['E5', 1], ['E5', 3],
        ['E5', 2], ['G4', 1], ['C5', 3]]),
      harmony: ['G', 'C', 'G', 'G', 'C', 'C', 'C', 'G', 'C'] },
    { id: 'jingle-bells', title: 'Jingle Bells (lento)', bpm: 66, beatsPerBar: 4, bars: 16,
      melody: m([
        ['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['G4', 1], ['C4', 1.5], ['D4', 0.5], ['E4', 4],
        ['F4', 1], ['F4', 1], ['F4', 1.5], ['F4', 0.5], ['F4', 1], ['E4', 1], ['E4', 1], ['E4', 0.5], ['E4', 0.5],
        ['E4', 1], ['D4', 1], ['D4', 1], ['E4', 1], ['D4', 2], ['G4', 2],
        ['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['G4', 1], ['C4', 1.5], ['D4', 0.5], ['E4', 4],
        ['F4', 1], ['F4', 1], ['F4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['E4', 0.5], ['E4', 0.5],
        ['G4', 1], ['G4', 1], ['F4', 1], ['D4', 1], ['C4', 4]]),
      harmony: ['C', 'C', 'C', 'C', 'F', 'C', 'G', 'G', 'C', 'C', 'C', 'C', 'F', 'C', 'G', 'C'] },
    { id: 'we-wish-you', title: 'We Wish You a Merry Christmas (lento)', bpm: 52, beatsPerBar: 3, bars: 9,
      melody: m([
        [null, 2], ['D4', 1],
        ['G4', 1], ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F#4', 0.5], ['E4', 1], ['E4', 1], ['E4', 1],
        ['A4', 1], ['A4', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F#4', 1], ['D4', 1], ['D4', 1],
        ['B4', 1], ['B4', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 1], ['E4', 1], ['D4', 0.5], ['D4', 0.5],
        ['E4', 1], ['A4', 1], ['F#4', 1], ['G4', 3]]),
      harmony: ['G', 'G', 'C', 'D', 'D', 'C', 'G', 'D', 'G'] }
  ];

  function barSeconds(c) { return c.beatsPerBar * 60 / c.bpm; }

  // Variation per pass through the playlist: transposition, melody octave, voice and pad voicing change every time.
  var SHIFTS = [0, -2, 2, -5, 3];
  function variant(pass, rng) {
    return {
      shift: SHIFTS[pass % SHIFTS.length],
      melodyOctave: pass % 3 === 1 ? 12 : 0,           // every third pass the melody sings an octave higher
      voice: pass % 2 === 0 ? 'bell' : 'pluck',         // music-box bell vs. softer plucked box
      padLift: pass % 4 >= 2 ? 12 : 0,                  // pads an octave higher on some passes
      cutoff: 700 + Math.floor(rng() * 500),
      tempo: 0.92 + rng() * 0.16,                       // +-8 % slower/faster
      gap: 6 + rng() * 9                                // quiet pause after the carol (pads fade out) 6-15 s
    };
  }

  /* Endless christmas ambience: one carol per block, playlist reshuffled each round (no immediate repeats),
   * sparse music-box melody over warm pads; every pass differs (see variant()). */
  function createChristmas(seed) {
    var rng = T.mulberry32(seed), order = [], pos = 0, pass = 0, lastId = null;
    function reshuffle() {
      order = CAROLS.map(function (_, i) { return i; });
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
      if (CAROLS[order[0]].id === lastId && order.length > 1) { var k = order[0]; order[0] = order[order.length - 1]; order[order.length - 1] = k; }
    }
    reshuffle();
    return {
      next: function () {
        if (pos >= order.length) { reshuffle(); pos = 0; }
        var c = CAROLS[order[pos++]], v = variant(pass++, rng);
        lastId = c.id;
        var bpm = c.bpm * v.tempo, spb = 60 / bpm, bar = c.beatsPerBar * spb, events = [], beat = 0, i;
        for (i = 0; i < c.melody.length; i++) {
          var n = c.melody[i];
          if (n[0] !== null) events.push({ t: beat * spb, kind: v.voice, notes: [n[0] + v.shift + v.melodyOctave], dur: Math.min(4.5, n[1] * spb * 1.6), vel: 0.3 });
          beat += n[1];
        }
        // merge repeated chords into one long pad
        i = 0;
        while (i < c.harmony.length) {
          var j = i;
          while (j + 1 < c.harmony.length && c.harmony[j + 1] === c.harmony[i]) j++;
          var chord = CHORDS[c.harmony[i]].map(function (m) { return m + v.shift + v.padLift; });
          events.push({ t: i * bar, kind: 'pad', notes: chord, dur: (j - i + 1) * bar + 1.5, vel: 0.42, attack: 1.8, release: 3.5, cutoff: v.cutoff });
          i = j + 1;
        }
        return { length: c.bars * bar + v.gap, events: events, info: { carol: c.id, bpm: bpm, gap: v.gap, variant: v, bar: bar } };
      }
    };
  }

  var api = { CAROLS: CAROLS, CHORDS: CHORDS, barSeconds: barSeconds, createChristmas: createChristmas };
  E.carols = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
