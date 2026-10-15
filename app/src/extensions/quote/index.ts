import type { Condition } from "@/runtime/types";
import { FONT_SIZES, type Weight } from "@/assets/library";
import { defineExtension, type Draw } from "../api";
import { LITERATURE, PHILOSOPHY, type Quote } from "./quotes";

type Collection = "all" | "philosophy" | "literature" | "mine";
type Credit = "work" | "name" | "none";

const MAX_SIZE = 48; // larger fonts lack curly quotes and most accents
const AIR = 4; // some glyphs reach above the ascent

/** "Text — Who, Work" (or a hyphen) on one line of the list; who is optional. */
export function parseQuote(line: string): Quote | null {
  const m = /^(.*\S)\s+[—–-]\s+(\S.*)$/.exec(line.trim());
  const text = (m ? m[1] : line).trim().replace(/^["“]|["”]$/g, "");
  if (text === "") return null;
  if (!m) return { text, who: "" };
  const [who, ...from] = m[2].split(",");
  return { text, who: who.trim(), ...(from.length ? { from: from.join(",").trim() } : {}) };
}

/** Takes every `stride`-th, so neighbours in the list (one author's quotes) are not neighbouring days. */
function spread<T>(list: readonly T[]): T[] {
  const n = list.length;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const stride = [7, 11, 13, 17, 19, 23].find((s) => gcd(s, n) === 1) ?? 1;
  return list.map((_, i) => list[(i * stride) % n]);
}

export function quotesFor(collection: Collection, mine: readonly string[]): Quote[] {
  if (collection === "mine") return mine.map(parseQuote).filter((q): q is Quote => q !== null);
  if (collection === "philosophy") return spread(PHILOSOPHY);
  if (collection === "literature") return spread(LITERATURE);
  // Alternate the two, a book one day and a philosopher the next.
  const a = spread(PHILOSOPHY), b = spread(LITERATURE);
  return Array.from({ length: Math.max(a.length, b.length) * 2 }, (_, i) => (i % 2 ? b : a)[Math.floor(i / 2)])
    .filter((q): q is Quote => q !== undefined);
}

/**
 * When the quote at `index` of `count` shows: day `(month - 1) * 31 + day - 1`
 * of the year, wrapped around the list. The first also shows while the clock is unknown.
 */
export function daysOf(index: number, count: number): Condition {
  const byDays = new Map<string, { months: number[]; days: number[] }>();
  for (let month = 1; month <= 12; month++) {
    const days: number[] = [];
    for (let day = 1; day <= 31; day++) if (((month - 1) * 31 + day - 1) % count === index) days.push(day);
    if (days.length === 0) continue;
    const key = days.join(",");
    const group = byDays.get(key) ?? { months: [], days };
    group.months.push(month);
    byDays.set(key, group);
  }
  const any: Condition[] = [...byDays.values()].map(({ months, days }) => ({
    all: [
      ...(months.length === 12 ? [] : [{ v: "clock.month", op: "in" as const, x: months }]),
      { v: "clock.day", op: "in" as const, x: days },
    ],
  }));
  if (index === 0) any.push({ v: "clock.day", op: "absent" });
  return { any };
}

function creditFor(q: Quote, credit: Credit): string {
  if (credit === "none" || q.who === "") return "";
  return `— ${q.who}${credit === "work" && q.from ? `, ${q.from}` : ""}`;
}

/** The largest size at which the quote and its credit fit the box together. */
function layout(d: Draw, text: string, credit: string, bold: boolean) {
  const weight: Weight = bold ? 700 : 400;
  const sizes = FONT_SIZES.filter((s) => s <= MAX_SIZE).reverse();
  for (const size of sizes) {
    const creditSize = sizes.find((s) => s <= Math.max(12, Math.min(24, size * 0.6))) ?? 12;
    const lines = d.linesFor(text, size, d.width, weight);
    const quoteH = lines * d.lineHeight(size, weight);
    const creditLines = credit ? d.linesFor(credit, creditSize, d.width) : 0;
    const creditH = creditLines * d.lineHeight(creditSize);
    const gap = credit ? Math.round(size * 0.5) : 0;
    const total = quoteH + gap + creditH + AIR;
    if (total <= d.height || size === sizes[sizes.length - 1]) {
      return { size, weight, lines, quoteH, creditSize, creditLines, creditH, gap, total: Math.min(total, d.height) };
    }
  }
  throw new Error("unreachable");
}

function drawQuote(d: Draw, q: Quote, credit: Credit, bold: boolean, align: "left" | "center"): void {
  const text = `“${q.text}”`;
  const by = creditFor(q, credit);
  const l = layout(d, text, by, bold);
  const top = Math.round((d.height - l.total) / 2);
  d.text(text, { x: 0, y: top, w: d.width, h: l.quoteH + AIR, size: l.size, weight: l.weight, align, valign: "bottom", wrap: true, lines: l.lines });
  if (!by) return;
  d.text(by, {
    x: 0, y: top + AIR + l.quoteH + l.gap, w: d.width, h: l.creditH, size: l.creditSize,
    align: align === "center" ? "center" : "right", wrap: true, lines: l.creditLines,
  });
}

export default defineExtension({
  id: "quote",
  name: "Quote",
  description: "A line from a great book or a philosopher, a new one every day.",
  icon: "book-open",
  category: "text",
  size: { min: [4, 2], default: [10, 4] },
  fields: [
    {
      key: "collection", label: "Quotes", kind: "select", options: [
        { value: "all", label: "Books and philosophers" },
        { value: "philosophy", label: "Philosophers" },
        { value: "literature", label: "Books" },
        { value: "mine", label: "My own" },
      ],
    },
    {
      key: "mine", label: "My quotes", kind: "list", placeholder: "Stay hungry, stay foolish. — Stewart Brand",
      help: "One per line: the quote, a dash, then who said it.", visible: (s) => s.collection === "mine",
    },
    {
      key: "credit", label: "Credit", kind: "select", options: [
        { value: "work", label: "Name and book" },
        { value: "name", label: "Name only" },
        { value: "none", label: "None" },
      ],
    },
    { key: "bold", label: "Bold", kind: "toggle" },
    { key: "align", label: "Align", kind: "select", options: [{ value: "center", label: "Centre" }, { value: "left", label: "Left" }] },
  ],
  defaults: () => ({ collection: "all", mine: [] as string[], credit: "work", bold: false, align: "center" }),
  refresh: () => 24 * 60,
  title: (s) => {
    const names: Record<string, string> = { philosophy: "Philosophers", literature: "Books", mine: "My own" };
    return names[String(s.collection)] ? `Quote · ${names[String(s.collection)]}` : "Quote";
  },
  draw(d, s) {
    const mine = (Array.isArray(s.mine) ? s.mine : []).map(String);
    const quotes = quotesFor((s.collection as Collection) ?? "all", mine);
    if (quotes.length === 0) {
      d.text("Add quotes in its settings", { x: 0, y: 0, w: d.width, h: d.height, size: d.fit(["Add quotes in its"], d.width, d.height, { max: 24 }), align: "center", valign: "middle", wrap: true });
      return;
    }
    const credit = (["work", "name", "none"].includes(String(s.credit)) ? s.credit : "work") as Credit;
    const align = s.align === "left" ? "left" : "center";
    // The layout is fixed when the project compiles, so each quote is laid out
    // at its own best size, and the panel shows the one whose day it is.
    if (quotes.length === 1) return drawQuote(d, quotes[0], credit, s.bold === true, align);
    quotes.forEach((q, i) => d.when(daysOf(i, quotes.length), () => drawQuote(d, q, credit, s.bold === true, align)));
  },
});
