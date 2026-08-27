import sharp from "sharp";

import { resolve, type Picture } from "./library";

/**
 * A photograph, turned into something a one-bit panel can carry.
 *
 * Two decisions live here, and both are the opposite of what you would do for
 * a screen with pixels to spare.
 *
 * **It is not dithered.** The render pipeline already ends in Floyd-Steinberg
 * over the whole panel, and an image dithered here would be dithered twice:
 * once into a stipple, then again after the browser has resampled that stipple
 * to fit a box, which is how you get moire. So what comes out of here is
 * *grey* - as many levels as the source has - and the panel's own dither is
 * left to be the only one. It is the same rule the rest of this codebase
 * follows for gradients, applied to a photograph.
 *
 * **It is cropped to the widget, not to the panel.** Sizes are free: the same
 * picture might be a full-bleed wallpaper at 12x12 and a 2x12 strip down the
 * side of a screen, and those want different rectangles out of the original,
 * not the same rectangle squashed. Cropping is done here, at render time,
 * because this is the first point at which anything knows how big the box is.
 */

export type Fit = "fill" | "whole";

/** What to do to the tones on the way. Contrast is the only lever 1 bit has. */
export const TONES: Record<string, { gamma: number; contrast: number }> = {
  as_is: { gamma: 1, contrast: 1 },
  // A photograph that dithers to mud is nearly always too dark for the medium:
  // the panel's paper is brighter than any screen's white and its ink is not
  // as black as any screen's black, so the mid tones need lifting into it.
  lift: { gamma: 1.35, contrast: 1.05 },
  deepen: { gamma: 0.85, contrast: 1.45 },
  flatten: { gamma: 1, contrast: 0.7 },
};

export interface Look {
  width: number;
  height: number;
  fit: Fit;
  tone: string;
  invert: boolean;
}

export interface Prepared {
  /** A data URI. Inlined because a screenshotted page has no origin to resolve against. */
  source: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Prepared images, keyed by everything that changes one.
 *
 * Small on purpose. A screen holds a handful of widgets, each asks for one
 * picture at one size, and the render above this is itself cached by
 * fingerprint - so this exists to stop the *editor* re-encoding the same
 * photograph on every keystroke, not to hold a library in memory.
 */
const CACHE_LIMIT = 24;
const cache = new Map<string, Prepared>();

function remember(key: string, prepared: Prepared): Prepared {
  cache.set(key, prepared);
  // Insertion-ordered, so the oldest key is the first one out.
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return prepared;
}

const PANEL = { width: 800, height: 480 };

/**
 * Sane pixels out of whatever the caller had.
 *
 * `shape.width` is zero wherever a template is rendered without a panel behind
 * it - a unit test, mostly - and a resize to zero throws. Falling back to the
 * panel keeps a template that forgot to pass its box drawing something.
 */
function boxOf(look: Look): { width: number; height: number } {
  return {
    width: Math.round(Math.max(16, Math.min(2048, look.width || PANEL.width))),
    height: Math.round(Math.max(16, Math.min(2048, look.height || PANEL.height))),
  };
}

export async function prepare(picture: Picture, look: Look): Promise<Prepared> {
  const box = boxOf(look);
  const key = [
    picture.file,
    picture.modifiedAt,
    box.width,
    box.height,
    look.fit,
    look.tone,
    look.invert,
  ].join("|");

  const held = cache.get(key);
  if (held) return held;

  const tone = TONES[look.tone] ?? TONES.as_is;

  /**
   * Pixel art is enlarged by repeating pixels, never by interpolating them.
   *
   * A 524-pixel-wide pixel drawing on an 800-pixel panel has to grow, and
   * Lanczos grows it into a blur - which then dithers into mush, because the
   * error diffusion has nothing but soft edges to work with. Nearest keeps the
   * blocks, and blocks are what this aesthetic is made of. Only ever on the way
   * *up*, and only by a clear margin, so a photograph that happens to be a
   * little small is still resampled properly.
   */
  const source = await sharp(picture.file).metadata();
  const enlarging =
    (source.width ?? 0) * 1.4 < box.width && (source.height ?? 0) * 1.4 < box.height;

  let pipeline = sharp(picture.file, { animated: false })
    // Phones write the orientation in EXIF rather than in the pixels, so a
    // holiday photograph arrives on its side unless this is asked for.
    .rotate()
    .resize({
      width: box.width,
      height: box.height,
      fit: look.fit === "whole" ? "contain" : "cover",
      // Where a rectangle has to be thrown away, throw away the boring part.
      // A widescreen crop of a portrait photograph taken through the middle
      // is a waistcoat; taken through where the detail is, it is a portrait.
      position: look.fit === "whole" ? "centre" : sharp.strategy.attention,
      background: { r: 255, g: 255, b: 255 },
      kernel: enlarging ? "nearest" : "lanczos3",
    })
    .greyscale();

  // Contrast about the mid point, not about zero: `linear(m, c)` with c chosen
  // so 128 maps to itself, or every increase in contrast is also a darkening
  // and the picture closes up.
  if (tone.contrast !== 1) {
    pipeline = pipeline.linear(tone.contrast, 128 * (1 - tone.contrast));
  }

  // sharp's gamma brightens and will not take a value below one, so darkening
  // is the same curve applied to the negative and turned back over.
  if (tone.gamma > 1) pipeline = pipeline.gamma(tone.gamma);
  if (tone.gamma < 1) pipeline = pipeline.negate().gamma(1 / tone.gamma).negate();

  if (look.invert) pipeline = pipeline.negate();

  // PNG for anything that arrived as PNG, JPEG for everything else. The
  // bundled art is line work and block tone, and a JPEG of it is a picture of
  // ringing artefacts the dither then makes a feature of; a photograph as a
  // palette PNG is four times the bytes for a difference nothing downstream
  // can represent.
  const asPng = /\.png$/i.test(picture.file);

  const encoded = asPng
    ? await pipeline.png({ palette: true, colors: 64, compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await pipeline.jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer({ resolveWithObject: true });

  return remember(key, {
    source: `data:image/${asPng ? "png" : "jpeg"};base64,${encoded.data.toString("base64")}`,
    width: encoded.info.width,
    height: encoded.info.height,
    bytes: encoded.data.length,
  });
}

/**
 * The same, from an id rather than a file - which is what a template has.
 *
 * A template naming a picture that is no longer on disk gets nothing back
 * rather than an exception: a folder someone tidied should leave a gap in a
 * gallery, not take the screen down with it.
 */
export async function prepareById(id: string, look: Look): Promise<Prepared | undefined> {
  const picture = await resolve(id);
  return picture ? prepare(picture, look) : undefined;
}
