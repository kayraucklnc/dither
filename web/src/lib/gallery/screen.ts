/**
 * Turning a photograph into marks.
 *
 * The render pipeline already ends in Floyd-Steinberg over the whole panel, so
 * this is not here to make a picture displayable - it is here because *how* a
 * picture is reduced to one bit is most of how it feels. Error diffusion looks
 * like a photograph. A rotated dot screen looks like newsprint. A Bayer
 * threshold looks like a computer from 1987. The subject does not change and
 * the mood changes completely, and on a display with no colour, no motion and
 * no tints, that is very nearly the whole of the available expression.
 *
 * Every screen here takes one byte per pixel of grey and returns one byte per
 * pixel of nothing but 0 and 255. That matters more than it sounds: an image
 * that is already exactly the panel's two values, placed at exactly its own
 * size, passes through the panel's own dither untouched, because every pixel
 * lands on a palette entry with no error to diffuse. Screen at any other size
 * and the browser resamples the marks back into greys, which then get
 * re-dithered - the moire this codebase warns about everywhere else. So
 * `as_image` is always asked for the exact pixel box, and the designs place
 * what comes back one for one.
 */

export const SCREENS = ["panel", "diffusion", "atkinson", "ordered", "halftone", "noise"] as const;
export type Screen = (typeof SCREENS)[number];

export function isScreen(name: string): name is Screen {
  return (SCREENS as readonly string[]).includes(name);
}

const INK = 0;
const PAPER = 255;

/** A mark this size reads as texture rather than as pixels at panel scale. */
export const DEFAULT_MARKS = 4;

/** Screens whose marks have a size worth choosing. Diffusion has none. */
export const SIZED_SCREENS: readonly Screen[] = ["ordered", "halftone", "noise"];

/**
 * Error diffusion, the honest one.
 *
 * The same kernel the panel uses, applied here so the marks land on the
 * picture's own pixels rather than on whatever the browser resampled them to.
 * Reads as a photograph: fine, even, no texture of its own.
 */
function diffusion(grey: Uint8Array, width: number, height: number): Uint8Array {
  const working = Float32Array.from(grey);
  const out = new Uint8Array(grey.length);

  const spread = (x: number, y: number, error: number, factor: number) => {
    if (x < 0 || x >= width || y >= height) return;
    working[y * width + x] += error * factor;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = y * width + x;
      const old = working[at];
      const next = old < 128 ? INK : PAPER;
      out[at] = next;

      const error = old - next;
      spread(x + 1, y, error, 7 / 16);
      spread(x - 1, y + 1, error, 3 / 16);
      spread(x, y + 1, error, 5 / 16);
      spread(x + 1, y + 1, error, 1 / 16);
    }
  }

  return out;
}

/**
 * Atkinson, which throws away a quarter of the error on purpose.
 *
 * Bill Atkinson's kernel for the original Macintosh passes on only six eighths
 * of what it owes, so highlights blow out to clean paper and shadows fill to
 * clean ink instead of both crawling with texture. It is technically a worse
 * reproduction and it is the reason everything scanned on a Mac in 1987 looks
 * the way it does: crisp, contrasty, a little bit lost in the extremes.
 */
function atkinson(grey: Uint8Array, width: number, height: number): Uint8Array {
  const working = Float32Array.from(grey);
  const out = new Uint8Array(grey.length);

  const spread = (x: number, y: number, share: number) => {
    if (x < 0 || x >= width || y >= height) return;
    working[y * width + x] += share;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = y * width + x;
      const old = working[at];
      const next = old < 128 ? INK : PAPER;
      out[at] = next;

      const share = (old - next) / 8;
      spread(x + 1, y, share);
      spread(x + 2, y, share);
      spread(x - 1, y + 1, share);
      spread(x, y + 1, share);
      spread(x + 1, y + 1, share);
      spread(x, y + 2, share);
    }
  }

  return out;
}

/**
 * The 8x8 Bayer matrix, in its usual recursive order.
 *
 * Built rather than typed out, because the bit-interleaving *is* the
 * definition and a typed-out grid is sixty-four chances to make a typo nobody
 * would ever spot.
 */
function bayer(order: number): Float32Array {
  const side = 1 << order;
  const matrix = new Float32Array(side * side);

  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      let value = 0;

      for (let bit = 0; bit < order; bit += 1) {
        const xBit = (x >> bit) & 1;
        const yBit = (y >> bit) & 1;
        value = (value << 2) | ((xBit ^ yBit) << 1) | yBit;
      }

      matrix[y * side + x] = (value + 0.5) / (side * side);
    }
  }

  return matrix;
}

const BAYER = bayer(3);

/**
 * An ordered threshold, which is a texture rather than a reproduction.
 *
 * Every pixel is compared against a fixed 8x8 pattern, so the marks line up
 * into a visible crosshatch that does not follow the subject at all. That is
 * the appeal: it reads as a screen laid *over* the picture, which is exactly
 * what the dithered pin-board look is made of.
 */
function ordered(grey: Uint8Array, width: number, height: number, marks: number): Uint8Array {
  const out = new Uint8Array(grey.length);
  const size = Math.max(1, marks);

  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / size) % 8;

    for (let x = 0; x < width; x += 1) {
      const at = y * width + x;
      out[at] = grey[at] / 255 > BAYER[row * 8 + (Math.floor(x / size) % 8)] ? PAPER : INK;
    }
  }

  return out;
}

/**
 * A separable box blur, for reading the tone of a region rather than a pixel.
 *
 * The halftone needs to know how dark a whole cell is, and the obvious way -
 * sample the middle of it - is wrong in a way that only shows up on the
 * pictures this is most wanted for. A poster that is already a printed
 * halftone has a middle pixel that is pure black or pure white more or less at
 * random, so every dot comes out full size or absent and the picture turns to
 * confetti. Averaging first is what makes a dot screen a dot screen: it is
 * standing in for a region, so it has to have measured one.
 *
 * Running sums, so the cost is the same whatever the radius.
 */
function blurred(grey: Uint8Array, width: number, height: number, radius: number): Float32Array {
  const span = radius * 2 + 1;
  const across = new Float32Array(grey.length);
  const down = new Float32Array(grey.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let total = 0;

    for (let x = -radius; x <= radius; x += 1) {
      total += grey[row + Math.min(width - 1, Math.max(0, x))];
    }

    for (let x = 0; x < width; x += 1) {
      across[row + x] = total / span;
      total -= grey[row + Math.min(width - 1, Math.max(0, x - radius))];
      total += grey[row + Math.min(width - 1, Math.max(0, x + radius + 1))];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let total = 0;

    for (let y = -radius; y <= radius; y += 1) {
      total += across[Math.min(height - 1, Math.max(0, y)) * width + x];
    }

    for (let y = 0; y < height; y += 1) {
      down[y * width + x] = total / span;
      total -= across[Math.min(height - 1, Math.max(0, y - radius)) * width + x];
      total += across[Math.min(height - 1, Math.max(0, y + radius + 1)) * width + x];
    }
  }

  return down;
}

/**
 * A rotated dot screen, the way ink on paper actually works.
 *
 * The picture is divided into cells on a grid turned to 45 degrees - the angle
 * every printer uses for a single-colour screen, because a grid square to the
 * page reads as a grid and a grid at 45 reads as tone. Each cell gets one dot
 * covering as much of it as that cell is dark, so a light passage is specks and
 * a dark one is dots that have grown until they touch.
 *
 * This is the one screen with a scale of its own, and it is the reason it is
 * worth having: the marks are large enough to see, so a photograph stops
 * looking like a photograph and starts looking like something printed.
 */
/**
 * How far from the middle of a cell you have to go to ink a given fraction of
 * it.
 *
 * The obvious formula - area of a circle, so radius proportional to the root
 * of the tone - is wrong at both ends, and wrong enough to see. Near the dark
 * end a circle cannot fill a square, so a solid black band prints as 92% black
 * with a sparkle of paper in the corners; and if the radius is enlarged until
 * it can, every mid tone is inked past where it should be and the whole
 * picture goes muddy. Both were visible on a photograph before they were
 * measured.
 *
 * So the relationship is not derived, it is counted: sample the cell densely,
 * sort those samples by distance from the middle, and read off the distance at
 * which the wanted fraction of them have been passed. Coverage is then exactly
 * linear in tone by construction, black is black, and the dots are still round
 * where round is possible - they simply grow into the corners as they merge,
 * which is what ink does.
 */
const LEVELS = 256;
const tables = new Map<number, Float32Array>();

function dotTable(cell: number): Float32Array {
  const held = tables.get(cell);
  if (held) return held;

  const grid = 64;
  const distances = new Float64Array(grid * grid);

  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const acrossOfCentre = ((x + 0.5) / grid - 0.5) * cell;
      const downOfCentre = ((y + 0.5) / grid - 0.5) * cell;
      distances[y * grid + x] = Math.hypot(acrossOfCentre, downOfCentre);
    }
  }

  distances.sort();

  const table = new Float32Array(LEVELS + 1);
  for (let level = 0; level <= LEVELS; level += 1) {
    const passed = Math.round((level / LEVELS) * distances.length);
    // Nothing inked at all is a negative radius, so no pixel can be inside it.
    table[level] = passed <= 0 ? -1 : distances[Math.min(distances.length - 1, passed - 1)];
  }

  // Full ink means the whole cell, and the samples never quite reach its
  // corners - they are the middles of little squares, so the furthest one sits
  // a fraction inside the true corner. Left as counted, a solid black band
  // prints with four specks of paper per cell. The last entry is therefore
  // pinned past the half-diagonal rather than measured.
  table[LEVELS] = cell;

  tables.set(cell, table);
  return table;
}

function halftone(grey: Uint8Array, width: number, height: number, cell: number): Uint8Array {
  const out = new Uint8Array(grey.length);
  const tone = blurred(grey, width, height, Math.max(1, Math.round(cell / 2)));
  const table = dotTable(cell);

  const angle = Math.PI / 4;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Into the turned grid, to find which cell this pixel belongs to.
      const u = x * cosine + y * sine;
      const v = -x * sine + y * cosine;

      const centreU = (Math.floor(u / cell) + 0.5) * cell;
      const centreV = (Math.floor(v / cell) + 0.5) * cell;

      // And back out of it, to read the tone this dot is standing in for.
      // Clamped rather than treated as paper: a cell whose middle falls just
      // off the edge still overlaps the picture, and calling it white leaves a
      // rim of missing dots all the way round.
      const sampleX = Math.min(width - 1, Math.max(0, Math.round(centreU * cosine - centreV * sine)));
      const sampleY = Math.min(height - 1, Math.max(0, Math.round(centreU * sine + centreV * cosine)));

      const ink = 1 - tone[sampleY * width + sampleX] / 255;
      const radius = table[Math.round(Math.max(0, Math.min(1, ink)) * LEVELS)];
      const distance = Math.hypot(u - centreU, v - centreV);

      out[y * width + x] = distance <= radius ? INK : PAPER;
    }
  }

  return out;
}

/**
 * A random threshold, which is a photocopy of a photocopy.
 *
 * Seeded from the pixel's own coordinates rather than from a generator, so the
 * grain is a property of the picture and not of when it happened to be
 * rendered - a render cached by its inputs must not change when it is redrawn.
 */
function noise(grey: Uint8Array, width: number, height: number, marks: number): Uint8Array {
  const out = new Uint8Array(grey.length);
  const size = Math.max(1, marks);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const blockX = Math.floor(x / size);
      const blockY = Math.floor(y / size);

      let hash = Math.imul(blockX + 1, 0x27d4eb2d) ^ Math.imul(blockY + 1, 0x165667b1);
      hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491);
      const threshold = ((hash >>> 8) & 0xffff) / 0xffff;

      const at = y * width + x;
      out[at] = grey[at] / 255 > threshold ? PAPER : INK;
    }
  }

  return out;
}

/**
 * Apply a screen. `panel` returns the grey untouched, which leaves the
 * reduction to the pipeline's own dither over the finished page.
 */
export function screened(
  grey: Uint8Array,
  width: number,
  height: number,
  screen: Screen,
  /**
   * How many panel pixels one mark covers.
   *
   * Meaningless for the two diffusion screens, which are per-pixel by
   * definition - the settings form hides it for them rather than offering a
   * control that does nothing.
   */
  marks = DEFAULT_MARKS,
): Uint8Array {
  const size = Math.max(1, Math.min(12, Math.round(marks) || DEFAULT_MARKS));

  switch (screen) {
    case "diffusion":
      return diffusion(grey, width, height);
    case "atkinson":
      return atkinson(grey, width, height);
    case "ordered":
      return ordered(grey, width, height, size);
    case "halftone":
      return halftone(grey, width, height, Math.max(2, size));
    case "noise":
      return noise(grey, width, height, size);
    default:
      return grey;
  }
}
