#!/usr/bin/env python
from models.words import get_positive_word
from samplebase import SampleBase
from rgbmatrix import graphics
import time
import random
import sys

class RunText(SampleBase):
    def __init__(self, *args, **kwargs):
        super(RunText, self).__init__(*args, **kwargs)

    def run(self):
        offscreen_canvas = self.matrix.CreateFrameCanvas()
        font = graphics.Font()
        font.LoadFont("../../../fonts/7x14B.bdf")
        random_color = graphics.Color(random.randint(0,255), random.randint(0,255), random.randint(0,255))
        word = get_positive_word().center(10)

        x = 0
        y = 0

        action = random.randint(1,4)

        if action == 1: #top
            y = -21
            while(y <= 21):
                offscreen_canvas.Clear()
                graphics.DrawText(offscreen_canvas, font, 0, y, random_color, word)
                time.sleep(0.05)
                offscreen_canvas = self.matrix.SwapOnVSync(offscreen_canvas)
                y = y + 1
        elif action == 2:  #'bottom'
            y = 41
            while(y >= 21):
                offscreen_canvas.Clear()
                graphics.DrawText(offscreen_canvas, font, 0, y, random_color, word)
                time.sleep(0.05)
                offscreen_canvas = self.matrix.SwapOnVSync(offscreen_canvas)
                y = y - 2
        elif action == 3: # 'left'
            x = -60
            while(x <= 0):
                offscreen_canvas.Clear()
                graphics.DrawText(offscreen_canvas, font, x, 21, random_color, word)
                time.sleep(0.200)
                offscreen_canvas = self.matrix.SwapOnVSync(offscreen_canvas)
                x = x + 2
        elif action == 4: #'right':
            x = 60
            while(x >= 0):
                offscreen_canvas.Clear()
                graphics.DrawText(offscreen_canvas, font, x, 21, random_color, word)
                time.sleep(0.200)
                offscreen_canvas = self.matrix.SwapOnVSync(offscreen_canvas)
                x = x - 2
        else:
            graphics.DrawText(offscreen_canvas, font, 0, 21, random_color, word)

        time.sleep(2)   # show display for 2 seconds before exit
        sys.exit(0)

# Main function
if __name__ == "__main__":
    run_text = RunText()
    if (not run_text.process()):
        run_text.print_help()
