// An even grey for 1-bit pictures drawn when the project compiles.

/** An 8 × 8 ordered dither: a shade from 0 to 1 as a pattern of pixels that stays even. */
export const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

/** Whether the pixel at (px, py) is inked for a shade `level` from 0 (white) to 1 (black). */
export const shade = (px: number, py: number, level: number) => level > BAYER[(py & 7) * 8 + (px & 7)];
