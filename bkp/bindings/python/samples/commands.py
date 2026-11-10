#!/usr/bin/env python
# Display a runtext with double-buffering.
from models.commands import get_command
from base import Base
from rgbmatrix import graphics

import time
import sys
import asyncio
import os

class RunText(Base):
    def __init__(self, *args, **kwargs):
        super(RunText, self).__init__(*args, **kwargs)

    async def run(self):
        try:
            command_selected = get_command()

            print("command selected: " + command_selected)

            canvas = self.matrix.CreateFrameCanvas()
            canvas.Clear()

            font_prompt = graphics.Font()
            font_prompt.LoadFont("../../../fonts/5x8.bdf") #+ self.args.font)

            font_command = graphics.Font()
            font_command.LoadFont("../../../fonts/6x13.bdf") # + self.args.font)
            green_color = graphics.Color(0, 128, 144)

            times = 0
            blink = 0

            command_char_ar = []
            command_char_ar.extend( command_selected )

            while(times < 2):
                times = times + 1
                blink = 0
                cmd = ""
                while(blink < 5):
                    blink = blink + 1

                    if(blink <= len(command_char_ar)):
                        cmd = cmd + command_char_ar[blink-1]

                    graphics.DrawText(canvas, font_prompt, 2, 19, green_color, ">_")
                    graphics.DrawText(canvas, font_command, 14, 20, green_color, cmd)
                    time.sleep(0.5)
                    canvas.Clear()
                    graphics.DrawText(canvas, font_prompt, 2, 19, green_color, "> ")
                    graphics.DrawText(canvas, font_command, 14, 20, green_color, cmd)
                    time.sleep(0.5)
                    graphics.DrawText(canvas, font_prompt, 2, 19, green_color, ">_")
                    canvas = self.matrix.SwapOnVSync(canvas)
        except Exception as ex:
            print("Error in Commands: " + str(ex))
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
