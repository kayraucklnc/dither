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
import { find as findExtension } from "@/lib/extensions/registry";
import { floydSteinberg, grayPalette, paletteFromCodes } from "./dither";
import { COLUMNS, ROWS, pixelsFor, type Size } from "@/lib/shapes";
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
): Promise<string> {
  const digests: Record<string, string> = {};

  for (const widget of widgets) {
    if (digests[widget.extension]) continue;
    digests[widget.extension] = (await findExtension(widget.extension))?.digest ?? "missing";
  }

  const material = JSON.stringify({
    panel,
    design: await frameworkDigest(),
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
): Promise<Rendered> {
  const { html, problems } = await compose(
    widgets,
    panel.width,
    panel.height,
    notices,
    await environment(),
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
    fingerprint: await fingerprint(widgets, panel, notices),
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
    fingerprint: await fingerprint([widget], { ...panel, width, height }, notices),
    problems,
  };
}
