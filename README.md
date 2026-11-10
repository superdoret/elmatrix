# eLMaTrIx

Panel RGB LED (64x32) que muestra en bucle modos al azar: frases positivas, palabras,
hora, clima (por ciudad), comandos de terminal, imágenes/GIFs y Tetris.

## Estructura

```
bkp/                 # contenido original del repo (respaldo, no se usa)
src/
├── main.py          # punto de entrada: elige un modo al azar, para siempre
├── base.py          # argumentos CLI y configuración del panel
├── paths.py         # rutas de assets y libs
├── text.py  weather.py  commands.py  images.py  tetris.py  positive-phrases.py   # modos
├── models/          # contenido (palabras, frases, ciudades, comandos)
├── assets/          # fuentes .bdf e imágenes (clima, GIFs)
├── libs/            # dependencias
│   ├── matrix/      # librería C++ del panel
│   ├── rgbmatrix/   # bindings Python (.pyx) y su compilado (.so)
│   └── site-packages/   # dependencias pip (las crea `make deps`)
├── simulator/       # simulador en pantalla (sin hardware)
├── Makefile  setup.py  requirements.txt
```

Todo se instala dentro de `src/libs`: no se toca el Python del sistema.

---

## Ubuntu (simulador)

```bash
sudo apt update && sudo apt install -y python3 python3-pip python3-tk
cd src
make deps                      # una sola vez
python3 simulator/run.py       # abre una ventana con el panel
```

- `Esc` o cerrar la ventana termina el programa.
- Tamaño de los puntos: `SIM_SCALE=16 python3 simulator/run.py` (default 12).
- Cualquier parámetro del panel se pasa igual: `python3 simulator/run.py --led-cols=64 --led-rows=32`.
- El simulador usa brillo 100 por defecto (con 30 se ve muy oscuro en monitor).

> Si `make deps` falla por "externally-managed-environment", usá un venv:
> `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` y ejecutá con `.venv/bin/python`.

## Windows 11 (simulador)

Instalar [Python 3](https://www.python.org/downloads/) (marcar *Add python.exe to PATH*; incluye Tkinter). Sin `make`, en PowerShell:

```powershell
cd src
pip install --upgrade --target libs\site-packages python-weather pillow numpy
python simulator\run.py
```

Si `python` no existe, usar `py` en su lugar. Los parámetros se pasan igual que en Ubuntu.

## Raspberry Pi (panel real)

Probado con Adafruit RGB Matrix HAT. Se compila **en la Raspberry** (los `.so` y `site-packages` dependen de la plataforma: no los copies desde otra máquina).

```bash
sudo apt update && sudo apt install -y python3-dev python3-pip build-essential
cd src
make all                       # deps + compila la librería C++ y los bindings
sudo python3 main.py           # corre la app (Ctrl-C para detener)
```

`main.py` usa por defecto `--led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness=30`.
Para cambiar algo, agregá parámetros (pisan los defaults): `sudo python3 main.py --led-brightness=50`.

Para que arranque solo al encender, agregá a `sudo crontab -e`:

```
@reboot cd /home/pi/elmatrix/src && python3 main.py
```

(ajustá la ruta/usuario a donde clonaste el repo).

## Parámetros útiles

| Parámetro | Default | Descripción |
|---|---|---|
| `--led-rows` | `32` | Filas del panel. |
| `--led-cols` | `64` | Columnas del panel. |
| `--led-brightness` | `30` (sim: `100`) | Brillo, 1 a 100. |
| `--led-slowdown-gpio` | `4` | Subir si hay parpadeo (0 a 4). |
| `--led-gpio-mapping` | `adafruit-hat` | Mapeo de pines. |
| `--city` | — | Ciudad para el clima. |

## Comandos `make` (en `src/`)

`make help` · `deps` · `build` · `all` · `run` · `simulate` · `clean` · `distclean`

## Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `No module named 'rgbmatrix.core'` | Falta `make build` (solo en Raspberry); en PC usá `simulator/run.py`. |
| `No module named 'PIL'` / `python_weather` / `numpy` | Falta `make deps`. |
| `No module named 'tkinter'` | Ubuntu: `sudo apt install python3-tk`. |
| Parpadeo en el panel | Subir `--led-slowdown-gpio` o agregar `--led-no-hardware-pulse`. |
| Colores cambiados | Probar `--led-rgb-sequence=RBG` (u otro orden). |
| El clima no aparece | Sin internet, o ciudad no encontrada. |
