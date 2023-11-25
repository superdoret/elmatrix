#!/usr/bin/env python
# Display a runtext with double-buffering.
from samplebase import SampleBase
from rgbmatrix import graphics
import time
import random

class RunText(SampleBase):
    def __init__(self, *args, **kwargs):
        super(RunText, self).__init__(*args, **kwargs)

    def run(self):
        offscreen_canvas = self.matrix.CreateFrameCanvas()
        font = graphics.Font()
        font.LoadFont("../../../fonts/7x14B.bdf")
        random_color = graphics.Color(random.randint(0,255), random.randint(0,255), random.randint(0,255))
        pos = offscreen_canvas.width
        my_text = "EL PRIMER PASO HACIA EL ÉXITO ES CUANDO TE NIEGAS A SER UN PRISIONERO DEL MEDIO AMBIENTE EN EL QUE TE ENCUENTRAS."

        while True:
            offscreen_canvas.Clear()
            len = graphics.DrawText(offscreen_canvas, font, pos, 21, random_color, my_text)
            pos -= 1
            if (pos + len < 0):
                pos = offscreen_canvas.width

            time.sleep(0.05)
            offscreen_canvas = self.matrix.SwapOnVSync(offscreen_canvas)


# Main function
if __name__ == "__main__":
    run_text = RunText()
    if (not run_text.process()):
        run_text.print_help()
