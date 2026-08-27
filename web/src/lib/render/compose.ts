import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { find as findExtension, rendersNotices } from "@/lib/extensions/registry";
import { COLUMNS, ROWS, sizeOf, type Size } from "@/lib/shapes";
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_REFRESH_SECONDS,
  renderWidget,
  type Environment,
} from "./liquid";

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
  /**
   * What the last fetch failed with, if it failed. A widget that cannot say
   * this draws stale or invented data and looks perfectly healthy doing it.
   */
  problem?: string;
  /**
   * True when `data` is the extension's sample rather than anything real.
   *
   * The difference decides how loud to be. An extension that was working and
   * has gone quiet keeps its last answer with a note over it - a departure
   * board from twenty minutes ago is still worth reading. One that has *never*
   * answered has nothing worth protecting, and drawing its sample is the panel
   * telling a plausible lie.
   */
  standIn?: boolean;
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
  /**
   * Which of the extension's designs to draw with, when several cover this
   * size. Empty means "whichever fits best".
   */
  design?: string;
  /** Pinned as the screen's alert area. */
  hostsNotices?: boolean;
}

interface Size2D {
  width: number;
  height: number;
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

/**
 * A widget that has never had a real answer, and cannot get one.
 *
 * Drawn instead of the extension's sample, not beside it. The sample exists so
 * a screen can be laid out before anyone owns an API key, and it is exactly
 * the wrong thing to put on a wall when a fetch is failing: four invented
 * meetings look like four real meetings, and the only place the truth appeared
 * was a page nobody was looking at.
 *
 * So this says the name of the thing, that it has never answered, and what the
 * provider said - which is nearly always actionable, because providers explain
 * themselves better than we can guess. "Google Calendar API has not been used
 * in project 193338348023 before or it is disabled" is a sentence that fixes
 * itself.
 */
function fault(placement: string, name: string, message: string, box: Size2D): string {
  // How many lines of the reason actually fit, given the name, the label, the
  // gaps and the padding above it. A cell too short for even one is told the
  // name and that it is broken, and stops there - half a clipped sentence
  // reads as a rendering bug rather than as an explanation.
  const NAME = 21;
  const LABEL = 14;
  const CHROME = 20 + 6;
  const LINE = 15;

  // "HAS NEVER ANSWERED" is about 125px of tracked 10px capitals, so below
  // roughly a three-column cell it wraps and costs a second line. Counting it
  // as one was the arithmetic that left a two-row cell showing a five-pixel
  // sliver of a sentence.
  const labelLines = box.width - 20 >= 130 ? 1 : 2;

  const lines = Math.min(4, Math.floor((box.height - NAME - LABEL * labelLines - CHROME) / LINE));

  return (
    `<div class="cell cell--fault" style="${placement}">` +
    `<p class="fault-name">${escape(name)}</p>` +
    `<p class="fault-what">has never answered</p>` +
    (lines > 0
      ? `<p class="fault-why" style="-webkit-line-clamp:${lines}">${escape(message)}</p>`
      : "") +
    `</div>`
  );
}

/**
 * The last good answer, with the truth over it.
 *
 * A provider being down should leave the previous answer on screen rather than
 * blanking the panel - a departure board from twenty minutes ago still tells
 * you roughly when the train is. But it must not pretend to be current, so the
 * note goes *over* the widget, in the outer document rather than the iframe,
 * which is what keeps it out of every extension's templates.
 */
function staleNote(message: string): string {
  return `<div class="stale"><span class="stale-mark"></span><span class="stale-why">${escape(message)}</span></div>`;
}

export interface Notice {
  icon: string;
  text: string;
  level: "info" | "warn" | "urgent";
  /** "screen" for the alert area, "source" to prefer its own extension's widget. */
  placement?: string;
  /** The extension the notice is about, for placement: source. */
  fromExtension?: string;
  /** Set on the summary entry: how many did not fit. */
  overflow?: number;
}

const WEIGHT: Record<string, number> = { urgent: 3, warn: 2, info: 1 };

/**
 * Deciding where each notice lands.
 *
 * A notice never goes to every widget - three designs that take alerts would
 * show the same warning three times. It goes to one, and *which* one used to
 * be whichever happened to be first in reading order, which is not a decision
 * anybody made: moving a widget moved the alerts.
 *
 * Now there are two rules, in this order:
 *
 *   1. A notice placed "with its source" goes to a widget of the extension it
 *      is about, if the screen has one. A cancelled train belongs on the
 *      departure board, not beside the weather.
 *   2. Everything else goes to the screen's alert area: the widget pinned as
 *      such, or failing that the *largest* design that can take alerts -
 *      because room is what an alert needs, and largest is a reason where
 *      first-in-reading-order was an accident.
 *
 * Each design says how many it can hold. Past that the lowest levels are
 * summarised rather than squeezed, so a cancellation is never dropped to make
 * room for "rain likely".
 */
async function canHost(widget: PlacedWidget): Promise<boolean> {
  const extension = await findExtension(widget.extension);
  return Boolean(extension && rendersNotices(extension, sizeOf(widget), widget.design));
}

export async function routeNotices(
  widgets: PlacedWidget[],
  notices: Notice[],
): Promise<Map<number, Notice[]>> {
  const routed = new Map<number, Notice[]>();
  if (!notices.length) return routed;

  const hosts: PlacedWidget[] = [];
  for (const widget of widgets) if (await canHost(widget)) hosts.push(widget);
  if (!hosts.length) return routed;

  const area =
    hosts.find((widget) => widget.hostsNotices) ??
    [...hosts].sort(
      (a, b) =>
        b.columnSpan * b.rowSpan - a.columnSpan * a.rowSpan ||
        a.row - b.row ||
        a.column - b.column,
    )[0];

  for (const notice of notices) {
    const target =
      (notice.placement === "source" &&
        notice.fromExtension &&
        hosts.find((widget) => widget.extension === notice.fromExtension)) ||
      area;

    routed.set(target.id, [...(routed.get(target.id) ?? []), notice]);
  }

  // Trim to what each design says it can hold, keeping the loudest.
  for (const [widgetId, list] of routed) {
    const widget = widgets.find((candidate) => candidate.id === widgetId)!;
    const extension = await findExtension(widget.extension);
    const capacity = extension?.manifest.notice_capacity ?? 2;

    if (list.length <= capacity) continue;

    const ordered = [...list].sort(
      (a, b) => (WEIGHT[b.level] ?? 0) - (WEIGHT[a.level] ?? 0),
    );
    const kept = ordered.slice(0, capacity - 1);
    const dropped = ordered.length - kept.length;

    routed.set(widgetId, [
      ...kept,
      { icon: "info", text: `${dropped} more`, level: "info", overflow: dropped },
    ]);
  }

  return routed;
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
  environment: Environment = DEFAULT_ENVIRONMENT,
  /** The device's refresh rate, so a design that draws the clock knows how
      long its picture has to stay true. */
  refreshSeconds: number = DEFAULT_REFRESH_SECONDS,
): Promise<Composition> {
  const problems: string[] = [];
  const cells: string[] = [];
  const css = await framework();
  const routed = await routeNotices(widgets, notices);

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

    // Nothing real has ever come back, and the last attempt said why. Drawing
    // the sample here is how a panel ends up showing four meetings that do not
    // exist, so it does not get drawn.
    if (widget.standIn && widget.problem) {
      problems.push(`${name}: ${widget.problem}`);
      cells.push(
        fault(placement, name, widget.problem, {
          width: widget.columnSpan * cellWidth,
          height: widget.rowSpan * cellHeight,
        }),
      );
      continue;
    }

    // The iframe is sized in pixels rather than percentages so the extension's
    // viewport units mean what its author intended.
    const box = {
      width: Math.round(widget.columnSpan * cellWidth),
      height: Math.round(widget.rowSpan * cellHeight),
    };

    const rendered = await renderWidget({
      extension,
      size: sizeOf(widget),
      style: widget.design,
      settings: widget.settings,
      data: widget.data,
      notices: routed.get(widget.id) ?? [],
      environment,
      pixels: box,
      refreshSeconds,
    });

    if ("problem" in rendered) {
      problems.push(rendered.problem);
      cells.push(gap(placement, rendered.problem));
      continue;
    }

    const document = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>` +
      `<style>html,body{width:${box.width}px;height:${box.height}px;overflow:hidden}` +
      `.screen{height:${box.height}px;width:${box.width}px}</style></head>` +
      `<body>${rendered.html}</body></html>`;

    // It drew, from a real answer, but the newest attempt failed - so the
    // picture is older than it looks and has to say so.
    if (widget.problem) problems.push(`${name}: ${widget.problem}`);

    cells.push(
      `<div class="cell" style="${placement}">` +
        `<iframe scrolling="no" width="${box.width}" height="${box.height}" ` +
        `srcdoc="${escape(document)}"></iframe>` +
        (widget.problem ? staleNote(widget.problem) : "") +
        `</div>`,
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

  /* A widget that has never had a real answer. Bordered rather than hatched:
     a gap is an empty space on purpose, this is a thing that is broken. */
  .cell--fault {
    background: var(--paper);
    border: 2px solid var(--ink);
    color: var(--ink);
    display: flex;
    flex-direction: column;
    font: 12px/1.35 Inter, "DejaVu Sans", sans-serif;
    gap: 3px;
    justify-content: center;
    padding: 10px;
    text-align: center;
  }
  .cell--fault p { margin: 0; }
  .fault-name { font-size: 15px; font-weight: 700; }
  .fault-what {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  /* The provider's own words, which are usually the fix. Clamped rather than
     shrunk - four lines of readable type beats ten of unreadable. */
  .fault-why {
    -webkit-box-orient: vertical;
    display: -webkit-box;
    font-size: 11px;
    overflow: hidden;
  }

  /* Drawn over a widget whose last answer was real but whose newest attempt
     failed. Inverted, because on a one-bit panel that is the only emphasis
     there is, and a note this one must not read as part of the design. */
  .stale {
    align-items: center;
    background: var(--ink);
    bottom: 0;
    color: var(--paper);
    display: flex;
    font: 10px/1.2 Inter, "DejaVu Sans", sans-serif;
    gap: 5px;
    left: 0;
    padding: 3px 6px;
    position: absolute;
    right: 0;
  }
  .stale-mark {
    background: var(--paper);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
    flex: none;
    height: 9px;
    width: 9px;
  }
  .stale-why { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  size: Size,
  width: number,
  height: number,
  environment: Environment = DEFAULT_ENVIRONMENT,
  notices: Notice[] = [],
  refreshSeconds: number = DEFAULT_REFRESH_SECONDS,
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

  const rendered = await renderWidget({
    extension,
    size,
    style: widget.design,
    settings: widget.settings,
    data: widget.data,
    notices,
    environment,
    pixels: { width, height },
    refreshSeconds,
  });

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
