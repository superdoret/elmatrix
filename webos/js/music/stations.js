/* Internet radio stations used for the background music (single table: edit here when a stream changes).
 * SomaFM (somafm.com): listener-supported, 128k MP3. Kiss FM España (kissfm.es): commercial station, 56k MP3. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  var STATIONS = [
    { id: 'dronezone', label: 'SomaFM: Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3', kind: 'ambient' },
    { id: 'deepspaceone', label: 'SomaFM: Deep Space One', url: 'https://ice1.somafm.com/deepspaceone-128-mp3', kind: 'ambient' },
    { id: 'spacestation', label: 'SomaFM: Space Station Soma', url: 'https://ice1.somafm.com/spacestation-128-mp3', kind: 'ambient' },
    // Kiss FM Espana: commercial pop/dance radio (ads, talk), NOT ambient. The plain URL redirects (with a signed, expiring
    // token) to the real MP3 stream; the TV's media pipeline follows the redirects, so every (re)connect sets src again.
    { id: 'kissfm', label: 'Kiss FM España (radio comercial, con anuncios)', url: 'https://bbkissfm.kissfmradio.cires21.com/bbkissfm.mp3', kind: 'ambient' },
    { id: 'christmas', label: 'The Christmas Lounge', url: 'https://ice1.somafm.com/christmas-128-mp3', kind: 'christmas' },
    { id: 'xmasinfrisko', label: 'Xmas in Frisko', url: 'https://ice1.somafm.com/xmasinfrisko-128-mp3', kind: 'christmas' }
  ];
  // Bundled music (rendered by tools/render-music.js): played with an <audio> element, no internet needed.
  var FILES = { ambient: 'assets/music/ambient.mp3', christmas: 'assets/music/christmas.mp3' };
  var DEFAULTS = { ambient: 'dronezone', christmas: 'christmas' };

  function byId(id) { for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i]; return null; }
  function ofKind(kind) { return STATIONS.filter(function (s) { return s.kind === kind; }); }

  /* Station for a track ('ambient' | 'christmas'); `preferredId` is honoured only if it has the right kind. */
  function forTrack(track, preferredId) {
    var kind = track === 'christmas' ? 'christmas' : 'ambient', s = byId(preferredId);
    return s && s.kind === kind ? s : byId(DEFAULTS[kind]);
  }

  function fileFor(track) { return track === 'christmas' ? FILES.christmas : FILES.ambient; }

  var api = { FILES: FILES, fileFor: fileFor, STATIONS: STATIONS, DEFAULTS: DEFAULTS, byId: byId, ofKind: ofKind, forTrack: forTrack };
  E.stations = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
