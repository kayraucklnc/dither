/**
 * Floyd-Steinberg error diffusion.
 *
 * E-ink panels have two colours, sometimes four, occasionally a small palette.
 * Simply thresholding a greyscale render at 50% turns every photograph and
 * every anti-aliased glyph edge into a hard blob. Diffusing the rounding error
 * into neighbouring pixels instead trades spatial resolution for apparent
 * tonal resolution, which is what makes a 1-bit panel able to show a weather
 * icon at all.
 *
 * Written here rather than shelled out to ImageMagick so the server needs no
 * external binary, the result is identical on every machine, and this can be
 * tested.
 */

export interface Palette {
  /** Candidate output colours as [r, g, b]. */
  colors: [number, number, number][];
}

/** Evenly spaced grey levels, which is what a monochrome panel wants. */
export function grayPalette(levels: number): Palette {
  const count = Math.max(2, levels);
  const step = 255 / (count - 1);

  return {
    colors: Array.from({ length: count }, (_, index) => {
      const value = Math.round(index * step);
      return [value, value, value] as [number, number, number];
    }),
  };
}

export function paletteFromCodes(codes: string[]): Palette {
  const colors = codes
    .map((code) => /^#?([0-9a-f]{6})$/i.exec(code.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => {
      const hex = match[1];
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ] as [number, number, number];
    });

  return { colors: colors.length ? colors : grayPalette(2).colors };
}

function nearest(palette: Palette, r: number, g: number, b: number): [number, number, number] {
  let best = palette.colors[0];
  let bestDistance = Infinity;

  for (const color of palette.colors) {
    // Squared euclidean distance; the square root would not change the ranking.
    const distance =
      (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }

  return best;
}

/**
 * Dither an RGB(A) buffer in place-ish, returning a new RGB buffer.
 *
 * The working copy is float, not uint8: accumulated error routinely pushes a
 * pixel below 0 or above 255, and clamping at every step - which is what
 * happens if the buffer stays integer - loses exactly the information the
 * algorithm exists to carry.
 */
export function floydSteinberg(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
  palette: Palette,
): Buffer {
  const working = new Float32Array(width * height * 3);

  for (let index = 0, source = 0; index < width * height; index += 1, source += channels) {
    working[index * 3] = data[source];
    working[index * 3 + 1] = data[source + 1];
    working[index * 3 + 2] = data[source + 2];
  }

  const output = Buffer.allocUnsafe(width * height * 3);

  const spread = (x: number, y: number, error: number[], factor: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const at = (y * width + x) * 3;
    working[at] += error[0] * factor;
    working[at + 1] += error[1] * factor;
    working[at + 2] += error[2] * factor;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3;
      const old = [working[at], working[at + 1], working[at + 2]];
      const next = nearest(palette, old[0], old[1], old[2]);

      output[at] = next[0];
      output[at + 1] = next[1];
      output[at + 2] = next[2];

      const error = [old[0] - next[0], old[1] - next[1], old[2] - next[2]];

      spread(x + 1, y, error, 7 / 16);
      spread(x - 1, y + 1, error, 3 / 16);
      spread(x, y + 1, error, 5 / 16);
      spread(x + 1, y + 1, error, 1 / 16);
    }
  }

  return output;
}
