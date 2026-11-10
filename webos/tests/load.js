// Loads the browser-style modules in dependency order so tests can use globalThis.ELM.
const path = require('path');
const root = path.join(__dirname, '..', 'js');
const files = ['compat', 'music/theory', 'music/carols', 'music/stations', 'music/stream', 'audio', 'bdf', 'framebuffer', 'textlayout', 'catalog', 'settings', 'settingsmodel', 'scheduler', 'net', 'zones', 'util', 'icons', 'data', 'context', 'keys',
  'widgets/clock', 'widgets/worldclock', 'widgets/countdown', 'widgets/rates', 'widgets/forecast', 'widgets/sports', 'widgets/phrases', 'widgets/word', 'widgets/pixelart', 'widgets/matrixrain', 'widgets/fireplace', 'widgets/aquarium', 'widgets/fireworks', 'widgets/plasma', 'widgets/life', 'widgets/starfield', 'widgets/visualizer'];
files.forEach(f => require(path.join(root, f + '.js')));
module.exports = global.ELM;
