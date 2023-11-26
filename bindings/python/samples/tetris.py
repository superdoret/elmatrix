#!/usr/bin/env python
# Display a runtext with double-buffering.
from models.phrases import get_positive_phrase
from base import Base
import lib.tetris_led as tetris

import time
import sys
import asyncio
import os

class RunText(Base):
    def __init__(self, *args, **kwargs):
        super(RunText, self).__init__(*args, **kwargs)

    async def run(self):

        try:
            double_buffer = self.matrix.CreateFrameCanvas()

            print('Canvas size W[%d] H[%d]'%(self.matrix.width, self.matrix.height))

            tetris.make_canvas(self.matrix.height, self.matrix.width , 0)

            now = time.strftime('%H %M', time.localtime(time.time()))

            tetris.set_scale(2)
            tetris.set_bottom_shift(0)
            tetris_str2 = tetris.TetrisString(1, -4,  now)
            tetris_str2.animate(self.matrix, double_buffer)

            time.sleep(10)
        except Exception as ex:
            print("Error in Tetris Clock: " + str(ex))
            return

        time.sleep(2)   # show display for 2 seconds before exit
        sys.exit(0)

# Main function# Main function
if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    mainModule = RunText()
    if (not asyncio.run(mainModule.process())):
        mainModule.print_help()
