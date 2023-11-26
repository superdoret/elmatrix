#!/usr/bin/env python

from models.phrases import get_positive_phrase
from base import Base
from rgbmatrix import graphics
import time
import random
import os
import sys
import asyncio

class ShowText(Base):
    def __init__(self, *args, **kwargs):
        super(ShowText, self).__init__(*args, **kwargs)

    async def run(self):

        offscreen_canvas = self.matrix.CreateFrameCanvas()
        font = graphics.Font()
        font.LoadFont("../../../fonts/7x14B.bdf")
        random_color = graphics.Color(random.randint(0,255), random.randint(0,255), random.randint(0,255))
        pos = offscreen_canvas.width
        phrase_selected = "WEATHER"

        while True:
            offscreen_canvas.Clear()
            len_word = graphics.DrawText(offscreen_canvas, font, pos, 21, random_color, phrase_selected)
            pos -= 1
            if (pos + len_word < 0):
                break

            time.sleep(0.05)
            offscreen_canvas = self.matrix.SwapOnVSync(offscreen_canvas)


        time.sleep(5)   # show display for 2 seconds before exit
        sys.exit(0)

# Main function
if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    mainModule = ShowText()
    if (not asyncio.run(mainModule.run())):
        mainModule.print_help()
