#!/usr/bin/env python
from base import Base
from random import choice
from PIL import Image, ImageSequence
from datetime import datetime, timedelta
from glob import glob

import time
import random
import sys
import asyncio
import os

class RunText(Base):
    def __init__(self, *args, **kwargs):
        super(RunText, self).__init__(*args, **kwargs)

    def get_frames(self, path):
        """Returns an iterable of gif frames."""
        frames = []
        with Image.open(path) as gif:
            for frame in ImageSequence.Iterator(gif):
                frame = frame.convert('RGB').resize((64, 32))
                frames.append(frame)
            return frames

    async def run(self):

        try:
            offscreen_canvas = self.matrix.CreateFrameCanvas()
            offscreen_canvas.Clear()
            main_directory = "../../../img/fun"
            files = [i for i in glob(f'{main_directory}/*/*') if os.path.isfile(i)]
            random_file = choice(files)
            print(random_file)
            end_date = datetime.now() + timedelta(seconds=30)

            while datetime.now() <= end_date:
                for frame in Images.get_frames(self, random_file):
                    offscreen_canvas.SetImage(frame)
                    time.sleep(frame.info['duration']/1000)
                    offscreen_canvas = self.matrix.SwapOnVSync(offscreen_canvas)
        except Exception as ex:
            print("Error in Images: " + str(ex))
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
