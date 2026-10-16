// The moon as the panel shows it, drawn when a project compiles: NASA's map
// of the near side wrapped on a sphere, lit from where the sun is at that
// phase, with the night side left in a faint earthshine so the whole disc
// still reads. Dithered once, so every bucket of the month is one bitmap.

import { dither } from "@/compiler/dither";
import { TEXTURE, TEXTURE_SIZE } from "./texture";

let surface: Uint8Array | null = null;
function texture(): Uint8Array {
  if (surface) return surface;
  const raw = atob(TEXTURE);
  surface = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  return surface;
}

/** The surface at (u, v) on the disc, −1 … 1 right and up: 0 dark … 1 bright, bilinear. */
function albedo(u: number, v: number): number {
  const t = texture();
  const n = TEXTURE_SIZE;
  const fx = Math.min(n - 1, Math.max(0, ((u + 1) / 2) * n - 0.5));
  const fy = Math.min(n - 1, Math.max(0, ((1 - v) / 2) * n - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
  const ax = fx - x0, ay = fy - y0;
  const top = t[y0 * n + x0] * (1 - ax) + t[y0 * n + x1] * ax;
  const bottom = t[y1 * n + x0] * (1 - ax) + t[y1 * n + x1] * ax;
  return (top * (1 - ay) + bottom * ay) / 255;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };

/** How light the night side is: enough dots to show the disc and its seas. */
const EARTHSHINE = 0.07;
/** The map's 5th and 95th percentiles inside the disc: the darkest sea and the brightest highland. */
const DARKEST = 49 / 255;
const BRIGHTEST = 158 / 255;

/**
 * One moon, `size` pixels across, at phase `angle` (0 new, 90 first quarter,
 * 180 full), as greyscale 0 black … 255 white with the sky white around it.
 * `south` turns it as it is seen from the southern hemisphere.
 */
export function moonGrey(size: number, angle: number, south: boolean): Float32Array {
  const grey = new Float32Array(size * size).fill(255);
  const r = size / 2;
  const sx = Math.sin((angle * Math.PI) / 180);
  const sz = -Math.cos((angle * Math.PI) / 180);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px + 0.5 - r, dy = py + 0.5 - r;
      const dist = Math.hypot(dx, dy);
      if (dist > r) continue;
      // Seen from the south the sky turns over: right is left, up is down.
      const u = (south ? -dx : dx) / r, v = (south ? dy : -dy) / r;
      const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      // The map's seas and highlands, stretched so both survive dithering.
      const a = clamp((albedo(u, v) - DARKEST) / (BRIGHTEST - DARKEST));
      const height = u * sx + z * sz; // the sun's height there, −1 … 1
      // Where the sun is up, softened across the terminator as the real one is by the mountains.
      const sun = smooth((height + 0.02) / 0.16);
      // A low sun lights the ground dimly; a high one, as at full moon, flattens it.
      const day = (0.36 + 0.68 * a ** 0.9) * (0.55 + 0.45 * smooth(height / 0.35)) * (0.9 + 0.1 * Math.sqrt(z));
      const night = EARTHSHINE * (0.6 + 0.8 * a);
      let light = night + (day - night) * sun;
      // The limb, a little darker, so a full moon still has an edge on white paper.
      if (r - dist < 1.5) light *= 0.55;
      grey[py * size + px] = light * 255;
    }
  }
  return grey;
}

const cache = new Map<string, Uint8Array>();

/** The dithered moon: `ink(x, y)` for `Draw.bitmap`. */
export function moonInk(size: number, angle: number, south: boolean): (x: number, y: number) => boolean {
  const key = `${size}:${angle}:${south}`;
  let ink = cache.get(key);
  if (!ink) {
    ink = dither(moonGrey(size, angle, south), size, size, "floyd");
    cache.set(key, ink);
  }
  const bits = ink;
  return (x, y) => bits[y * size + x] === 1;
}
