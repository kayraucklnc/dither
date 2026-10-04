// Fonts carry only the characters a screen can draw. A clock's 128 px digits
// need eleven glyphs, not three hundred — and flashing gets that much faster.
//
// What a text can show is known for literals and for formatted values whose
// output is bounded (numbers, times, mapped words). A raw string from the web
// could be anything, so its font stays whole.

import type { Element, Format, Locale, Part } from "@/runtime/types";
import { decodeFont } from "@/runtime/assets";
import { upper } from "@/runtime/format";

const DIGITS = "0123456789";
const ALWAYS = " ?.…–"; // space, missing-glyph, both ellipses, the null dash

type Charset = Set<number> | "all";

function add(set: Set<number>, text: string): void {
  for (const ch of text) set.add(ch.codePointAt(0)!);
}

function formatChars(f: Format | undefined, locale: Locale): Charset {
  if (!f) return "all";
  const out = new Set<number>();
  add(out, f.fallback ?? "–");
  if (f.map) {
    for (const o of f.map.o) add(out, o);
    if (f.map.d) add(out, f.map.d);
    if (!f.num && f.time === undefined) return withUpper(out, f);
  }
  if (f.steps) {
    for (const o of f.steps.o) add(out, o);
    if (!f.num && f.time === undefined) return withUpper(out, f);
  }
  if (f.num) {
    add(out, `${DIGITS}-.${f.num.sep ?? ""}`);
    return out;
  }
  if (f.time !== undefined) {
    add(out, `${DIGITS}AMP+:${f.time}`);
    for (const list of [locale.days, locale.daysShort, locale.months, locale.monthsShort]) for (const name of list) add(out, name);
    return withUpper(out, f);
  }
  if (f.until || f.days || f.scale !== undefined || f.add !== undefined) {
    // A number with no fixed decimals prints automatically.
    add(out, `${DIGITS}-.`);
    return out;
  }
  return "all";
}

function withUpper(set: Set<number>, f: Format): Set<number> {
  if (!f.upper) return set;
  const text = String.fromCodePoint(...set);
  add(set, upper(text, f.tr === true));
  return set;
}

function partChars(p: Part, locale: Locale): Charset {
  if (typeof p === "string") {
    const s = new Set<number>();
    add(s, p);
    return s;
  }
  return formatChars(p.f, locale);
}

/** For each font asset index, the codepoints its texts can need. */
function flatten(elements: readonly Element[]): Element[] {
  return elements.flatMap((el) => (el.t === "group" ? flatten(el.els) : [el]));
}

export function fontCharsets(elements: readonly Element[], locale: Locale): Map<number, Charset> {
  const out = new Map<number, Charset>();
  for (const el of flatten(elements)) {
    if (el.t !== "text") continue;
    let cur = out.get(el.font) ?? new Set<number>();
    for (const p of el.parts) {
      if (cur === "all") break;
      const chars = partChars(p, locale);
      if (chars === "all") cur = "all";
      else for (const c of chars) cur.add(c);
    }
    out.set(el.font, cur);
  }
  return out;
}

/** A DFNT with only these codepoints (plus the few every text may need). */
export function subsetFont(bytes: Uint8Array, keep: Set<number>): Uint8Array {
  const font = decodeFont(bytes);
  const wanted = new Set(keep);
  add(wanted, ALWAYS);
  const glyphs = [...font.glyphs.values()].filter((g) => wanted.has(g.codepoint)).sort((a, b) => a.codepoint - b.codepoint);
  const table = 16 + glyphs.length * 20;
  const sizes = glyphs.map((g) => Math.ceil(g.width / 8) * g.height);
  const out = new Uint8Array(table + sizes.reduce((a, b) => a + b, 0));
  out.set(bytes.subarray(0, 16));
  const view = new DataView(out.buffer);
  view.setUint16(12, glyphs.length, true);
  let at = table;
  glyphs.forEach((g, i) => {
    const rec = 16 + i * 20;
    view.setUint32(rec, g.codepoint, true);
    view.setUint32(rec + 4, sizes[i] ? at : 0, true);
    view.setUint16(rec + 8, g.width, true);
    view.setUint16(rec + 10, g.height, true);
    view.setInt16(rec + 12, g.xOffset, true);
    view.setInt16(rec + 14, g.yOffset, true);
    view.setUint16(rec + 16, g.advance, true);
    out.set(bytes.subarray(g.offset, g.offset + sizes[i]), at);
    at += sizes[i];
  });
  return out;
}
