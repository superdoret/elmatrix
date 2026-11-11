# eLMaTrIx para LG webOS TV

Reproduce en tu tele el cartel de LEDs de eLMaTrIx: una matriz virtual 16:9 (192x108 LEDs en una pantalla de 1920x1080) que rota widgets. Funciona solo, sin Raspberry ni servidor. Sin dependencias, sin paso de compilación.

## Probar en el navegador (2 minutos)

```bash
cd webos
python3 -m http.server 8080
# abrí http://localhost:8080/ en Chrome
```

- Abrí el archivo con `http://`, no con `file://` (con `file://` las fuentes caen a una fuente mínima de respaldo).
- Tests: `cd webos && npm install && npm test` (equivale a `node --test`; requiere Node 20+; incluye comprobaciones del build ES5).

Parámetros de URL útiles para pruebas:

| Parámetro | Efecto |
|-----------|--------|
| `?only=clock` | Muestra solo un widget (`clock`, `worldclock`, `countdown`, `rates`, `forecast`, `sports`, `phrases`, `word`, `pixelart`) |
| `&time=14:07` | Congela la hora actual |
| `&offline=1` | Simula que no hay red |
| `&set=pixelart.style:scene` | Cambia una opción sin guardarla (varias separadas por coma) |
| `&seed=3` | Azar reproducible |
| `&hint=0` | Oculta la ayuda de teclas |
| `&music=0` | Desactiva la música (útil para capturas y pruebas) |

## Línea de créditos

En la parte inferior de la pantalla, en todos los modos, aparece "Desarrollado por Matias Toro". El texto está en un solo sitio (`index.html`, elemento `#credit`) y un test comprueba que llega a `dist/index.html`. La rejilla de LEDs reserva una franja inferior del 6,5 % de la altura para esa línea, así que no tapa el contenido.

## Compilar para el televisor (ES5)

El código fuente es JavaScript moderno. Los televisores con webOS 3.x (Chromium 38) no lo entienden (`async/await`, `URLSearchParams`, `fetch`...), así que el paquete para la TV se genera con Babel en `dist/`:

```bash
cd webos
npm install        # una sola vez (solo herramientas de desarrollo)
npm run build      # genera dist/ (ES5, un solo script + polyfills)
```

`dist/` contiene `index.html`, `appinfo.json`, iconos, `css/`, `assets/fonts/` y `js/elmatrix.js` + `js/polyfills.js`. Para volver a compilar tras un cambio, repetí `npm run build`.

## Instalar en el televisor

Requisitos: TV LG con webOS 3.x o superior, cuenta de LG Developer y la app **Developer Mode** instalada en la TV con el modo activado.

1. Instalá las herramientas: `npm i -g @webos-tools/cli`
2. Registrá la TV: `ares-setup-device` (agregá un dispositivo con la IP de la TV, puerto 9922, usuario `prisoner`)
3. Compilá y empaquetá: `npm run build` y luego `ares-package dist` (genera `com.elmatrix.tv_1.0.0_all.ipk`)
4. Instalá: `ares-install --device <nombre> com.elmatrix.tv_1.0.0_all.ipk`
5. Abrila: `ares-launch --device <nombre> com.elmatrix.tv`

Resultado esperado: aparece la app "eLMaTrIx" en la TV y empieza a rotar widgets. Si la pantalla queda negra, mirá la consola con `ares-inspect --device <nombre> --app com.elmatrix.tv --open`.

### Compatibilidad con webOS 3.x

Se cubre con el build ES5, que incluye: Babel (sintaxis), `regenerator-runtime` (async/await), polyfills propios (`fetch` sobre XHR, `Object.assign`, `fill` en arrays tipados, etc.), un analizador de URL propio y CSS sin variables ni `gap`/`inset`/grid. Las zonas horarias usan `Intl`; si el motor no lo soporta de forma fiable, se usa una tabla interna de desfases y horario de verano (UTC, Europa, EE. UU., Argentina, Brasil, Japón y otras comunes; zonas fuera de la tabla se descartan en ese caso).

## Control remoto

| Tecla | En el cartel | En ajustes |
|-------|--------------|------------|
| Derecha / Izquierda | Widget siguiente / anterior | Cambiar valor, abrir opciones |
| OK | Abrir ajustes | Activar, cambiar o editar |
| Rojo | Abrir ajustes | Cerrar |
| Amarillo o Pausa/Play | Pausar o continuar | Borrar elemento de una lista |
| Atrás | Salir de la app (lo maneja la TV) | Volver / cerrar |
| Verde (teclado en pantalla) | Widget siguiente | Borrar carácter |

En el escritorio: flechas, Enter, Esc, y las letras `r`, `y`, `g`, `b` como teclas de color; Espacio pausa.

## Widgets

Reloj, Reloj mundial, Cuenta regresiva, Cotizaciones (CoinGecko + dolarapi.com), Pronóstico (Open-Meteo), Deportes (TheSportsDB), Frases positivas, Palabra y Pixel art (escena de día/noche, **Navidad** y Snake).

Modos visuales (no necesitan red): **Lluvia Matrix**, **Chimenea**, **Acuario**, **Fuegos artificiales**, **Plasma**, **Juego de la vida** (se reinicia solo si se estanca), **Estrellas** y **Visualizador de música** (barras de espectro; si no hay sonido muestra un espectro simulado).

Cada uno tiene sus opciones en Ajustes (se guardan en el almacenamiento local de la app). Si no hay red, los widgets con datos muestran "Sin conexión" y la rotación sigue.

## Música de fondo

Suena en todos los modos, siempre suave. La tecla **Azul** la apaga o la enciende; el volumen y la fuente se cambian en Ajustes (el volumen general de la TV sigue siendo el de la TV).

| Ajuste | Qué hace |
|--------|----------|
| Música de fondo / Volumen | Enciende o apaga; volumen de 0 a 100 % (por defecto 35 %) |
| Fuente de la música | **Radio en línea** (por defecto) o **Música incluida (sin internet)** |
| Emisora ambiente | SomaFM: Drone Zone (por defecto), SomaFM: Deep Space One, SomaFM: Space Station Soma o **Kiss FM España (radio comercial, con anuncios)** |
| Música en Navidad | **Villancicos (incluidos)** (por defecto) o "Radio: Christmas Lounge (lounge navideño)" |

Cómo funciona:

- **Todo el sonido sale por un único elemento `<audio>` con MP3.** Es lo que se comprobó en una TV real con webOS 3: ver "Qué se encontró en webOS 3" más abajo.
- **Radio en línea**: reproduce una emisora ambient de [SomaFM](https://somafm.com) (MP3 de 128 kbps) o, si la elegís, **Kiss FM España** ([kissfm.es](https://kissfm.es), MP3 de 56 kbps). Necesita internet. La URL de Kiss FM redirige a la emisión real con un permiso firmado que caduca; la TV sigue las redirecciones sola y la app vuelve a pedir la URL en cada reconexión.
- **Sin conexión o si falla la emisora**: reintenta a los 2 s y 4 s; tras 3 fallos seguidos, o si la TV no tiene red, pasa a la **música incluida** (`assets/music/ambient.mp3`, en bucle). Cada 3 minutos comprueba en silencio si la radio responde y, si es así, hace el cambio con fundidos.
- **Música incluida**: dos pistas MP3 de unos 4,5 minutos (`ambient.mp3` y `christmas.mp3`, ~2,2 MB cada una, 64 kbps mono 32 kHz) generadas por nosotros con síntesis (pads suaves, campanitas, reverb y eco). Son **versiones propias de melodías de dominio público**, sin licencia de terceros.
- **Navidad**: al mostrarse el modo Navidad de Pixel art, la música pasa a `christmas.mp3`: Noche de paz, Away in a Manger, Oh abeto, Jingle Bells (lento) y We Wish You a Merry Christmas (lento), con tonalidad, octava y voz distintas en cada pasada. No necesita internet. La opción "Radio: Christmas Lounge" es música *lounge* navideña, no villancicos clásicos.
- **Un solo elemento a la vez**: los cambios son secuenciales (baja el volumen del actual, se cambia la fuente y sube el nuevo), nunca dos sonando juntos.
- **Visualizador**: usa el analizador de audio solo en navegadores modernos. En la TV siempre usa el espectro simulado (y también si el analizador lee solo ceros durante ~2 s).
- **Sonido bloqueado**: si el motor web no deja iniciar el audio sin interacción, aparece "Pulsa OK para activar el sonido" y arranca con la primera tecla.

### Qué se encontró en webOS 3 (Chromium 38)

Probado en una TV real: el audio de **Web Audio no sale por los altavoces** (aunque el contexto corre), y los **WAV no funcionan** en `<audio>` (error 4). Los **MP3** sí, tanto de internet como (por probar) archivos locales. Por eso la música sintetizada ya no se genera en la TV: se renderiza una vez en el ordenador y se incluye como MP3. La reproducción de los MP3 incluidos en la TV **no se ha verificado todavía**.

### Volver a generar la música incluida

Solo hace falta si cambias las melodías o la síntesis (`tools/music/` y `tools/lib/offline-synth.js`); `npm run build` **no** necesita ffmpeg porque los MP3 ya están en `assets/music/`.

```bash
cd webos
npm run render-music   # requiere ffmpeg; genera assets/music/ambient.mp3 y christmas.mp3 (determinista)
npm run build
```

Créditos: radio de **SomaFM** (somafm.com), independiente y financiada por sus oyentes, y **Kiss FM España** (kissfm.es), emisora comercial. **No se revisaron formalmente los términos de uso de ninguna de las dos**: son emisiones públicas usadas para escucha personal; Kiss FM puede incluir anuncios y locución, y no es música ambient. Las URL están en una sola tabla (`js/music/stations.js`) por si alguna cambia o desaparece. Para un local público, revisá los términos o elegí "Música incluida".

## Limitaciones de la v1

- No incluidos: Tetris, Imágenes (GIF), Sistema, Comandos, Notificaciones, sincronización con el panel web de la Raspberry. Son de hardware o necesitan el servidor.
- La música incluida es sintética (osciladores), no una grabación; las melodías de los villancicos están escritas de memoria y pueden diferir de la partitura. La radio depende de internet y de que la emisora acepte la conexión (SomaFM devolvió 403 en pruebas desde un entorno de desarrollo).
- **No verificado**: cómo suena la música incluida, su reproducción como archivo local en la TV, el rendimiento en la TV real; las pruebas de audio usan un elemento `<audio>` simulado.
- La clave de TheSportsDB es la gratuita (`3`); CoinGecko puede limitar peticiones.
- webOS 3.x se soporta solo mediante `dist/` (build ES5). El motor Chromium 38 **no se pudo ejecutar localmente**: se verificó que el JavaScript compilado sea ES5 válido y que no use APIs ni CSS ausentes en Chromium 38, pero la ejecución real depende de probar en la TV.
- **No verificado en una TV real**: solo se probó en Chrome de escritorio (headless), tests de Node y capturas. No se probó el motor web de webOS, el rendimiento en el procesador de la TV, las teclas físicas del control ni `ares-package`/`ares-install` (las herramientas no estaban instaladas). La clave `resolution` de `appinfo.json` debería confirmarse contra tu versión de webOS.
- Las fuentes BDF son de dominio público (excepto `tom-thumb`, MIT); ver `assets/fonts/README*`.

## Estructura

`appinfo.json`, `index.html`, `css/`, `js/` (renderer, parser BDF, scheduler, ajustes, `compat.js`, `zones.js`, `audio.js`, `music/` (emisoras y reproductor), `widgets/`), `assets/fonts/`, `assets/music/` (MP3 incluidos), `tests/`, `tools/` (build, iconos, fuente de respaldo y render de la música), `dist/` (generado, no se versiona).
