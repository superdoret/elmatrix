# Simulador del panel LED

Ejecuta `src/main.py` **sin modificarlo**, dibujando en una ventana en vez de en el panel real.
Reemplaza el paquete `rgbmatrix` por una versión que pinta en pantalla (Tkinter): fuentes BDF, texto,
imágenes, `SwapOnVSync`, brillo y tamaño (`--led-rows`, `--led-cols`, `--led-chain`, `--led-parallel`).

## Uso

```bash
# una sola vez: entorno virtual (Debian/Ubuntu bloquean pip a nivel sistema)
python3 -m venv src/simulator/.venv
src/simulator/.venv/bin/pip install python-weather pillow

# ejecutar (sin sudo)
src/simulator/.venv/bin/python src/simulator/run.py [mismos parámetros que main.py]
```

Ejemplo: `src/simulator/.venv/bin/python src/simulator/run.py --led-brightness 60 --verbose true`

- Cerrar la ventana o `Esc` termina el programa.
- Tamaño de los puntos: `SIM_SCALE=16 .venv/bin/python run.py` (default 12).
- Requiere `tkinter` (`sudo apt install python3-tk` si falta).

## Qué no simula
Timing del hardware (PWM, refresco), `--led-rgb-sequence`, `--led-pixel-mapper`, multiplexado y
`--led-slowdown-gpio`: se aceptan pero no tienen efecto visual.
