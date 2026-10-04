// Text layout: docs/format.md §4 "Text". Works in codepoints, never UTF-16 units.

import type { Font, Glyph } from "./assets";
import { Framebuffer, type Clip } from "./framebuffer";

const ELLIPSIS = 0x2026;
const QUESTION = 0x3f;
const SPACE = 0x20;

/** Codepoints mapped onto what the font can draw (`?` for the rest). */
export function shape(font: Font, text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const ok = c < 0xd800 || c > 0xdfff; // a lone surrogate is not a character
    if (ok && font.glyphs.has(c)) out.push(c);
    else if (font.glyphs.has(QUESTION)) out.push(QUESTION);
  }
  return out;
}

export function width(font: Font, run: readonly number[]): number {
  let w = 0;
  for (const c of run) w += font.glyphs.get(c)?.advance ?? 0;
  return w;
}

function ellipsis(font: Font): number[] {
  return font.glyphs.has(ELLIPSIS) ? [ELLIPSIS] : shape(font, "...");
}

export function ellipsize(font: Font, run: readonly number[], w: number): number[] {
  const tail = ellipsis(font);
  const tailWidth = width(font, tail);
  const kept = [...run];
  while (kept.length > 0 && width(font, kept) + tailWidth > w) kept.pop();
  return [...kept, ...tail];
}

function words(run: readonly number[]): number[][] {
  const out: number[][] = [];
  let word: number[] = [];
  for (const c of run) {
    if (c === SPACE) {
      if (word.length) out.push(word);
      word = [];
    } else word.push(c);
  }
  if (word.length) out.push(word);
  return out;
}

/** Split a paragraph into lines no wider than `w`. */
function wrapParagraph(font: Font, para: readonly number[], w: number): number[][] {
  const lines: number[][] = [];
  const queue = words(para);
  let line: number[] | null = null;
  const spaceW = font.glyphs.get(SPACE)?.advance ?? 0;
  while (queue.length) {
    const word = queue.shift()!;
    if (line !== null && width(font, line) + spaceW + width(font, word) <= w) {
      line = [...line, SPACE, ...word];
      continue;
    }
    if (line !== null) lines.push(line);
    if (width(font, word) <= w) {
      line = word;
      continue;
    }
    // A word wider than the box: as many codepoints as fit, at least one.
    let n = 1;
    while (n < word.length && width(font, word.slice(0, n + 1)) <= w) n++;
    lines.push(word.slice(0, n));
    line = null;
    if (n < word.length) queue.unshift(word.slice(n));
  }
  if (line !== null) lines.push(line);
  return lines.length ? lines : [[]];
}

export function layout(font: Font, text: string, w: number, h: number, wrap: boolean, maxLines?: number): number[][] {
  if (!wrap) {
    const run = shape(font, text.replace(/\n/g, " "));
    return [width(font, run) > w ? ellipsize(font, run, w) : run];
  }
  const limit = Math.max(1, Math.min(maxLines ?? Infinity, Math.floor(h / font.lineHeight)));
  const lines = text.split("\n").flatMap((p) => wrapParagraph(font, shape(font, p), w));
  if (lines.length <= limit) return lines;
  const kept = lines.slice(0, limit);
  kept[limit - 1] = ellipsize(font, kept[limit - 1], w);
  return kept;
}

function drawGlyph(fb: Framebuffer, font: Font, g: Glyph, x: number, baseline: number, ink: boolean, clip: Clip): void {
  const stride = Math.ceil(g.width / 8);
  for (let row = 0; row < g.height; row++) {
    for (let col = 0; col < g.width; col++) {
      const byte = font.bytes[g.offset + row * stride + (col >> 3)];
      if (byte & (0x80 >> (col & 7))) fb.set(x + g.xOffset + col, baseline + g.yOffset + row, ink, clip);
    }
  }
}

export interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  align: "l" | "c" | "r";
  valign: "t" | "m" | "b";
  wrap: boolean;
  lines?: number;
}

export function drawText(fb: Framebuffer, font: Font, text: string, box: TextBox, ink: boolean): void {
  const lines = layout(font, text, box.w, box.h, box.wrap, box.lines);
  const bh = lines.length * font.lineHeight;
  const top = box.valign === "t" ? box.y : box.valign === "m" ? box.y + Math.floor((box.h - bh) / 2) : box.y + box.h - bh;
  const clip: Clip = { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h };
  lines.forEach((run, i) => {
    const baseline = top + i * font.lineHeight + font.ascent;
    const lw = width(font, run);
    let pen = box.align === "l" ? box.x : box.align === "c" ? box.x + Math.floor((box.w - lw) / 2) : box.x + box.w - lw;
    for (const c of run) {
      const g = font.glyphs.get(c)!;
      drawGlyph(fb, font, g, pen, baseline, ink, clip);
      pen += g.advance;
    }
  });
}
