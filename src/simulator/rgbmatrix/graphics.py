"""Simulated `rgbmatrix.graphics`: BDF fonts, text, lines and circles."""


class Color(object):
    def __init__(self, red=0, green=0, blue=0):
        self.red = red & 255
        self.green = green & 255
        self.blue = blue & 255


class Font(object):
    def __init__(self):
        self._glyphs = {}
        self._height = 0
        self._baseline = 0

    def LoadFont(self, file):
        glyphs, cur, rows, in_bitmap = {}, None, [], False
        ascent = descent = 0
        try:
            fh = open(file, "r", encoding="latin-1")
        except OSError:
            return False
        with fh:
            for line in fh:
                parts = line.split()
                if not parts:
                    continue
                key = parts[0]
                if in_bitmap:
                    if key == "ENDCHAR":
                        in_bitmap = False
                        cur["rows"] = rows
                        if cur["enc"] >= 0:
                            glyphs[cur["enc"]] = cur
                    else:
                        rows.append(int(key, 16) if len(key) else 0)
                        cur["nbits"] = len(key) * 4
                elif key == "FONT_ASCENT":
                    ascent = int(parts[1])
                elif key == "FONT_DESCENT":
                    descent = int(parts[1])
                elif key == "STARTCHAR":
                    cur, rows = {"enc": -1, "dw": 0, "bbx": (0, 0, 0, 0), "nbits": 0}, []
                elif key == "ENCODING":
                    cur["enc"] = int(parts[1])
                elif key == "DWIDTH":
                    cur["dw"] = int(parts[1])
                elif key == "BBX":
                    cur["bbx"] = tuple(int(v) for v in parts[1:5])
                elif key == "BITMAP":
                    in_bitmap = True
        if not glyphs:
            return False
        self._glyphs = glyphs
        self._baseline = ascent
        self._height = ascent + descent
        return True

    @property
    def height(self):
        return self._height

    @property
    def baseline(self):
        return self._baseline

    def CharacterWidth(self, char):
        g = self._glyphs.get(char)
        return g["dw"] if g else -1

    def DrawGlyph(self, c, x, y, color, char):
        g = self._glyphs.get(char)
        if g is None:
            return 0
        w, h, xoff, yoff = g["bbx"]
        nbits = g["nbits"]
        top = y - yoff - h
        for ry, bits in enumerate(g["rows"]):
            for cx in range(w):
                if bits & (1 << (nbits - 1 - cx)):
                    c.SetPixel(x + xoff + cx, top + ry, color.red, color.green, color.blue)
        return g["dw"]


def DrawText(canvas, font, x, y, color, text):
    start = x
    for ch in text:
        x += font.DrawGlyph(canvas, x, y, color, ord(ch))
    return x - start


def DrawLine(canvas, x1, y1, x2, y2, color):
    dx, dy = abs(x2 - x1), -abs(y2 - y1)
    sx = 1 if x1 < x2 else -1
    sy = 1 if y1 < y2 else -1
    err = dx + dy
    while True:
        canvas.SetPixel(x1, y1, color.red, color.green, color.blue)
        if x1 == x2 and y1 == y2:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x1 += sx
        if e2 <= dx:
            err += dx
            y1 += sy


def DrawCircle(canvas, x0, y0, r, color):
    x, y, err = r, 0, 1 - r
    while x >= y:
        for px, py in ((x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)):
            canvas.SetPixel(x0 + px, y0 + py, color.red, color.green, color.blue)
        y += 1
        if err < 0:
            err += 2 * y + 1
        else:
            x -= 1
            err += 2 * (y - x) + 1
