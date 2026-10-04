// One screen, drawn: docs/format.md §4. The simulator's half of the contract.

import { decodeAsset, type Asset, type Bitmap, type Font } from "./assets";
import { chooseScreen, evaluate } from "./conditions";
import { formatValue, type FormatContext } from "./format";
import { Framebuffer, circle, drawBitmap, fillRect, line, roundAway, strokeRect } from "./framebuffer";
import { drawText } from "./text";
import { parseZone } from "./tz";
import type { Element, ElementOf, Part, Runtime, Values } from "./types";

export class AssetStore {
  private cache = new Map<number, Asset>();
  constructor(private blob: Uint8Array, private table: readonly [number, number][]) {}

  get(index: number): Asset | null {
    const hit = this.cache.get(index);
    if (hit) return hit;
    const entry = this.table[index];
    if (!entry) return null;
    const asset = decodeAsset(this.blob.subarray(entry[0], entry[0] + entry[1]));
    this.cache.set(index, asset);
    return asset;
  }

  font(index: number): Font | null {
    const a = this.get(index);
    return a?.kind === "font" ? a : null;
  }

  bitmap(index: number): Bitmap | null {
    const a = this.get(index);
    return a?.kind === "bitmap" ? a : null;
  }
}

interface Ctx {
  fb: Framebuffer;
  assets: AssetStore;
  values: Values;
  fmt: FormatContext;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp01 = (f: number) => Math.max(0, Math.min(1, f));

function textOf(parts: readonly Part[], ctx: Ctx): string {
  return parts
    .map((p) => {
      if (typeof p === "string") return p;
      const v = "v" in p ? (ctx.values.get(p.v) ?? null) : p.k;
      return formatValue(v, p.f, ctx.fmt);
    })
    .join("");
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

/** A dithered ramp beneath a line: dense near it, fading to the floor. */
function shadeUnder(fb: Framebuffer, pts: number[][], x: number, w: number, floor: number, ink: boolean): void {
  let seg = 0;
  for (let px = x; px < x + w; px++) {
    while (seg < pts.length - 2 && px > pts[seg + 1][0]) seg++;
    const [x0, y0] = pts[seg];
    const [x1, y1] = pts[seg + 1];
    const ly = x1 === x0 ? y0 : y0 + Math.floor(((y1 - y0) * (px - x0)) / (x1 - x0));
    for (let py = ly + 1; py < floor; py++) {
      const level = 2 + Math.floor((8 * (floor - py)) / Math.max(1, floor - ly));
      if (BAYER[py & 3][px & 3] < level) fb.set(px, py, ink);
    }
  }
}

function drawChart(el: ElementOf<"chart">, ctx: Ctx, ink: boolean): void {
  const series = ctx.values.get(el.v);
  if (!Array.isArray(series) || series.length === 0) return;
  const n = series.length;
  let lo = el.min ?? Math.min(...series);
  let hi = el.max ?? Math.max(...series);
  if (hi <= lo) hi = lo + 1;
  const f = (s: number) => clamp01((s - lo) / (hi - lo));
  if (el.kind !== "line" && el.kind !== "steps" && el.kind !== "area") {
    const gap = el.gap ?? 1;
    series.forEach((s, i) => {
      const x0 = el.x + Math.floor((i * el.w) / n);
      const x1 = el.x + Math.floor(((i + 1) * el.w) / n) - gap;
      const bh = Math.max(1, Math.floor(f(s) * el.h));
      fillRect(ctx.fb, x0, el.y + el.h - bh, x1 - x0, bh, 0, ink);
    });
    return;
  }
  const pts = series.map((s, i) => [
    el.x + Math.floor((i * (el.w - 1)) / Math.max(1, n - 1)),
    el.y + (el.h - 1) - Math.floor(f(s) * (el.h - 1)),
  ]);
  const lw = el.lw ?? 2;
  if (el.kind === "steps") {
    pts.forEach(([px, py], i) => {
      const nx = i + 1 < pts.length ? pts[i + 1][0] : el.x + el.w - 1;
      line(ctx.fb, px, py, nx, py, lw, ink);
      if (i + 1 < pts.length) line(ctx.fb, nx, py, nx, pts[i + 1][1], lw, ink);
    });
    return;
  }
  if (el.kind === "area" && pts.length > 1) shadeUnder(ctx.fb, pts, el.x, el.w, el.y + el.h, ink);
  for (let i = 1; i < pts.length; i++) line(ctx.fb, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], lw, ink);
}

const MAX_GROUP_DEPTH = 8;

function drawElement(el: Element, ctx: Ctx, depth = 0): void {
  if (el.when && !evaluate(el.when, ctx.values, ctx.fmt)) return;
  const ink = el.c !== 0;
  const fb = ctx.fb;
  switch (el.t) {
    case "rect":
      if (el.fill === false) strokeRect(fb, el.x, el.y, el.w, el.h, el.r ?? 0, el.stroke ?? 1, ink);
      else fillRect(fb, el.x, el.y, el.w, el.h, el.r ?? 0, ink);
      return;
    case "circle":
      circle(fb, el.x, el.y, el.r, el.fill !== false, el.stroke ?? 1, ink);
      return;
    case "line":
      line(fb, el.x1, el.y1, el.x2, el.y2, el.w ?? 1, ink);
      return;
    case "hand": {
      const v = num(ctx.values.get(el.v));
      if (v === null || !(el.max > 0)) return;
      const a = (2 * Math.PI * v) / el.max;
      const x2 = el.x + roundAway(Math.sin(a) * el.len);
      const y2 = el.y - roundAway(Math.cos(a) * el.len);
      line(fb, el.x, el.y, x2, y2, el.w ?? 1, ink);
      return;
    }
    case "text": {
      const font = ctx.assets.font(el.font);
      if (!font) return;
      drawText(fb, font, textOf(el.parts, ctx), {
        x: el.x, y: el.y, w: el.w, h: el.h,
        align: el.a ?? "l", valign: el.va ?? "t", wrap: el.wrap ?? false, lines: el.lines,
      }, ink);
      return;
    }
    case "bitmap": {
      const bmp = ctx.assets.bitmap(el.a);
      if (bmp) drawBitmap(fb, bmp, el.x, el.y, ink);
      return;
    }
    case "icon": {
      const name = formatValue(ctx.values.get(el.v) ?? null, el.f, ctx.fmt);
      const index = Object.prototype.hasOwnProperty.call(el.set, name) ? el.set[name] : undefined;
      const bmp = index === undefined ? null : ctx.assets.bitmap(index);
      if (!bmp) return;
      const x = el.x + Math.floor((el.w - bmp.width) / 2);
      const y = el.y + Math.floor((el.h - bmp.height) / 2);
      drawBitmap(fb, bmp, x, y, ink, { x0: el.x, y0: el.y, x1: el.x + el.w, y1: el.y + el.h });
      return;
    }
    case "bar": {
      const v = num(ctx.values.get(el.v));
      if (v === null || typeof el.min !== "number" || typeof el.max !== "number" || el.max <= el.min) return;
      const f = clamp01((v - el.min) / (el.max - el.min));
      if (el.dir === "u") {
        const bh = Math.floor(f * el.h);
        fillRect(fb, el.x, el.y + el.h - bh, el.w, bh, 0, ink);
      } else fillRect(fb, el.x, el.y, Math.floor(f * el.w), el.h, 0, ink);
      return;
    }
    case "chart":
      drawChart(el, ctx, ink);
      return;
    case "group":
      if (depth >= MAX_GROUP_DEPTH) return;
      for (const child of el.els) drawElement(child, ctx, depth + 1);
      return;
  }
}

export function formatContext(runtime: Runtime, now: number, values?: Values): FormatContext {
  return { now, zone: parseZone(runtime.tz), locale: runtime.locale, values };
}

export interface RenderResult {
  fb: Framebuffer;
  screen: number;
  rule: number | null;
}

export function render(runtime: Runtime, blob: Uint8Array, values: Values, now: number, assets?: AssetStore): RenderResult {
  const store = assets ?? new AssetStore(blob, runtime.assets);
  const { screen, rule } = chooseScreen(runtime.rules, values, formatContext(runtime, now, values));
  const fb = renderScreen(runtime, store, screen, values, now);
  return { fb, screen, rule };
}

export function renderScreen(runtime: Runtime, assets: AssetStore, screen: number, values: Values, now: number): Framebuffer {
  const fb = new Framebuffer(runtime.width, runtime.height);
  const ctx: Ctx = { fb, assets, values, fmt: formatContext(runtime, now, values) };
  // A rule naming a screen that does not exist shows the first one.
  for (const el of (runtime.screens[screen] ?? runtime.screens[0])?.elements ?? []) drawElement(el, ctx);
  return fb;
}
