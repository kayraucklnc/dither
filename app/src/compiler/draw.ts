// The `Draw` an extension is handed: its calls become runtime elements, offset
// into the widget's box and coloured for its frame.

import type { Box, Content, Draw, PictureOptions, TextOptions } from "@/extensions/api";
import { FONT_SIZES, fontInfo, iconSizeFor, type AssetLibrary, type FontInfo, type Weight } from "@/assets/library";
import type { Font } from "@/runtime/assets";
import { layout, shape, width } from "@/runtime/text";
import type { Condition, Element, Format, Part, Value } from "@/runtime/types";
import type { AssetTable } from "./asset-table";
import { scoped } from "./facts";
import { resolveKey, type SourceMap } from "./sources";

export interface DrawDeps {
  library: AssetLibrary;
  fonts: ReadonlyMap<string, Font>;
  assets: AssetTable;
  /** Turn a project image into a 1-bit bitmap of exactly this size. */
  picture: (imageId: string, w: number, h: number, options: PictureOptions) => Promise<Uint8Array | null>;
}

export interface WidgetFrame {
  box: Box;
  sources: SourceMap;
  inverted: boolean;
}

const ALIGN = { left: "l", center: "c", right: "r" } as const;
const VALIGN = { top: "t", middle: "m", bottom: "b" } as const;

export class ElementDraw implements Draw {
  readonly elements: Element[] = [];
  readonly width: number;
  readonly height: number;
  /** Where drawn elements go: the widget's list, or the innermost `when` group. */
  private target: Element[] = this.elements;

  constructor(private deps: DrawDeps, private frame: WidgetFrame) {
    this.width = frame.box.w;
    this.height = frame.box.h;
  }

  // ------------------------------------------------------------ helpers

  private font(size: number, weight: Weight = 400): { info: FontInfo; font: Font } {
    const info = fontInfo(size, weight);
    const font = this.deps.fonts.get(info.id);
    if (!font) throw new Error(`Font ${info.id} is not loaded`);
    return { info, font };
  }

  private fontAsset(info: FontInfo): number {
    return this.deps.assets.add(`font:${info.id}`, () => this.deps.library.font(info));
  }

  private color(white?: boolean): { c?: 0 } {
    // An inverted widget is white on black: every colour flips.
    const isWhite = white === true ? !this.frame.inverted : this.frame.inverted;
    return isWhite ? { c: 0 } : {};
  }

  private push(el: Element): void {
    this.target.push(el);
  }

  private at(b: Box): Box {
    return { x: this.frame.box.x + Math.round(b.x), y: this.frame.box.y + Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
  }

  private sourceRef(key: string): string {
    const ref = resolveKey(key, this.frame.sources);
    if (!ref) throw new Error(`This widget has no data source for “${key}”`);
    return ref;
  }

  // ------------------------------------------------------------ bindings

  value(key: string, format?: Format): Part {
    return format ? { v: this.sourceRef(key), f: this.scopeFormat(format) } : { v: this.sourceRef(key) };
  }

  /** A format's own references (`shift`) are this widget's values too. */
  private scopeFormat(f: Format): Format {
    return f.shift && !f.shift.v.includes(".") ? { ...f, shift: { ...f.shift, v: this.sourceRef(f.shift.v) } } : f;
  }

  ref(key: string): string {
    return this.sourceRef(key);
  }

  time(pattern: string): Part {
    return { v: "clock.epoch", f: { time: pattern } };
  }

  constant(value: Value, format: Format): Part {
    return { k: value, f: format };
  }

  // ------------------------------------------------------------ shapes

  text(content: Content, o: TextOptions): void {
    const parts = (Array.isArray(content) ? content : [content]).filter((p) => p !== "");
    const { info } = this.font(o.size, o.weight);
    const b = this.at(o);
    this.push({
      t: "text", ...b, font: this.fontAsset(info), parts,
      ...(o.align && o.align !== "left" ? { a: ALIGN[o.align] } : {}),
      ...(o.valign && o.valign !== "top" ? { va: VALIGN[o.valign] } : {}),
      ...(o.wrap ? { wrap: true } : {}),
      ...(o.lines ? { lines: o.lines } : {}),
      ...this.color(o.white),
    });
  }

  private iconAsset(name: string, size: number): number {
    return this.deps.assets.add(`icon:${name}:${size}`, async () => {
      const bytes = await this.deps.library.icon(name, size);
      if (!bytes) throw new Error(`No icon "${name}" at ${size}px`);
      return bytes;
    });
  }

  icon(name: string, box: Box, options?: { white?: boolean }): void {
    const b = this.at(box);
    const size = iconSizeFor(Math.min(b.w, b.h));
    this.push({
      t: "bitmap",
      x: b.x + Math.floor((b.w - size) / 2),
      y: b.y + Math.floor((b.h - size) / 2),
      a: this.iconAsset(name, size),
      ...this.color(options?.white),
    });
  }

  iconFor(key: string, pick: Format, names: string[], box: Box, options?: { white?: boolean }): void {
    const b = this.at(box);
    const size = iconSizeFor(Math.min(b.w, b.h));
    const set = Object.fromEntries(names.map((n) => [n, this.iconAsset(n, size)]));
    this.push({ t: "icon", ...b, v: this.ref(key), f: this.scopeFormat(pick), set, ...this.color(options?.white) });
  }

  rect(box: Box, o?: { fill?: boolean; stroke?: number; radius?: number; white?: boolean }): void {
    this.push({
      t: "rect", ...this.at(box),
      ...(o?.fill === false ? { fill: false, stroke: o.stroke ?? 1 } : {}),
      ...(o?.radius ? { r: o.radius } : {}),
      ...this.color(o?.white),
    });
  }

  circle(x: number, y: number, r: number, o?: { fill?: boolean; stroke?: number; white?: boolean }): void {
    const p = this.at({ x, y, w: 0, h: 0 });
    this.push({
      t: "circle", x: p.x, y: p.y, r: Math.round(r),
      ...(o?.fill === false ? { fill: false, stroke: o.stroke ?? 1 } : {}),
      ...this.color(o?.white),
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, o?: { width?: number; white?: boolean }): void {
    const a = this.at({ x: x1, y: y1, w: 0, h: 0 });
    const b = this.at({ x: x2, y: y2, w: 0, h: 0 });
    this.push({ t: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...(o?.width && o.width !== 1 ? { w: o.width } : {}), ...this.color(o?.white) });
  }

  hand(x: number, y: number, length: number, ref: string, max: number, o?: { width?: number }): void {
    const p = this.at({ x, y, w: 0, h: 0 });
    this.push({ t: "hand", x: p.x, y: p.y, len: Math.round(length), v: this.ref(ref), max, ...(o?.width ? { w: o.width } : {}), ...this.color() });
  }

  bar(box: Box, ref: string, min: number, max: number, o?: { vertical?: boolean }): void {
    this.push({ t: "bar", ...this.at(box), v: this.ref(ref), min, max, ...(o?.vertical ? { dir: "u" } : {}), ...this.color() });
  }

  chart(box: Box, ref: string, o?: { kind?: "bars" | "line"; min?: number; max?: number; gap?: number; width?: number }): void {
    this.push({
      t: "chart", ...this.at(box), v: this.ref(ref), kind: o?.kind ?? "line",
      ...(o?.min !== undefined ? { min: o.min } : {}),
      ...(o?.max !== undefined ? { max: o.max } : {}),
      ...(o?.gap !== undefined ? { gap: o.gap } : {}),
      ...(o?.width !== undefined ? { lw: o.width } : {}),
      ...this.color(),
    });
  }

  image(imageId: string, box: Box, options: PictureOptions = {}): void {
    const b = this.at(box);
    const index = this.deps.assets.add(`image:${imageId}:${b.w}x${b.h}:${JSON.stringify(options)}`, async () => {
      const bytes = await this.deps.picture(imageId, b.w, b.h, options);
      if (!bytes) throw new Error("A picture could not be prepared");
      return bytes;
    });
    this.push({ t: "bitmap", x: b.x, y: b.y, a: index });
  }

  when(condition: Condition, fn: () => void): void {
    // One group carries the condition for everything drawn inside it, rather
    // than every element repeating it — the panel has little memory to spare.
    const parent = this.target;
    const els: Element[] = [];
    this.target = els;
    try {
      fn();
    } finally {
      this.target = parent;
    }
    // Bare keys are this widget's own values, as in facts.
    if (els.length) parent.push({ t: "group", when: scoped(condition, this.frame.sources), els });
  }

  // ------------------------------------------------------------ measuring

  measure(text: string, size: number, weight?: Weight): number {
    const { font } = this.font(size, weight);
    return width(font, shape(font, text));
  }

  lineHeight(size: number, weight?: Weight): number {
    return this.font(size, weight).font.lineHeight;
  }

  metrics(size: number, weight?: Weight): { ascent: number; descent: number; lineHeight: number } {
    const { font } = this.font(size, weight);
    return { ascent: font.ascent, descent: font.descent, lineHeight: font.lineHeight };
  }

  fit(texts: string[], w: number, h: number, o?: { weight?: Weight; min?: number; max?: number }): number {
    const sizes = FONT_SIZES
      .filter((s) => s >= (o?.min ?? 0) && s <= (o?.max ?? Infinity));
    for (const size of [...sizes].reverse()) {
      const { font } = this.font(size, o?.weight);
      if (font.lineHeight > h) continue;
      if (texts.every((t) => width(font, shape(font, t)) <= w)) return size;
    }
    return sizes[0] ?? 12;
  }

  /** How many lines `text` takes at this size when wrapped to `w`. */
  linesFor(text: string, size: number, w: number, weight?: Weight): number {
    const { font } = this.font(size, weight);
    return layout(font, text, w, Infinity, true).length;
  }
}
