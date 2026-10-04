// Greyscale to 1-bit. Pure, so the same picture dithers the same everywhere.

export type DitherMethod = "floyd" | "atkinson" | "threshold";

/** `grey` is 0 (black) … 255 (white), row-major; returns true where ink goes. */
export function dither(grey: Float32Array, w: number, h: number, method: DitherMethod): Uint8Array {
  const g = Float32Array.from(grey);
  const ink = new Uint8Array(w * h);
  const spread = (x: number, y: number, e: number) => {
    if (x >= 0 && x < w && y < h) g[y * w + x] += e;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = g[i];
      const black = old < 128;
      ink[i] = black ? 1 : 0;
      const err = old - (black ? 0 : 255);
      if (method === "floyd") {
        spread(x + 1, y, (err * 7) / 16);
        spread(x - 1, y + 1, (err * 3) / 16);
        spread(x, y + 1, (err * 5) / 16);
        spread(x + 1, y + 1, err / 16);
      } else if (method === "atkinson") {
        const e = err / 8;
        spread(x + 1, y, e); spread(x + 2, y, e);
        spread(x - 1, y + 1, e); spread(x, y + 1, e); spread(x + 1, y + 1, e);
        spread(x, y + 2, e);
      }
    }
  }
  return ink;
}

/** Brightness and contrast, each -100 … 100, applied to greyscale in place. */
export function adjust(grey: Float32Array, brightness: number, contrast: number): void {
  const c = (100 + contrast) / 100;
  const b = brightness * 1.28;
  for (let i = 0; i < grey.length; i++) grey[i] = Math.max(0, Math.min(255, (grey[i] - 128) * c + 128 + b));
}
