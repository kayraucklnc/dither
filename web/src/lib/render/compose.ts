import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { find as findExtension } from "@/lib/extensions/registry";
import { COLUMNS, ROWS, shapeForSize } from "@/lib/shapes";
import { renderWidget } from "./liquid";

/**
 * Turn a screen into one HTML document the size of the panel.
 *
 * Each widget is rendered into its own iframe, sized to exactly the pixels its
 * cell occupies. That is not fussiness: extension templates are written as if
 * they own the display, so they use `100vh` and `100vw`. Dropped into a plain
 * grid cell those units still resolve against the whole panel, and a quarter
 * sized clock renders four times too large and bleeds over its neighbours. An
 * iframe gives the extension a real viewport of the size it was promised.
 *
 * It also isolates CSS, so one extension cannot restyle another - which starts
 * mattering the moment extensions come from anywhere but this repository.
 *
 * A widget whose extension has no design for the size it was drawn at is not
 * scaled to fit. It is left as a labelled gap, so the problem is visible in the
 * editor rather than shipping to the display as unreadable type.
 */

export interface PlacedWidget {
  id: number;
  extension: string;
  label: string;
  settings: Record<string, unknown>;
  data: Record<string, unknown>;
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

export interface Composition {
  html: string;
  problems: string[];
}

let stylesheet: string | undefined;
let digest: string | undefined;

/**
 * The stylesheet every extension renders against: the layout and type system,
 * plus the icon set. One string so a template never has to ask for either.
 */
async function framework(): Promise<string> {
  if (stylesheet && process.env.NODE_ENV === "production") return stylesheet;

  const here = path.join(process.cwd(), "src", "lib", "render");
  const [base, icons] = await Promise.all([
    readFile(path.join(here, "screen-framework.css"), "utf8"),
    readFile(path.join(here, "icons.css"), "utf8"),
  ]);

  stylesheet = `${base}\n${icons}`;
  digest = createHash("sha256").update(stylesheet).digest("hex").slice(0, 12);

  return stylesheet;
}

/**
 * A hash of the stylesheet, so a change to the design system invalidates every
 * cached render rather than leaving old pictures on screen.
 */
export async function frameworkDigest(): Promise<string> {
  await framework();
  return digest ?? "none";
}

const escape = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );

function gap(placement: string, message: string): string {
  return `<div class="cell cell--gap" style="${placement}"><p>${escape(message)}</p></div>`;
}

export interface Notice {
  icon: string;
  text: string;
  loud: boolean;
}

/**
 * Which widget hosts the screen's notices.
 *
 * The first one, in reading order, whose extension says its designs have
 * somewhere to put them. One host per screen, so three widgets that all accept
 * notices do not show the same warning three times.
 */
async function noticeHost(widgets: PlacedWidget[]): Promise<number | undefined> {
  const ordered = [...widgets].sort(
    (a, b) => a.row - b.row || a.column - b.column,
  );

  for (const widget of ordered) {
    const extension = await findExtension(widget.extension);
    if (extension?.manifest.accepts_notices) return widget.id;
  }

  return undefined;
}

/**
 * What a panel shows before anyone has set it up.
 *
 * A blank white rectangle is indistinguishable from a broken one, and it is
 * the first thing a new device ever displays. This says what to do instead.
 */
let mark: string | undefined;

export async function composeEmpty(
  width: number,
  height: number,
  heading: string,
  detail: string,
): Promise<Composition> {
  const css = await framework();

  // Inlined, not linked: a rendered page has no origin, so a relative URL
  // cannot resolve.
  mark ??= (await readFile(path.join(process.cwd(), "public", "brand", "mark.svg"), "utf8"))
    .replace("<svg", `<svg width="${Math.round(height / 5)}" height="${Math.round(height / 5)}"`);

  return {
    html: `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{width:${width}px;height:${height}px;overflow:hidden}
.screen{height:${height}px;width:${width}px}</style></head>
<body><div class="screen"><div class="content layout layout--col layout--center" style="gap:14px">
${mark}
<p class="t-xl t-bold t-center">${escape(heading)}</p>
<p class="t-sm t-center" style="max-width:70%">${escape(detail)}</p>
</div></div></body></html>`,
    problems: [],
  };
}

export async function compose(
  widgets: PlacedWidget[],
  width: number,
  height: number,
  notices: Notice[] = [],
): Promise<Composition> {
  const problems: string[] = [];
  const cells: string[] = [];
  const css = await framework();
  const host = notices.length ? await noticeHost(widgets) : undefined;

  const cellWidth = width / COLUMNS;
  const cellHeight = height / ROWS;

  for (const widget of widgets) {
    const placement =
      `grid-column:${widget.column}/span ${widget.columnSpan};` +
      `grid-row:${widget.row}/span ${widget.rowSpan};`;

    const name = widget.label || widget.extension;
    const extension = await findExtension(widget.extension);

    if (!extension) {
      problems.push(`${name} is not installed any more.`);
      cells.push(gap(placement, `${widget.extension} is not installed`));
      continue;
    }

    const shape = shapeForSize(widget.columnSpan, widget.rowSpan);

    if (!shape) {
      problems.push(`${name} is ${widget.columnSpan}x${widget.rowSpan}, which is not a shape.`);
      cells.push(gap(placement, "Not a shape Dither knows"));
      continue;
    }

    const rendered = await renderWidget(
      extension,
      shape.id,
      widget.settings,
      widget.data,
      widget.id === host ? notices : [],
    );

    if ("problem" in rendered) {
      problems.push(rendered.problem);
      cells.push(gap(placement, rendered.problem));
      continue;
    }

    // The iframe is sized in pixels rather than percentages so the extension's
    // viewport units mean what its author intended.
    const box = {
      width: Math.round(widget.columnSpan * cellWidth),
      height: Math.round(widget.rowSpan * cellHeight),
    };

    const document = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>` +
      `<style>html,body{width:${box.width}px;height:${box.height}px;overflow:hidden}` +
      `.screen{height:${box.height}px;width:${box.width}px}</style></head>` +
      `<body>${rendered.html}</body></html>`;

    cells.push(
      `<div class="cell" style="${placement}">` +
        `<iframe scrolling="no" width="${box.width}" height="${box.height}" ` +
        `srcdoc="${escape(document)}"></iframe></div>`,
    );
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  :root { --ink: #000; --paper: #fff; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: var(--paper); }
  .panel {
    display: grid;
    grid-template-columns: repeat(${COLUMNS}, ${cellWidth}px);
    grid-template-rows: repeat(${ROWS}, ${cellHeight}px);
    width: ${width}px;
    height: ${height}px;
  }
  .cell { overflow: hidden; position: relative; }
  .cell iframe { border: 0; display: block; }
  .cell--gap {
    align-items: center;
    color: #444;
    display: flex;
    font: 13px/1.4 Inter, "DejaVu Sans", sans-serif;
    justify-content: center;
    padding: 12px;
    text-align: center;
    /* Hatched, so an unfilled cell reads as deliberate rather than broken. */
    background: repeating-linear-gradient(45deg, var(--paper) 0 6px, #e6e6e6 6px 12px);
  }
  .cell--gap p { margin: 0; }
</style></head>
<body><div class="panel">${cells.join("")}</div></body></html>`;

  return { html, problems };
}

/**
 * A single widget filling a document of its own size, for previews.
 *
 * No grid and no iframe: the page *is* the widget's box, so `100vh` already
 * means what the extension's author meant by it.
 */
export async function composeSolo(
  widget: PlacedWidget,
  shapeId: string,
  width: number,
  height: number,
): Promise<Composition> {
  const extension = await findExtension(widget.extension);
  const css = await framework();

  const chrome = `<style>${css}</style><style>
    html,body{width:${width}px;height:${height}px;overflow:hidden;background:var(--paper)}
    .screen{height:${height}px;width:${width}px}
  </style>`;

  if (!extension) {
    return {
      html: `<!doctype html><html><head><meta charset="utf-8">${chrome}</head><body></body></html>`,
      problems: [`${widget.extension} is not installed.`],
    };
  }

  const rendered = await renderWidget(extension, shapeId, widget.settings, widget.data);

  if ("problem" in rendered) {
    return {
      html:
        `<!doctype html><html><head><meta charset="utf-8">${chrome}` +
        `<style>body{align-items:center;display:flex;justify-content:center;` +
        `font:13px/1.4 sans-serif;color:#555;padding:16px;text-align:center}</style></head>` +
        `<body><p>${escape(rendered.problem)}</p></body></html>`,
      problems: [rendered.problem],
    };
  }

  return {
    html: `<!doctype html><html><head><meta charset="utf-8">${chrome}</head><body>${rendered.html}</body></html>`,
    problems: [],
  };
}
