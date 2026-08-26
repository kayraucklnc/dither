/* Animated ordered-dither backdrop for the auth screens.
 *
 * The product renders 1-bit frames to e-ink, so the sign-in page shows the same
 * process it exists to drive: a smooth continuous field, quantised to pure
 * ink-or-paper through an 8x8 Bayer threshold matrix.
 *
 * The canvas is kept at one pixel per dither cell and blown up by CSS with
 * `image-rendering: pixelated`, which is both faithful to the technique and the
 * reason this stays cheap — a full-screen backdrop is ~20k pixels, not 2M.
 */

const CELL = 5; // Displayed size, in CSS pixels, of one dither cell.
const FPS = 24; // e-ink cadence. Also keeps the main thread mostly idle.
const MAX_CELLS = 44_000; // Ceiling for very large displays.

// Bayer 8x8, normalised to (0, 1). Standard recursive construction.
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
].map(row => row.map(value => (value + 0.5) / 64));

// Interference of three drifting plane waves plus a slow breathing radial. No
// noise texture, no randomness: the pattern is reproducible and seam-free.
// Returns roughly (0, 1), concentrated around the middle.
function field(x, y, time) {
  const wave = Math.sin(x * 0.031 + time * 0.5) +
               Math.sin(y * 0.043 - time * 0.34) +
               Math.sin((x + y) * 0.024 + time * 0.71) +
               Math.sin(Math.hypot(x * 0.9 - 18, y - 30) * 0.048 - time * 0.6);

  // Expanding around the midpoint drives most of the field to solid ink or
  // solid paper. Without it the value loiters near 0.5, where ordered dithering
  // degenerates into an even checker that reads as television static.
  const expanded = 0.46 + (wave / 4) * 1.45;

  return expanded < 0 ? 0 : expanded > 1 ? 1 : expanded;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

class DitherBackdrop {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.mask = document.createElement("canvas");
    this.maskContext = this.mask.getContext("2d");
    this.frame = null;
    this.lastDrawnAt = 0;
    this.columns = 0;
    this.rows = 0;
    this.ink = null;
  }

  // getComputedStyle forces a style flush, so the ink colour is resolved on
  // mount and on theme change rather than on every one of the 24 frames.
  refreshInk() {
    this.ink = getComputedStyle(this.canvas).color;
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return false;

    let columns = Math.max(8, Math.ceil(bounds.width / CELL));
    let rows = Math.max(8, Math.ceil(bounds.height / CELL));

    // Coarsen rather than drop frames when the viewport is enormous.
    const scale = Math.sqrt(MAX_CELLS / (columns * rows));
    if (scale < 1) {
      columns = Math.max(8, Math.floor(columns * scale));
      rows = Math.max(8, Math.floor(rows * scale));
    }

    if (this.ink === null) this.refreshInk();
    if (columns === this.columns && rows === this.rows) return true;

    this.columns = columns;
    this.rows = rows;
    this.canvas.width = this.mask.width = columns;
    this.canvas.height = this.mask.height = rows;
    this.image = this.maskContext.createImageData(columns, rows);

    return true;
  }

  // Density thins out towards the bottom of the panel, so the pattern dissolves
  // into flat ink exactly where the headline sits.
  falloff(row) {
    const t = row / (this.rows - 1);

    return 1 - t * t * 0.65;
  }

  render(time) {
    const { data } = this.image;

    for (let row = 0; row < this.rows; row++) {
      const thresholds = BAYER[row & 7];
      const taper = this.falloff(row);

      for (let column = 0; column < this.columns; column++) {
        const value = field(column, row, time) * taper;
        const index = (row * this.columns + column) * 4;
        const on = value > thresholds[column & 7];

        data[index] = data[index + 1] = data[index + 2] = 255;
        data[index + 3] = on ? 255 : 0;
      }
    }

    this.maskContext.putImageData(this.image, 0, 0);

    // putImageData ignores compositing, hence the mask hop: stamp the 1-bit
    // shape, then flood it with the theme's ink colour through `source-in`.
    const context = this.context;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, this.columns, this.rows);
    context.drawImage(this.mask, 0, 0);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = this.ink;
    context.fillRect(0, 0, this.columns, this.rows);
  }

  tick = timestamp => {
    this.frame = requestAnimationFrame(this.tick);

    if (timestamp - this.lastDrawnAt < 1000 / FPS) return;
    this.lastDrawnAt = timestamp;

    if (this.resize()) this.render(timestamp / 1000);
  };

  start() {
    if (this.frame !== null) return;

    if (reducedMotion()) {
      if (this.resize()) this.render(0);
      return;
    }

    this.frame = requestAnimationFrame(this.tick);
  }

  stop() {
    if (this.frame === null) return;

    cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

function mount() {
  const canvas = document.querySelector(".site-dither");
  if (!canvas || canvas.dataset.mounted === "true") return;

  canvas.dataset.mounted = "true";

  const backdrop = new DitherBackdrop(canvas);
  backdrop.start();

  // A background animation nobody can see is pure battery drain.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) backdrop.stop();
    else backdrop.start();
  });

  window.addEventListener("resize", () => {
    if (backdrop.frame === null && backdrop.resize()) backdrop.render(0);
  });

  // Theme flips change the ink colour. The cache has to be dropped either way,
  // and a paused (reduced-motion) backdrop additionally needs a repaint.
  const retheme = () => {
    backdrop.refreshInk();
    if (backdrop.frame === null && backdrop.resize()) backdrop.render(0);
  };

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", retheme);

  // The in-page toggle writes data-theme rather than touching the media query.
  new MutationObserver(retheme).observe(document.documentElement, {
    attributeFilter: ["data-theme"]
  });
}

document.addEventListener("DOMContentLoaded", mount);
