import { createHash } from "node:crypto";
import sharp from "sharp";

import { shoot } from "./browser";
import {
  compose,
  composeEmpty,
  composeSolo,
  frameworkDigest,
  type Notice,
  type PlacedWidget,
} from "./compose";
import { designAt, find as findExtension } from "@/lib/extensions/registry";
import { floydSteinberg, grayPalette, paletteFromCodes } from "./dither";
import { DEFAULT_REFRESH_SECONDS } from "./liquid";
import { COLUMNS, ROWS, pixelsFor, sizeOf, type Size } from "@/lib/shapes";
import { environment } from "@/lib/settings";

/**
 * Compose, screenshot, dither. This is the path a device takes, and the same
 * path a preview takes, so what you see while editing is what gets painted.
 */

export interface Panel {
  width: number;
  height: number;
  bitDepth: number;
  colors: number;
  colorCodes: string[];
  mode: string;
  rotation: number;
}

/**
 * The two things about *when* a render happens that change the picture.
 *
 * Both belong to the device rather than to the screen, and both have to reach
 * the fingerprint as well as the template - a picture that would look
 * different has to hash differently, or the panel keeps the old one.
 */
export interface RenderOptions {
  /** The instant being drawn. Quantised by each design's tick, never used raw. */
  now?: Date;
  /** How long the picture has to last, in seconds. The device's refresh rate. */
  refreshSeconds?: number;
}

/**
 * How often the picture would look different, in seconds, across these widgets.
 *
 * Zero for a screen where nothing draws the clock, which is nearly all of
 * them: those change when their data changes and not otherwise. Where several
 * widgets do draw it, the finest one wins, because the screen is one picture
 * and it is stale as soon as any part of it is.
 */
async function tickOf(widgets: PlacedWidget[]): Promise<number> {
  let finest = 0;

  for (const widget of widgets) {
    const extension = await findExtension(widget.extension);
    if (!extension) continue;

    const design = designAt(extension, sizeOf(widget), widget.design);
    if (!design?.tick) continue;

    finest = finest ? Math.min(finest, design.tick) : design.tick;
  }

  return finest;
}

export interface Rendered {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  fingerprint: string;
  problems: string[];
}

/**
 * The cache key.
 *
 * It has to cover everything that can change the picture and nothing that
 * cannot, or the device is handed a new filename on every wake and redraws for
 * no reason. That is: the panel, each widget's settings, its fetched data, its
 * placement - and the *design*, meaning the extension's templates and the
 * stylesheet they render against. Leaving the design out is the bug where you
 * edit a template, reload, and see the old picture forever.
 */
export async function fingerprint(
  widgets: PlacedWidget[],
  panel: Panel,
  notices: Notice[] = [],
  /**
   * Anything else that changes the picture but is not a widget - the wording
   * of the "nothing set up" panel, for instance. It goes into the hash rather
   * than into a key prefix, because the key is also the image's filename and
   * that has to stay a plain hash.
   */
  extra?: unknown,
  options: RenderOptions = {},
): Promise<string> {
  const digests: Record<string, string> = {};

  for (const widget of widgets) {
    if (digests[widget.extension]) continue;
    digests[widget.extension] = (await findExtension(widget.extension))?.digest ?? "missing";
  }

  /**
   * The clock, to whatever precision the designs on this screen actually draw
   * it - and left out entirely when none of them do.
   *
   * This is what stops a clock freezing. A clock fetches nothing, so its data
   * never changes, so without this its fingerprint never changes either and
   * the device is handed the same picture until somebody edits the screen. It
   * is quantised rather than raw for the opposite reason: a fingerprint that
   * moved every second would hand a new file to a panel that cannot use it,
   * and every one of those is a redraw and a slice of battery.
   */
  const tick = await tickOf(widgets);
  const clock = tick ? Math.floor((options.now ?? new Date()).getTime() / (tick * 1000)) : 0;

  const material = JSON.stringify({
    panel,
    design: await frameworkDigest(),
    tick,
    clock,
    // The refresh rate is drawn, not just obeyed: a face that says how long it
    // is claiming to be right looks different when that window changes.
    refresh: options.refreshSeconds ?? DEFAULT_REFRESH_SECONDS,
    // The locale and offset change what a date renders as, so they belong in
    // the key like any other input to the picture.
    environment: await environment(),
    digests,
    notices,
    extra,
    widgets: widgets
      .map((widget) => ({
        extension: widget.extension,
        settings: widget.settings,
        data: widget.data,
        // The style is a choice, and a different choice is a different
        // picture at the same size - so it belongs in the key.
        design: widget.design ?? "",
        at: [widget.column, widget.row, widget.columnSpan, widget.rowSpan],
      }))
      .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]),
  });

  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

function paletteFor(panel: Panel) {
  if (panel.colorCodes.length) return paletteFromCodes(panel.colorCodes);
  return grayPalette(Math.max(2, 2 ** panel.bitDepth));
}

export async function renderScreen(
  widgets: PlacedWidget[],
  panel: Panel,
  notices: Notice[] = [],
  options: RenderOptions = {},
): Promise<Rendered> {
  const { html, problems } = await compose(
    widgets,
    panel.width,
    panel.height,
    notices,
    await environment(),
    options.refreshSeconds ?? DEFAULT_REFRESH_SECONDS,
  );
  const screenshot = await shoot(html, panel.width, panel.height);

  const rotated = panel.rotation ? sharp(screenshot).rotate(panel.rotation) : sharp(screenshot);
  const { data, info } = await rotated.raw().toBuffer({ resolveWithObject: true });

  const bytes =
    panel.mode === "dither"
      ? await sharp(
          floydSteinberg(data, info.width, info.height, info.channels, paletteFor(panel)),
          { raw: { width: info.width, height: info.height, channels: 3 } },
        )
          // palette: true keeps a two-colour image a two-colour file; without
          // it the PNG is 24-bit RGB and eight times the size for no gain.
          .png({ palette: true, colors: Math.max(2, panel.colors), compressionLevel: 9 })
          .toBuffer()
      : await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
          .png({ compressionLevel: 9 })
          .toBuffer();

  return {
    bytes,
    mimeType: "image/png",
    width: info.width,
    height: info.height,
    fingerprint: await fingerprint(widgets, panel, notices, undefined, options),
    problems,
  };
}

/** The panel a device shows before anyone has set it up. */
export async function renderEmpty(
  panel: Panel,
  heading: string,
  detail: string,
): Promise<Rendered> {
  const { html } = await composeEmpty(panel.width, panel.height, heading, detail);
  const screenshot = await shoot(html, panel.width, panel.height);

  const { data, info } = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true });
  const bytes = await sharp(
    floydSteinberg(data, info.width, info.height, info.channels, paletteFor(panel)),
    { raw: { width: info.width, height: info.height, channels: 3 } },
  )
    .png({ palette: true, colors: Math.max(2, panel.colors), compressionLevel: 9 })
    .toBuffer();

  return {
    bytes,
    mimeType: "image/png",
    width: info.width,
    height: info.height,
    fingerprint: await fingerprint([], panel),
    problems: [],
  };
}

/**
 * Render one widget on its own, at the exact pixel size its shape occupies.
 *
 * This is what the extension catalogue and the widget inspector show. It is
 * deliberately the same Liquid, the same stylesheet and the same dither as a
 * real screen, so a thumbnail is never a flattering approximation of what the
 * panel will do.
 */
export async function renderSolo(
  extensionName: string,
  size: Size,
  settings: Record<string, unknown>,
  data: Record<string, unknown>,
  panel: Panel,
  notices: Notice[] = [],
  design?: string,
  options: RenderOptions = {},
): Promise<Rendered> {
  const widget: PlacedWidget = {
    id: 0,
    extension: extensionName,
    label: extensionName,
    settings,
    data,
    design,
    column: 1,
    row: 1,
    columnSpan: COLUMNS,
    rowSpan: ROWS,
  };

  const [width, height] = pixelsFor(size, panel.width, panel.height);

  // The solo panel *is* the widget's box, so the widget fills the grid and the
  // size it renders at comes from the panel, not from its span.
  const { html, problems } = await composeSolo(
    widget,
    size,
    width,
    height,
    await environment(),
    notices,
    options.refreshSeconds ?? DEFAULT_REFRESH_SECONDS,
  );
  const screenshot = await shoot(html, width, height);

  const { data: raw, info } = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true });

  const bytes =
    panel.mode === "dither"
      ? await sharp(floydSteinberg(raw, info.width, info.height, info.channels, paletteFor(panel)), {
          raw: { width: info.width, height: info.height, channels: 3 },
        })
          .png({ palette: true, colors: Math.max(2, panel.colors), compressionLevel: 9 })
          .toBuffer()
      : await sharp(screenshot).png({ compressionLevel: 9 }).toBuffer();

  return {
    bytes,
    mimeType: "image/png",
    width: info.width,
    height: info.height,
    fingerprint: await fingerprint([widget], { ...panel, width, height }, notices, undefined, options),
    problems,
  };
}
