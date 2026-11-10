/* Remote/keyboard key mapping (pure). webOS TV remote codes plus desktop equivalents. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  var CODES = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    13: 'ok',
    461: 'back', 27: 'back', 8: 'back', 10009: 'back',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
    457: 'info',
    415: 'play', 19: 'pause', 413: 'stop',
    412: 'rewind', 417: 'forward'
  };

  /* Returns a logical key name or null. `e` is a KeyboardEvent-like {keyCode, key}. */
  function keyName(e) {
    var n = CODES[e.keyCode];
    if (n) return n;
    // Desktop shortcuts for testing without a remote
    switch (e.key) {
      case 'r': case 'R': return 'red';
      case 'g': case 'G': return 'green';
      case 'y': case 'Y': return 'yellow';
      case 'b': case 'B': return 'blue';
      case 'i': case 'I': return 'info';
      case ' ': return 'pause';
      default: return null;
    }
  }

  /* Action for the banner (settings closed). */
  function bannerAction(name) {
    switch (name) {
      case 'right': case 'forward': return 'next';
      case 'left': case 'rewind': return 'prev';
      case 'yellow': case 'play': case 'pause': return 'togglePause';
      case 'ok': case 'red': return 'openSettings';
      case 'info': case 'up': case 'down': return 'showHint';
      case 'green': return 'next';
      case 'blue': return 'toggleMusic';
      default: return null;
    }
  }

  var api = { CODES: CODES, keyName: keyName, bannerAction: bannerAction };
  E.keys = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
