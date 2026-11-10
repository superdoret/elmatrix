"""Tk window that renders the simulated LED panel.

The application code runs in a worker thread and only writes into a shared
pixel buffer; this module (main thread) paints that buffer ~60 times/second.
"""
import os
import threading

SCALE = int(os.environ.get("SIM_SCALE", "12"))


class Display(object):
    def __init__(self, width, height, brightness=100):
        self.width = width
        self.height = height
        self.brightness = max(1, min(100, brightness))
        self.source = lambda: [(0, 0, 0)] * (width * height)
        self.closed = False

    def run_gui(self, worker):
        """Blocks in the Tk main loop while `worker` runs in a daemon thread."""
        import tkinter as tk

        root = tk.Tk()
        root.title("RGB LED Matrix simulator (%dx%d)" % (self.width, self.height))
        root.configure(bg="#000000")
        w, h = self.width * SCALE, self.height * SCALE
        canvas = tk.Canvas(root, width=w, height=h, bg="#050505", highlightthickness=0)
        canvas.pack()

        pad = max(1, SCALE // 8)
        items = []
        for y in range(self.height):
            for x in range(self.width):
                items.append(canvas.create_oval(
                    x * SCALE + pad, y * SCALE + pad,
                    (x + 1) * SCALE - pad, (y + 1) * SCALE - pad,
                    fill="#0a0a0a", outline=""))

        shown = [None] * len(items)
        k = self.brightness / 100.0

        last = [None]

        def repaint():
            # Direct drawing (Clear() then DrawText()) is not atomic. Only paint
            # a frame once it is stable between two polls, so the half-drawn
            # state is never shown (real panels also look "clean" to the eye).
            frame = list(self.source())
            stable = frame == last[0]
            last[0] = frame
            if not stable:
                root.after(8, repaint)
                return
            for i, px in enumerate(frame):
                if px != shown[i]:
                    shown[i] = px
                    r, g, b = px
                    if r or g or b:
                        color = "#%02x%02x%02x" % (int(r * k), int(g * k), int(b * k))
                    else:
                        color = "#0a0a0a"
                    canvas.itemconfig(items[i], fill=color)
            root.after(8, repaint)

        def on_close():
            self.closed = True
            root.destroy()

        root.protocol("WM_DELETE_WINDOW", on_close)
        root.bind("<Escape>", lambda e: on_close())
        repaint()
        threading.Thread(target=worker, daemon=True).start()
        try:
            root.mainloop()
        except KeyboardInterrupt:
            pass
