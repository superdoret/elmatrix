/* Internet radio stations used for the background music (single table: edit here when a stream changes).
 * Radio: SomaFM (somafm.com), listener-supported. Streams are 128k MP3 with CORS enabled. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  var STATIONS = [
    { id: 'dronezone', label: 'Drone Zone (ambiente)', url: 'https://ice1.somafm.com/dronezone-128-mp3', kind: 'ambient' },
    { id: 'deepspaceone', label: 'Deep Space One (ambiente)', url: 'https://ice1.somafm.com/deepspaceone-128-mp3', kind: 'ambient' },
    { id: 'spacestation', label: 'Space Station Soma', url: 'https://ice1.somafm.com/spacestation-128-mp3', kind: 'ambient' },
    { id: 'christmas', label: 'The Christmas Lounge', url: 'https://ice1.somafm.com/christmas-128-mp3', kind: 'christmas' },
    { id: 'xmasinfrisko', label: 'Xmas in Frisko', url: 'https://ice1.somafm.com/xmasinfrisko-128-mp3', kind: 'christmas' }
  ];
  var DEFAULTS = { ambient: 'dronezone', christmas: 'christmas' };

  function byId(id) { for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i]; return null; }
  function ofKind(kind) { return STATIONS.filter(function (s) { return s.kind === kind; }); }

  /* Station for a track ('ambient' | 'christmas'); `preferredId` is honoured only if it has the right kind. */
  function forTrack(track, preferredId) {
    var kind = track === 'christmas' ? 'christmas' : 'ambient', s = byId(preferredId);
    return s && s.kind === kind ? s : byId(DEFAULTS[kind]);
  }

  var api = { STATIONS: STATIONS, DEFAULTS: DEFAULTS, byId: byId, ofKind: ofKind, forTrack: forTrack };
  E.stations = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
