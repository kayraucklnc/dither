import sharp from "sharp";

import { resolve, type Picture } from "./library";
import { DEFAULT_MARKS, isScreen, screened, type Screen } from "./screen";

/**
 * A photograph, turned into something a one-bit panel can carry.
 *
 * Three decisions live here, and each is the opposite of what you would do for
 * a screen with pixels to spare.
 *
 * **It is cropped to the widget, not to the panel.** Sizes are free: the same
 * picture might be a full-bleed wallpaper at 12x12 and a 2x12 strip down the
 * side of a screen, and those want different rectangles out of the original,
 * not the same rectangle squashed. Cropping is done here, at render time,
 * because this is the first point at which anything knows how big the box is.
 *
 * **The tones are moved before anything else happens.** A one-bit display has
 * no tint, so contrast is not a finishing touch - it is the only control over
 * how much of the picture survives at all. The panel's paper is brighter and
 * its ink weaker than any screen's, so a photograph that looked right on a
 * phone is usually too dark and too flat for it.
 *
 * **It may or may not be reduced to one bit here.** By default it is not: the
 * render pipeline ends in Floyd-Steinberg over the whole page and doing it
 * twice, either side of a resample, is moire. But a *chosen* screen - a dot
 * screen, an ordered threshold - has to be applied to the picture's own pixels
 * or it is not that screen any more, so when one is asked for the result comes
 * back already at the panel's two values. That is safe precisely because the
 * crop is the exact size of the box: every pixel lands on a palette entry, the
 * page dither has no error to diffuse, and the marks arrive intact.
 */

export type Fit = "fill" | "whole";

/**
 * Where to keep, when a rectangle has to be thrown away.
 *
 * `auto` finds the busiest region, which is right far more often than not - it
 * is what turns a portrait photograph into a widescreen portrait rather than a
 * widescreen waistcoat. It is also the one that can be surprising, because
 * "busiest" is not "the subject": on a poster it will find the type. So the
 * plain compass points are here to be overruled with.
 */
export const FOCUS: Record<string, string | number> = {
  auto: sharp.strategy.attention,
  centre: "centre",
  top: "north",
  bottom: "south",
  left: "west",
  right: "east",
};

export interface Look {
  width: number;
  height: number;
  fit: Fit;
  /** A key of FOCUS. */
  focus: string;
  /** -100 to 100, zero being the picture as it is. */
  brightness: number;
  contrast: number;
  screen: Screen;
  /** How many panel pixels one mark of the screen covers. */
  marks: number;
  invert: boolean;
}

export const DEFAULT_LOOK: Look = {
  width: 0,
  height: 0,
  fit: "fill",
  focus: "auto",
  brightness: 0,
  contrast: 0,
  screen: "panel",
  marks: DEFAULT_MARKS,
  invert: false,
};

export interface Prepared {
  /** A data URI. Inlined because a screenshotted page has no origin to resolve against. */
  source: string;
  width: number;
  height: number;
  bytes: number;
  /** True when this is already black and white, and the page dither is a no-op over it. */
  reduced: boolean;
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

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Number.isFinite(value) ? value : 0));

/**
 * Brightness and contrast as one straight line through the tones.
 *
 * Contrast pivots on mid grey rather than on black, or every increase in
 * contrast is also a darkening and the picture closes up. The curve is the
 * usual photographic one, which is steep near the ends of the range - the
 * difference between 90 and 100 is far more than between 0 and 10, and it
 * should be, because that end is where a photograph becomes a graphic.
 */
function levels(brightness: number, contrast: number): { slope: number; offset: number } {
  const c = clamp(contrast, -100, 100) * 1.28;
  const slope = (259 * (c + 255)) / (255 * (259 - c));
  const lift = clamp(brightness, -100, 100) * 1.28;

  return { slope, offset: 128 - 128 * slope + lift };
}

export async function prepare(picture: Picture, look: Look): Promise<Prepared> {
  const box = boxOf(look);
  const screen: Screen = isScreen(look.screen) ? look.screen : "panel";

  const key = [
    picture.file,
    picture.modifiedAt,
    box.width,
    box.height,
    look.fit,
    look.focus,
    look.brightness,
    look.contrast,
    screen,
    look.marks,
    look.invert,
  ].join("|");

  const held = cache.get(key);
  if (held) return held;

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

  const { slope, offset } = levels(look.brightness, look.contrast);

  let pipeline = sharp(picture.file, { animated: false })
    // Phones write the orientation in EXIF rather than in the pixels, so a
    // holiday photograph arrives on its side unless this is asked for.
    .rotate()
    .resize({
      width: box.width,
      height: box.height,
      fit: look.fit === "whole" ? "contain" : "cover",
      position: look.fit === "whole" ? "centre" : (FOCUS[look.focus] ?? FOCUS.auto),
      background: { r: 255, g: 255, b: 255 },
      kernel: enlarging ? "nearest" : "lanczos3",
    })
    .greyscale();

  if (slope !== 1 || offset !== 0) pipeline = pipeline.linear(slope, offset);
  if (look.invert) pipeline = pipeline.negate();

  if (screen === "panel") {
    /**
     * PNG for anything that arrived as PNG, JPEG for everything else.
     *
     * Line work and block tone as a JPEG is a picture of ringing artefacts
     * that the page dither then makes a feature of; a photograph as a palette
     * PNG is four times the bytes for a difference nothing downstream can
     * represent.
     */
    const asPng = /\.png$/i.test(picture.file);

    const encoded = asPng
      ? await pipeline
          .png({ palette: true, colors: 64, compressionLevel: 9 })
          .toBuffer({ resolveWithObject: true })
      : await pipeline
          .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
          .toBuffer({ resolveWithObject: true });

    return remember(key, {
      source: `data:image/${asPng ? "png" : "jpeg"};base64,${encoded.data.toString("base64")}`,
      width: encoded.info.width,
      height: encoded.info.height,
      bytes: encoded.data.length,
      reduced: false,
    });
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const reduced = screened(
    new Uint8Array(data.buffer, data.byteOffset, data.length),
    info.width,
    info.height,
    screen,
    look.marks,
  );

  const encoded = await sharp(Buffer.from(reduced), {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    // Two colours in, two colours out: a bilevel PNG of a whole panel is a few
    // kilobytes, where the same marks as greyscale would be a hundred.
    .png({ palette: true, colors: 2, compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });

  return remember(key, {
    source: `data:image/png;base64,${encoded.data.toString("base64")}`,
    width: encoded.info.width,
    height: encoded.info.height,
    bytes: encoded.data.length,
    reduced: true,
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
