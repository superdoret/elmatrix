/* Internet radio stations used for the background music (single table: edit here when a stream changes).
 * SomaFM (somafm.com): listener-supported, 128k MP3. Kiss FM España (kissfm.es): commercial station, 56k MP3. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  /* trim = fixed attenuation (0.05..1.0) that levels the stations against each other: element.volume is capped at 1.0 and Web Audio
   * is silent on TVs, so louder sources can only be turned DOWN. Kiss FM measures about -15.2 LUFS. The SomaFM value 0.7 (about -3 dB)
   * is an UNMEASURED initial estimate (somafm.com returned 403 to the dev machine): tune it by ear with "Nivel de esta estación". */
  var STATIONS = [
    { id: 'dronezone', label: 'SomaFM: Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3', trim: 0.7, kind: 'ambient' },
    { id: 'deepspaceone', label: 'SomaFM: Deep Space One', url: 'https://ice1.somafm.com/deepspaceone-128-mp3', trim: 0.7, kind: 'ambient' },
    { id: 'spacestation', label: 'SomaFM: Space Station Soma', url: 'https://ice1.somafm.com/spacestation-128-mp3', trim: 0.7, kind: 'ambient' },
    // Kiss FM Espana: commercial pop/dance radio (ads, talk), NOT ambient. The plain URL redirects (with a signed, expiring
    // token) to the real MP3 stream; the TV's media pipeline follows the redirects, so every (re)connect sets src again.
    { id: 'kissfm', label: 'Kiss FM España (radio comercial, con anuncios)', url: 'https://bbkissfm.kissfmradio.cires21.com/bbkissfm.mp3', trim: 1.0, kind: 'ambient' },
    { id: 'christmas', label: 'The Christmas Lounge', url: 'https://ice1.somafm.com/christmas-128-mp3', trim: 0.7, kind: 'christmas' },
    { id: 'xmasinfrisko', label: 'Xmas in Frisko', url: 'https://ice1.somafm.com/xmasinfrisko-128-mp3', trim: 0.7, kind: 'christmas' }
  ];
  // Bundled music (rendered by tools/render-music.js): played with an <audio> element, no internet needed.
  var FILES = { ambient: 'assets/music/ambient.mp3', christmas: 'assets/music/christmas.mp3' };
  // Bundled MP3s are rendered at about -16 LUFS (see tools/render-music.js), close to Kiss FM: no trim needed.
  var FILE_TRIMS = { ambient: 1.0, christmas: 1.0 };
  var LEVEL_KEYS = ['bundled'];   // per-source user level keys besides station ids
  var DEFAULTS = { ambient: 'dronezone', christmas: 'christmas' };

  function byId(id) { for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i]; return null; }
  function ofKind(kind) { return STATIONS.filter(function (s) { return s.kind === kind; }); }

  /* Station for a track ('ambient' | 'christmas'); `preferredId` is honoured only if it has the right kind. */
  function forTrack(track, preferredId) {
    var kind = track === 'christmas' ? 'christmas' : 'ambient', s = byId(preferredId);
    return s && s.kind === kind ? s : byId(DEFAULTS[kind]);
  }

  function fileFor(track) { return track === 'christmas' ? FILES.christmas : FILES.ambient; }

  function fileTrim(track) { return track === 'christmas' ? FILE_TRIMS.christmas : FILE_TRIMS.ambient; }
  function levelKeys() { return STATIONS.map(function (x) { return x.id; }).concat(LEVEL_KEYS); }

  var api = { FILE_TRIMS: FILE_TRIMS, fileTrim: fileTrim, levelKeys: levelKeys, FILES: FILES, fileFor: fileFor, STATIONS: STATIONS, DEFAULTS: DEFAULTS, byId: byId, ofKind: ofKind, forTrack: forTrack };
  E.stations = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
