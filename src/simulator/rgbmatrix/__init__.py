"""Drop-in replacement for the `rgbmatrix` Python bindings that draws on screen.

Mirrors the public API used by the real bindings (RGBMatrix, RGBMatrixOptions,
FrameCanvas, graphics) so application code runs unchanged.
"""
from ._display import Display

_display = None  # set by RGBMatrix(); read by simulator/run.py


class RGBMatrixOptions(object):
    def __init__(self):
        self.hardware_mapping = ""
        self.rows = 32
        self.cols = 32
        self.chain_length = 1
        self.parallel = 1
        self.pwm_bits = 11
        self.pwm_lsb_nanoseconds = 130
        self.brightness = 100
        self.scan_mode = 0
        self.multiplexing = 0
        self.row_address_type = 0
        self.disable_hardware_pulsing = False
        self.show_refresh_rate = False
        self.inverse_colors = False
        self.led_rgb_sequence = "RGB"
        self.pixel_mapper_config = ""
        self.panel_type = ""
        self.gpio_slowdown = 1
        self.drop_privileges = True


class Canvas(object):
    """Pixel buffer with the same drawing API as the real Canvas/FrameCanvas."""

    def __init__(self, width, height):
        self._w = width
        self._h = height
        self._px = [(0, 0, 0)] * (width * height)

    width = property(lambda self: self._w)
    height = property(lambda self: self._h)

    def Fill(self, red, green, blue):
        self._px = [(red & 255, green & 255, blue & 255)] * (self._w * self._h)

    def Clear(self):
        self._px = [(0, 0, 0)] * (self._w * self._h)

    def SetPixel(self, x, y, red, green, blue):
        if 0 <= x < self._w and 0 <= y < self._h:
            self._px[y * self._w + x] = (red & 255, green & 255, blue & 255)

    def SetImage(self, image, offset_x=0, offset_y=0, unsafe=True):
        if image.mode != "RGB":
            raise Exception("Currently, only RGB mode is supported for SetImage(). "
                            "Please create images with mode 'RGB' or convert first.")
        iw, ih = image.size
        pixels = image.load()
        for x in range(max(0, -offset_x), min(iw, self._w - offset_x)):
            for y in range(max(0, -offset_y), min(ih, self._h - offset_y)):
                r, g, b = pixels[x, y]
                self._px[(y + offset_y) * self._w + x + offset_x] = (r, g, b)

    def SetPixelsPillow(self, xstart, ystart, width, height, image):
        self.SetImage(image, xstart, ystart)


class FrameCanvas(Canvas):
    pwmBits = 11
    brightness = 100


class RGBMatrix(Canvas):
    """The visible panel. Like the real one, drawing on it is shown immediately."""

    def __init__(self, options=None):
        global _display
        options = options or RGBMatrixOptions()
        width = options.cols * options.chain_length
        height = options.rows * options.parallel
        Canvas.__init__(self, width, height)
        # The app creates one RGBMatrix per mode; the window is created once,
        # so later matrices reuse the same display.
        if _display is None:
            _display = Display(width, height, options.brightness)
        self._display = _display
        self._display.brightness = max(1, min(100, options.brightness))
        self._display.source = lambda: self._px
        self._brightness = options.brightness
        self._pwm_bits = options.pwm_bits

    def CreateFrameCanvas(self):
        return FrameCanvas(self._w, self._h)

    def SwapOnVSync(self, canvas, framerate_fraction=1):
        # Real API returns the previously displayed canvas, ready for reuse.
        old = FrameCanvas(self._w, self._h)
        old._px = self._px
        self._px = list(canvas._px)  # swap is atomic: one reference assignment
        return old

    brightness = property(lambda self: self._brightness,
                          lambda self, v: setattr(self, "_brightness", v) or
                          setattr(self._display, "brightness", max(1, min(100, v))))
    pwmBits = property(lambda self: self._pwm_bits,
                       lambda self, v: setattr(self, "_pwm_bits", v))
