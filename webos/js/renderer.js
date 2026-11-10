/* LED matrix renderer: draws a Framebuffer as round glowing dots on a canvas.
 * Only changed cells are repainted. computeGrid() is pure and unit tested. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  var TARGET_COLS = 192;

  /* Grid from window size: ~192 columns, integer cell size (>= 4 px). */
  function computeGrid(width, height, targetCols) {
    var cell = Math.max(4, Math.round(width / (targetCols || TARGET_COLS)));
    return { cell: cell, cols: Math.max(8, Math.floor(width / cell)), rows: Math.max(8, Math.floor(height / cell)) };
  }

  /* Per-pixel coverage of one LED cell: core (solid dot, anti-aliased edge) and halo (soft glow). */
  function buildMasks(cell) {
    var core = new Uint8Array(cell * cell), halo = new Uint8Array(cell * cell);
    var rc = 0.40, soft = 0.07;
    for (var y = 0; y < cell; y++) {
      for (var x = 0; x < cell; x++) {
        var dx = (x + 0.5) / cell - 0.5, dy = (y + 0.5) / cell - 0.5, d = Math.sqrt(dx * dx + dy * dy);
        var c = d <= rc - soft ? 1 : d >= rc ? 0 : (rc - d) / soft;
        var hl = d <= rc ? 0 : Math.max(0, 1 - (d - rc) / 0.28);
        core[y * cell + x] = Math.round(c * 255);
        halo[y * cell + x] = Math.round(hl * hl * 70);
      }
    }
    return { core: core, halo: halo };
  }

  function Renderer(canvas, FB, targetCols) {
    this.canvas = canvas;
    this.FB = FB;
    this.targetCols = targetCols || TARGET_COLS;
    this.g2d = canvas.getContext('2d');
    this.fb = new FB.Framebuffer(1, 1);
    this.layout(window.innerWidth, window.innerHeight);
    this.running = false;
    this.lastMs = 0;
  }

  Renderer.prototype.layout = function (width, height) {
    var grid = computeGrid(width, height, this.targetCols);
    this.grid = grid;
    this.canvas.width = grid.cols * grid.cell;
    this.canvas.height = grid.rows * grid.cell;
    this.fb.resize(grid.cols, grid.rows);
    this.masks = buildMasks(grid.cell);
    this.img = this.g2d.createImageData(this.canvas.width, this.canvas.height);
    this.px = new Uint32Array(this.img.data.buffer);
    this.prev = new Uint32Array(grid.cols * grid.rows).fill(0xffffffff); // force full repaint
    this.dirty = true;
  };

  Renderer.prototype.markDirty = function () { this.dirty = true; };

  var BG = [5, 5, 9], OFF = [20, 20, 29];

  Renderer.prototype.render = function () {
    var t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    var cell = this.grid.cell, cols = this.grid.cols, rows = this.grid.rows, W = cols * cell;
    var data = this.fb.data, prev = this.prev, px = this.px, core = this.masks.core, halo = this.masks.halo;
    var minX = cols, minY = rows, maxX = -1, maxY = -1;
    for (var cy = 0; cy < rows; cy++) {
      for (var cx = 0; cx < cols; cx++) {
        var i = cy * cols + cx, c = data[i];
        if (c === prev[i]) continue;
        prev[i] = c;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        var lit = c !== 0;
        var r = lit ? (c >> 16) & 255 : OFF[0], gg = lit ? (c >> 8) & 255 : OFF[1], b = lit ? c & 255 : OFF[2];
        var base = cy * cell * W + cx * cell;
        for (var y = 0; y < cell; y++) {
          var row = base + y * W, mrow = y * cell;
          for (var x = 0; x < cell; x++) {
            var m = core[mrow + x], hl = lit ? halo[mrow + x] : 0;
            var or = BG[0] + (((r - BG[0]) * m) >> 8) + ((r * hl) >> 8);
            var og = BG[1] + (((gg - BG[1]) * m) >> 8) + ((gg * hl) >> 8);
            var ob = BG[2] + (((b - BG[2]) * m) >> 8) + ((b * hl) >> 8);
            px[row + x] = 0xff000000 | ((ob > 255 ? 255 : ob) << 16) | ((og > 255 ? 255 : og) << 8) | (or > 255 ? 255 : or);
          }
        }
      }
    }
    if (maxX >= 0) {
      this.g2d.putImageData(this.img, 0, 0, minX * cell, minY * cell, (maxX - minX + 1) * cell, (maxY - minY + 1) * cell);
    }
    this.dirty = false;
    if (t0) this.lastMs = performance.now() - t0;
  };

  Renderer.prototype.start = function () {
    var self = this;
    this.running = true;
    function frame() {
      if (!self.running) return;
      self.render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  var api = { computeGrid: computeGrid, buildMasks: buildMasks, Renderer: Renderer, TARGET_COLS: TARGET_COLS };
  E.renderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
