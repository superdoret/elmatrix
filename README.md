# eLMaTrIx

Panel RGB LED (64x32) que muestra en bucle widgets: frases, palabras, hora, clima, cotizaciones,
deportes, estado del sistema, pixel art, Tetris y más. Incluye un **panel web** para ver el
simulador en vivo, activar/desactivar widgets, cambiar sus ajustes y enviar notificaciones.

## Estructura

```
bkp/                 # contenido original del repo (respaldo, no se usa)
src/
├── main.py          # punto de entrada: scheduler + panel web
├── scheduler.py     # decide qué widget corre (rotación, "ejecutar ahora", notificaciones)
├── runner.py        # ejecuta un widget (subproceso en el panel real, en proceso en el simulador)
├── catalog.py       # catálogo de widgets y esquema de sus ajustes
├── settings.py      # ajustes guardados en data/settings.json
├── widget_base.py   # base de los widgets nuevos        net.py   # HTTP con caché y modo offline
├── text.py  weather.py  commands.py  images.py  tetris.py  positive-phrases.py   # widgets originales
├── widgets/         # widgets nuevos (rates, sysinfo, sports, worldclock, countdown, forecast, notify, pixelart)
├── webpanel/        # server.py (API, solo stdlib) e index.html (panel, sin CDN)
├── tests/           # tests unitarios y smoke
├── data/            # ajustes y caché en tiempo de ejecución (gitignored)
├── models/  assets/ # contenido, fuentes e imágenes
├── libs/            # dependencias: matrix/ (C++), rgbmatrix/ (bindings), site-packages/ (pip)
├── simulator/       # simulador en pantalla (sin hardware)
└── Makefile  setup.py  requirements.txt
```

Todo se instala dentro de `src/libs`: no se toca el Python del sistema.

---

## Panel web

Se inicia solo junto con la app. Abrí **http://localhost:8080**.

| Quiero... | Comando |
|---|---|
| Simulador con ventana + panel web | `python3 simulator/run.py` |
| Solo panel web, sin ventana (headless) | `python3 simulator/run.py --no-window` |
| Otro puerto | `--web-port 9000` |
| Sin panel web | `--no-web` |
| Verlo desde otros equipos de la red | ya es el comportamiento por defecto; al arrancar se imprime `http://<IP-LAN>:8080/` |
| Cambiar usuario/clave del panel | variables `ELMATRIX_USER` / `ELMATRIX_PASSWORD` (o `--web-user` / `--web-password`) |
| Limitarlo a este equipo | `--web-host 127.0.0.1` |

El panel permite: ver el estado (widget actual, pausa, último resultado, cola), saltar o pausar,
**ejecutar un widget ahora**, activar/desactivar widgets, editar sus ajustes (con validación),
cambiar los ajustes generales (pausa entre widgets, brillo, orden) y probar notificaciones.

- **Vista en vivo solo en el simulador.** En la Raspberry el panel muestra catálogo, ajustes y estado,
  pero no los píxeles (viven en la librería C++).
- El brillo solo afecta al panel real; el simulador siempre usa 100.

### Seguridad

- Por defecto escucha en `0.0.0.0`: **cualquier equipo de tu red local** puede abrir el panel (es lo que se necesita para usarlo desde el celular o la PC).
- El panel pide **usuario y contraseña** (pantalla `/login`). Usuario por defecto: `admin`. **No hay contraseña fija en el repositorio** (es público): si no definís una, la primera vez que arranca la app **genera una aleatoria, la imprime en consola y la guarda** en `src/data/web_password` (solo legible por tu usuario, ignorada por git), y la reutiliza en los siguientes arranques.
- Para fijar la tuya, preferí variables de entorno (los argumentos de la línea de comandos se ven en `ps`):

  ```bash
  ELMATRIX_USER=yo ELMATRIX_PASSWORD='una-clave-larga' python3 simulator/run.py
  # o, menos recomendable: --web-user yo --web-password 'una-clave-larga'
  ```

  Si ambos están definidos, el argumento gana a la variable, y la variable gana a la clave guardada. Para rotar la clave generada, borrá `src/data/web_password` y reiniciá.
- Todo requiere sesión salvo `/login`, `POST /api/login` y `GET /api/auth`. La sesión es una cookie `HttpOnly` + `SameSite=Strict` que dura 12 horas y se pierde al reiniciar la app. El botón de salida (arriba a la derecha) la cierra.
- Anti fuerza bruta: tras **5 intentos fallidos seguidos** desde una misma IP (en el login o con Basic) esa IP queda bloqueada **60 s** (`429` con `Retry-After`); un acceso correcto reinicia el contador.
- Límites honestos: el tráfico va en **HTTP sin cifrar**, así que la clave y la cookie se pueden ver en la red local. Usalo solo en una red de confianza, con una clave propia, y **sin redirección de puertos hacia internet**.

### Webhook de notificaciones

Cualquier programa puede mostrar un mensaje en el panel. Primero activá el widget **Notificaciones**
(viene desactivado). El mensaje entra en una cola (máximo configurable) y se muestra con prioridad.

```bash
curl -u admin:TU_CLAVE -X POST http://192.168.1.50:8080/api/notify \
  -H 'Content-Type: application/json' \
  -d '{"message":"Deploy listo","color":"#00ff00","seconds":8}'
```

Los scripts usan HTTP Basic (`-u usuario:clave`), no necesitan cookie. Evitá poner la clave en el historial de la
shell: usá `-u admin:"$ELMATRIX_PASSWORD"` o un archivo `~/.netrc`.

`color` y `seconds` son opcionales. Respuestas: `200` ok, `401` sin credenciales o incorrectas, `429` bloqueo por demasiados intentos (ver `Retry-After`), `409` widget desactivado,
`429` también si la cola está llena, `415` falta `Content-Type: application/json`. PowerShell:

```powershell
$cred = Get-Credential admin
Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/notify -Credential $cred `
  -AllowUnencryptedAuthentication -ContentType 'application/json' -Body '{"message":"Hola"}'
```

(`-AllowUnencryptedAuthentication` requiere PowerShell 7 y es necesario porque el panel usa HTTP; en Windows PowerShell 5.1 agregá el encabezado a mano:
`-Headers @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("admin:TU_CLAVE")) }`.)

## Widgets

| Widget | Qué hace | Ajustes | Internet |
|---|---|---|---|
| Frases positivas | Frases con efectos de color | - | No |
| Palabra | Palabra aleatoria deslizándose | - | No |
| Reloj | Palabra aleatoria con la hora | - | No |
| Clima | Temperatura actual de una ciudad | ciudad (vacía = al azar) | Sí |
| Comandos | Comandos de terminal parpadeando | - | No |
| Imágenes | GIF animado al azar | duración | No |
| Tetris | Tetris jugando solo | - | No |
| Cotizaciones | Cripto (CoinGecko) y dólar ARS (dolarapi.com) | monedas, referencia USD/EUR, dólar y tipo, duración | Sí |
| Sistema | CPU, temperatura, RAM, disco y ping | qué mostrar, host de ping, duración | No (el ping es opcional) |
| Deportes | Último resultado y próximo partido (TheSportsDB) | equipo, clave de API, duración | Sí |
| Reloj mundial | Hora en varias ciudades | zonas `Etiqueta\|Zona`, 24 h, duración | No |
| Cuenta regresiva | Días hasta tus fechas | eventos `Nombre\|AAAA-MM-DD`, mostrar pasados, duración | No |
| Pronóstico | Próximos 2 o 3 días (Open-Meteo) | ciudad, días, duración | Sí |
| Notificaciones | Mensajes enviados por API/panel; no entra en la rotación | color, segundos y cola máxima por defecto | No |
| Pixel art | Escena día/noche o Snake solo | estilo, mostrar hora, duración | No |

Sin internet, los widgets que lo usan muestran "Sin conexion" (o datos en caché) y el resto sigue funcionando.
Ninguno necesita claves de API.

Los ajustes se guardan en `src/data/settings.json` (ignorado por git; carpeta configurable con `ELMATRIX_DATA_DIR`).

---

## Instalación

> Dependencias (`requirements.txt`): `python-weather`, `pillow`, `numpy`, `psutil`, `tzdata` (más `cython`/`setuptools` para compilar en la Raspberry).

### Ubuntu (simulador)

```bash
sudo apt update && sudo apt install -y python3 python3-pip python3-tk
cd src
make deps                      # una sola vez
python3 simulator/run.py       # ventana + http://localhost:8080
```

- `Esc` o cerrar la ventana termina el programa. Sin entorno gráfico: `python3 simulator/run.py --no-window`.
- Tamaño de los puntos: `SIM_SCALE=16 python3 simulator/run.py` (default 12).
- Cualquier parámetro del panel se pasa igual: `python3 simulator/run.py --led-cols=64 --led-rows=32`.

> Si `make deps` falla por "externally-managed-environment", usá un venv:
> `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` y ejecutá con `.venv/bin/python`.

### Windows 11 (simulador)

Instalar [Python 3](https://www.python.org/downloads/) (marcar *Add python.exe to PATH*; incluye Tkinter). Sin `make`, en PowerShell:

```powershell
cd src
python -m pip install --upgrade --target libs\site-packages -r requirements.txt
python simulator\run.py
```

Si `python` no existe, usar `py`. Para solo web: `python simulator\run.py --no-window`.
Si el firewall pregunta al abrir el puerto, permití solo redes privadas.

### macOS (simulador)

Con Homebrew: `brew install python python-tk`. Alternativa: Python de [python.org](https://www.python.org/downloads/macos/) (ya trae Tk).

```bash
cd src
python3 -m pip install --upgrade --target libs/site-packages -r requirements.txt
python3 simulator/run.py
```

Con Python de python.org, si ves errores HTTPS (`CERTIFICATE_VERIFY_FAILED`), ejecutá una vez
"Install Certificates.command" (carpeta Python en Aplicaciones).

### Raspberry Pi (panel real)

Se compila **en la Raspberry** (los `.so` y `site-packages` dependen de la plataforma: no los copies desde otra máquina).

```bash
sudo apt update && sudo apt install -y python3-dev python3-pip build-essential
cd src
make all                       # deps + compila la librería C++ y los bindings
sudo python3 main.py           # corre la app (Ctrl-C para detener)
```

`main.py` usa por defecto `--led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness=30`
(el brillo se cambia desde el panel web). Para cambiar otros parámetros, agregalos (pisan los defaults):
`sudo python3 main.py --led-slowdown-gpio=2`.

Para que arranque solo al encender, agregá a `sudo crontab -e`:

```
@reboot cd /home/pi/elmatrix/src && python3 main.py
```

(ajustá la ruta/usuario). El panel web queda accesible desde tu red en `http://<IP-de-la-Raspberry>:8080/` (la clave generada se imprime al primer arranque y queda en `src/data/web_password`; o definí `ELMATRIX_PASSWORD`).

### Probado / no probado

- Probado: **solo Ubuntu** (simulador, panel web y tests).
- **No probado**: Windows 11, macOS y el panel real en la Raspberry Pi (modo hardware, subproceso por widget).
- Los widgets que usan internet se verificaron con respuestas simuladas y en modo offline; algunas APIs externas pueden cambiar o limitar el acceso.

## Tests

```bash
cd src
python3 -m unittest discover -s tests     # tests unitarios
python3 tests/smoke_widgets.py            # cada widget nuevo corre en el simulador y enciende píxeles
```

En Windows: `python -m unittest discover -s tests` y `python tests\smoke_widgets.py`.

## Parámetros útiles

| Parámetro | Default | Descripción |
|---|---|---|
| `--web-host` | `0.0.0.0` | Dirección del panel web (`127.0.0.1` = solo este equipo). |
| `--web-port` | `8080` | Puerto del panel web. |
| `--web-user` | env `ELMATRIX_USER`, o `admin` | Usuario del panel web. |
| `--web-password` | env `ELMATRIX_PASSWORD`, o una aleatoria guardada en `src/data/web_password` | Contraseña del panel web (preferí la variable de entorno). |
| `--no-web` | - | No inicia el panel web. |
| `--no-window` | - | Solo simulador: sin ventana, solo web. |
| `--led-rows` / `--led-cols` | `32` / `64` | Tamaño del panel. |
| `--led-slowdown-gpio` | `4` | Subir si hay parpadeo (0 a 4). |
| `--led-gpio-mapping` | `adafruit-hat` | Mapeo de pines. |

Los argumentos desconocidos se pasan a cada widget. El brillo se ajusta en el panel web.

## Comandos `make` (en `src/`)

`make help` · `deps` · `build` · `all` · `run` · `simulate` · `clean` · `distclean`

## Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `No module named 'rgbmatrix.core'` | Falta `make build` (solo en Raspberry); en PC usá `simulator/run.py`. |
| `No module named 'PIL'` / `python_weather` / `numpy` / `psutil` / `zoneinfo` | Faltan dependencias: `make deps` (o el `pip install` de tu sistema). |
| `No module named 'tkinter'` | Ubuntu: `sudo apt install python3-tk`; macOS: `brew install python-tk`. |
| No abre el panel web | Puerto ocupado: usá `--web-port`. |
| `401` al guardar | La sesión caducó o se reinició la app: volvé a ingresar en `/login`. |
| `429` en el login | Demasiados intentos fallidos: esperá el tiempo indicado (60 s). |
| `409` al enviar notificación | Activá el widget Notificaciones. |
| Vista previa "solo disponible en el simulador" | Es lo esperado en la Raspberry. |
| Un widget muestra "Sin conexion" | Sin internet o el servicio externo no responde; reintenta solo. |
| `CERTIFICATE_VERIFY_FAILED` (macOS, python.org) | Ejecutá "Install Certificates.command". |
| Parpadeo en el panel | Subir `--led-slowdown-gpio` o agregar `--led-no-hardware-pulse`. |
| Colores cambiados | Probar `--led-rgb-sequence=RBG` (u otro orden). |
