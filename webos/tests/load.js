// Loads the browser-style modules in dependency order so tests can use globalThis.ELM.
const path = require('path');
const root = path.join(__dirname, '..', 'js');
const files = ['compat', 'music/stations', 'music/stream', 'audio', 'bdf', 'framebuffer', 'textlayout', 'catalog', 'settings', 'settingsmodel', 'scheduler', 'net', 'zones', 'util', 'icons', 'data', 'context', 'keys',
  'widgets/clock', 'widgets/worldclock', 'widgets/countdown', 'widgets/rates', 'widgets/forecast', 'widgets/sports', 'widgets/phrases', 'widgets/word', 'widgets/pixelart', 'widgets/matrixrain', 'widgets/fireplace', 'widgets/aquarium', 'widgets/fireworks', 'widgets/plasma', 'widgets/life', 'widgets/starfield', 'widgets/visualizer', 'widgets/navidad/lib', 'widgets/navidad/scenes-a', 'widgets/navidad/scenes-b', 'widgets/navidad/scenes-c', 'widgets/navidad'];
files.forEach(f => require(path.join(root, f + '.js')));
// dev-time music data (used by tools/render-music.js; not shipped in the app scripts)
require(path.join(__dirname, '..', 'tools', 'music', 'theory.js'));
require(path.join(__dirname, '..', 'tools', 'music', 'carols.js'));
module.exports = global.ELM;
