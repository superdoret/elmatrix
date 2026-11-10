#!/usr/bin/env python
# Display a runtext with double-buffering.
from models.phrases import get_positive_phrase
from base import Base
from rgbmatrix import graphics

import time
import random
import sys
import asyncio
import os

class RunText(Base):
    def __init__(self, *args, **kwargs):
        super(RunText, self).__init__(*args, **kwargs)

    async def run(self):
        offscreen_canvas = self.matrix.CreateFrameCanvas()
        font = graphics.Font()
        font.LoadFont("../../../fonts/7x14B.bdf")
        random_color = graphics.Color(random.randint(0,255), random.randint(0,255), random.randint(0,255))
        pos = offscreen_canvas.width
        phrase_selected = get_positive_phrase()

        while True:
            offscreen_canvas.Clear()
            len_word = graphics.DrawText(offscreen_canvas, font, pos, 21, random_color, phrase_selected)
            pos -= 1
            if (pos + len_word < 0):
                break

            time.sleep(0.05)
            offscreen_canvas = self.matrix.SwapOnVSync(offscreen_canvas)

        time.sleep(2)   # show display for 2 seconds before exit
        sys.exit(0)

# Main function# Main function
if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    mainModule = RunText()
    if (not asyncio.run(mainModule.process())):
        mainModule.print_help()
