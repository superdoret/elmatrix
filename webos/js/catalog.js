/* Widget catalog for the TV app. Ids, names and fields follow src/catalog.py (Spanish UI copy). */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  var STATIONS = E.stations || require('./music/stations.js');

  function opts() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) out.push({ value: arguments[i][0], label: arguments[i][1] });
    return out;
  }
  function duration(def, lo, hi) {
    return { key: 'duration', label: 'Duración (segundos)', type: 'number', def: def, min: lo || 3, max: hi || 120, step: 1,
      help: 'Cuánto tiempo se muestra el widget.' };
  }

  var CITY_PRESETS = ['Barcelona', 'Madrid', 'Buenos Aires', 'Rosario', 'Córdoba', 'Montevideo', 'Santiago', 'Lima', 'Bogotá', 'Ciudad de México'];
  var TEAM_PRESETS = ['Barcelona', 'Real Madrid', 'Boca Juniors', 'River Plate', 'Rosario Central', 'Atletico Madrid', 'Arsenal', 'Manchester City'];

  var WIDGETS = [
    { id: 'phrases', name: 'Frases positivas', description: 'Frases positivas con efectos de color.', category: 'Texto', network: false, def_enabled: true,
      fields: [
        { key: 'speed', label: 'Velocidad', type: 'select', def: 90, options: opts([60, 'Lenta'], [90, 'Normal'], [130, 'Rápida']) }
      ] },
    { id: 'word', name: 'Palabra', description: 'Una palabra aleatoria que entra deslizándose.', category: 'Texto', network: false, def_enabled: true,
      fields: [duration(8, 3, 60)] },
    { id: 'clock', name: 'Reloj', description: 'Hora y fecha en grande.', category: 'Reloj', network: false, def_enabled: true,
      fields: [
        { key: 'format24h', label: 'Formato 24 horas', type: 'bool', def: true },
        { key: 'show_date', label: 'Mostrar fecha', type: 'bool', def: true },
        duration(10, 3, 120)
      ] },
    { id: 'worldclock', name: 'Reloj mundial', description: 'Hora actual en varias ciudades.', category: 'Reloj', network: false, def_enabled: true,
      fields: [
        { key: 'zones', label: 'Zonas horarias', type: 'list', def: ['Barcelona|Europe/Madrid', 'Rosario|America/Argentina/Cordoba', 'Tokyo|Asia/Tokyo'],
          help: 'Una por línea con el formato Etiqueta|Zona.' },
        { key: 'format24h', label: 'Formato 24 horas', type: 'bool', def: true },
        duration(10)
      ] },
    { id: 'countdown', name: 'Cuenta regresiva', description: 'Días que faltan para tus fechas importantes.', category: 'Reloj', network: false, def_enabled: true,
      fields: [
        { key: 'events', label: 'Eventos', type: 'list', def: ['Año nuevo|2027-01-01'], help: 'Uno por línea con el formato Nombre|AAAA-MM-DD.' },
        { key: 'show_past', label: 'Mostrar eventos pasados', type: 'bool', def: false },
        duration(8)
      ] },
    { id: 'rates', name: 'Cotizaciones', description: 'Precio de criptomonedas y dólar en Argentina.', category: 'Finanzas', network: true, def_enabled: true,
      fields: [
        { key: 'assets', label: 'Criptomonedas', type: 'list', def: ['bitcoin', 'ethereum'], help: 'Un id de CoinGecko por línea (por ejemplo: bitcoin).' },
        { key: 'vs_currency', label: 'Moneda de referencia', type: 'select', def: 'usd', options: opts(['usd', 'USD'], ['eur', 'EUR']) },
        { key: 'show_dolar', label: 'Mostrar dólar', type: 'bool', def: true },
        { key: 'dolar_type', label: 'Tipo de dólar', type: 'select', def: 'blue',
          options: opts(['blue', 'Blue'], ['oficial', 'Oficial'], ['bolsa', 'Bolsa'], ['contadoconliqui', 'Contado con liqui'], ['tarjeta', 'Tarjeta']) },
        duration(12)
      ] },
    { id: 'forecast', name: 'Pronóstico', description: 'Pronóstico de los próximos días.', category: 'Información', network: true, def_enabled: true,
      fields: [
        { key: 'city', label: 'Ciudad', type: 'text', def: 'Barcelona', presets: CITY_PRESETS },
        { key: 'days', label: 'Días', type: 'select', def: 3, options: opts([2, '2 días'], [3, '3 días'], [4, '4 días'], [5, '5 días']) },
        duration(12)
      ] },
    { id: 'sports', name: 'Deportes', description: 'Último resultado y próximo partido de un equipo.', category: 'Información', network: true, def_enabled: true,
      fields: [
        { key: 'team', label: 'Equipo', type: 'text', def: 'Barcelona', presets: TEAM_PRESETS },
        { key: 'api_key', label: 'Clave de API', type: 'text', def: '123', help: 'Clave de TheSportsDB (la gratuita actual es 123).' },
        duration(12)
      ] },
    { id: 'pixelart', name: 'Pixel art', description: 'Escena de día y noche, Navidad o un Snake que juega solo.', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [
        { key: 'style', label: 'Estilo', type: 'select', def: 'random', options: opts(['scene', 'Escena'], ['snake', 'Snake'], ['navidad', 'Navidad'], ['random', 'Al azar']) },
        { key: 'show_clock', label: 'Mostrar hora', type: 'bool', def: true },
        duration(20)
      ] },

    { id: 'navidad', name: 'Navidad', description: 'Galería de escenas navideñas animadas: árbol, belén, Papá Noel, chimenea y muchas más.', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [
        duration(18, 6, 60),
        { key: 'scenes_per_visit', label: 'Escenas por visita', type: 'number', def: 4, min: 1, max: 15, step: 1, help: 'Cuántas escenas se muestran seguidas antes de volver a la rotación.' },
        { key: 'order', label: 'Orden de las escenas', type: 'select', def: 'aleatorio', options: opts(['aleatorio', 'Aleatorio'], ['secuencial', 'Secuencial']) },
        { key: 'scene_arbol', label: 'Escena: Árbol de Navidad', type: 'bool', def: true },
        { key: 'scene_muneco', label: 'Escena: Muñeco de nieve', type: 'bool', def: true },
        { key: 'scene_santa', label: 'Escena: Papá Noel sobre los tejados', type: 'bool', def: true },
        { key: 'scene_chimenea', label: 'Escena: Chimenea con medias', type: 'bool', def: true },
        { key: 'scene_belen', label: 'Escena: Belén', type: 'bool', def: true },
        { key: 'scene_reyes', label: 'Escena: Reyes Magos', type: 'bool', def: true },
        { key: 'scene_pueblo', label: 'Escena: Pueblo nevado', type: 'bool', def: true },
        { key: 'scene_jengibre', label: 'Escena: Casa de jengibre', type: 'bool', def: true },
        { key: 'scene_globo', label: 'Escena: Globo de nieve', type: 'bool', def: true },
        { key: 'scene_corona', label: 'Escena: Corona de Adviento', type: 'bool', def: true },
        { key: 'scene_aurora', label: 'Escena: Aurora boreal sobre pinos', type: 'bool', def: true },
        { key: 'scene_pinguinos', label: 'Escena: Pingüinos y osos polares', type: 'bool', def: true },
        { key: 'scene_chocolate', label: 'Escena: Chocolate caliente', type: 'bool', def: true },
        { key: 'scene_bolas', label: 'Escena: Bolas del árbol', type: 'bool', def: true },
        { key: 'scene_anonuevo', label: 'Escena: Año Nuevo', type: 'bool', def: true },
      ] },
    { id: 'matrixrain', name: 'Lluvia Matrix', description: 'Columnas de caracteres verdes cayendo, como en Matrix.', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [duration(20, 5, 120)] },
    { id: 'fireplace', name: 'Chimenea', description: 'Una chimenea con fuego, troncos y brasas.', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [duration(25, 5, 180)] },
    { id: 'aquarium', name: 'Acuario', description: 'Peces de píxeles nadando entre burbujas y algas.', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [duration(25, 5, 180)] },
    { id: 'fireworks', name: 'Fuegos artificiales', description: 'Cohetes y explosiones de partículas sobre una ciudad.', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [duration(20, 5, 120)] },
    { id: 'plasma', name: 'Plasma', description: 'Campo de colores tipo plasma clásico.', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [duration(20, 5, 120)] },
    { id: 'life', name: 'Juego de la vida', description: 'Autómata de Conway que se reinicia solo al estancarse.', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [duration(30, 5, 180)] },
    { id: 'starfield', name: 'Estrellas', description: 'Viaje a través de un campo de estrellas.', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [duration(20, 5, 120)] },
    { id: 'visualizer', name: 'Visualizador de música', description: 'Barras de espectro que siguen la música (simuladas si no hay sonido).', category: 'Entretenimiento', network: false, def_enabled: true,
      fields: [duration(25, 5, 180)] }
  ];

  var GLOBAL_FIELDS = [
    { key: 'pause_seconds', label: 'Pausa entre widgets (segundos)', type: 'number', def: 2, min: 0, max: 30, step: 1 },
    { key: 'order', label: 'Orden', type: 'select', def: 'shuffle', options: opts(['shuffle', 'Aleatorio'], ['sequence', 'En secuencia']) },
    { key: 'music_enabled', label: 'Música de fondo', type: 'bool', def: true },
    { key: 'music_volume', label: 'Volumen de la música (%)', type: 'number', def: 35, min: 0, max: 100, step: 5 },
    { key: 'music_source', label: 'Fuente de la música', type: 'select', def: 'stream', options: opts(['stream', 'Radio en línea'], ['incluida', 'Música incluida (sin internet)']) },
    { key: 'music_station', label: 'Emisora ambiente', type: 'select', def: 'dronezone',
      options: STATIONS.ofKind('ambient').map(function (s) { return { value: s.id, label: s.label }; }) },
    { key: 'christmas_source', label: 'Música en Navidad', type: 'select', def: 'carols',
      options: opts(['carols', 'Villancicos (incluidos)'], ['radio', 'Radio: Christmas Lounge (lounge navideño)']) }
  ];

  function byId(id) {
    for (var i = 0; i < WIDGETS.length; i++) if (WIDGETS[i].id === id) return WIDGETS[i];
    return null;
  }

  var api = { WIDGETS: WIDGETS, GLOBAL_FIELDS: GLOBAL_FIELDS, byId: byId };
  E.catalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
