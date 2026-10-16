import type { Condition, Format } from "@/runtime/types";
import { defineExtension, type Box, type Draw, type Fact, type SourceSpec } from "../api";
import { CURRENCIES, rateSource, type Currency } from "../currency";
import { NAMES } from "./names";

// Share prices from Finnhub, one quote per symbol, every five minutes. The free
// key allows 60 requests a minute; five symbols ask about one. Finnhub lets a
// browser read its answers but not send its token header, so the key rides in
// the address, the same for the preview as for the panel.

const API = "https://finnhub.io/api/v1/";
const MAX = 5;
/** Minutes after which a price is too old to show as today's. */
const STALE = 30;

export const finnhubUrl = (path: string, key: string) => `${API}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(key)}`;

export interface Stock {
  symbol: string;
  name: string;
}

/** "AAPL", or "AAPL Apple" to name it: one per line (or between commas), at most five. */
export function stocksOf(lines: readonly unknown[]): Stock[] {
  const out: Stock[] = [];
  for (const line of lines.flatMap((l) => String(l).split(","))) {
    const m = /^\s*([A-Za-z][A-Za-z0-9.-]{0,9})(?:\s+[—–-]?\s*(.*\S))?\s*$/.exec(String(line));
    if (!m) continue;
    const symbol = m[1].toUpperCase();
    if (out.some((s) => s.symbol === symbol)) continue;
    out.push({ symbol, name: m[2] ?? NAMES[symbol] ?? "" });
    if (out.length === MAX) break;
  }
  return out;
}

const SIGN: Format = { steps: { t: [0], o: ["", "+"] }, fallback: "" };
const ARROW: Format = { steps: { t: [0], o: ["trending-down", "trending-up"] } };
const ARROWS = ["trending-down", "trending-up"];
const SESSION: Format = { map: { k: ["regular", "pre-market", "post-market"], o: ["Open", "Pre-market", "After hours"] }, fallback: "Closed" };

/** Prices come in dollars; in another currency they are multiplied by today's rate on the panel. */
interface Money {
  sign: string;
  format: Format;
  /** The worst cases to lay out for: values arrive after drawing. */
  widest: string;
  widestChange: string;
}

/** Rough rates for the preview's sample prices, before the real one is fetched. */
const SAMPLE_RATES: Record<string, number> = { eur: 0.89, gbp: 0.75, try: 49.5, chf: 0.8, jpy: 150 };

const currencyOf = (s: Settings): Currency => CURRENCIES.find((c) => c.value === s.currency) ?? CURRENCIES.find((c) => c.value === "usd")!;

function moneyOf(s: Settings): Money {
  const c = currencyOf(s);
  const converts = c.value !== "usd";
  // A lira or a yen is worth so little that prices grow two or three digits.
  const whole = c.value === "try" || c.value === "jpy" ? "888,888" : "88,888";
  const cents = c.decimals ? `.${"8".repeat(c.decimals)}` : "";
  return {
    sign: c.sign,
    format: { ...(converts ? { times: "fx/rate" } : {}), num: { d: c.decimals, sep: "," } },
    widest: `${c.sign}${whole}${cents}`,
    widestChange: `+${whole.slice(-3)}${cents} (+88.88%)`,
  };
}

/** Plausible prices and moves for the preview, before anything is fetched. */
const SAMPLES: Record<string, [number, number]> = {
  AAPL: [343.46, 1.46], MSFT: [512.3, -4.12], NVDA: [187.25, 3.48], AMZN: [221.84, -0.92], GOOGL: [176.05, 1.11],
};

type Layout ="auto" | "list" | "tiles" | "single";

interface Settings extends Record<string, unknown> {
  symbols: string[];
  layout: Layout;
  names: boolean;
  /** "usd", or a currency the prices are converted to. */
  currency: string;
}

/** Quote `i`'s value keys. */
const q = (i: number, key: string) => `q${i}/${key}`;
/** A price that came in and is recent: show it. Finnhub answers an unknown symbol with zeros. */
const live = (i: number): Condition => ({ all: [{ v: q(i, "c"), op: "gt", x: 0 }, { v: q(i, "_age"), op: "le", x: STALE }] });
const unknown = (i: number): Condition => ({ all: [{ v: q(i, "c"), op: "eq", x: 0 }, { v: q(i, "_ok"), op: "true" }] });

function price(d: Draw, i: number, m: Money) {
  return [m.sign, d.value(q(i, "c"), m.format)];
}

function change(d: Draw, i: number, m: Money, percentOnly = false) {
  const pct = [d.value(q(i, "dp"), SIGN), d.value(q(i, "dp"), { num: { d: 2 } }), "%"];
  return percentOnly ? pct : [d.value(q(i, "d"), SIGN), d.value(q(i, "d"), m.format), " (", ...pct, ")"];
}

/** Draws `fn` while quote `i` is good; otherwise a dash, or a word that the symbol is wrong. */
function quoted(d: Draw, i: number, box: Box, size: number, align: "left" | "right" | "center", fn: () => void) {
  d.when(live(i), fn);
  d.when({ all: [{ not: live(i) }, { not: unknown(i) }] }, () => d.text("–", { ...box, size, align, valign: "middle" }));
  d.when(unknown(i), () => d.text("Unknown symbol", { ...box, size: Math.max(12, Math.round(size * 0.6)), align, valign: "middle" }));
}

/** "Nasdaq" and, on the right, whether it is open and when the newest price is from. */
function header(d: Draw, box: Box) {
  const size = d.fit(["Nasdaq", "After hours · Wed 22:00"], Math.round(box.w * 0.6), box.h, { min: 12, max: 20 });
  d.text("Nasdaq", { ...box, size, weight: 700, valign: "middle" });
  d.when({ v: "mkt/_age", op: "present" }, () => {
    d.text([d.value("mkt/session", SESSION), d.value(q(0, "t"), { time: "[ · ]ddd HH:mm", fallback: "" })], { ...box, size, align: "right", valign: "middle" });
  });
  d.line(box.x, box.y + box.h + 3, box.x + box.w, box.y + box.h + 3);
}

/** One row a symbol: who on the left, an arrow, then the price over its change on the right. */
function list(d: Draw, stocks: Stock[], s: Settings, m: Money) {
  const headH = Math.max(18, Math.min(32, Math.round(d.height * 0.12)));
  header(d, { x: 0, y: 0, w: d.width, h: headH });
  const top = headH + 8;
  const rowH = Math.floor((d.height - top) / stocks.length);
  const named = s.names !== false && stocks.some((x) => x.name) && rowH >= 34;
  const big = d.fit([m.widest], Math.round(d.width * 0.4), named ? Math.round(rowH * 0.55) : rowH - 4, { weight: 700, min: 12, max: 40 });
  const small = Math.max(12, Math.min(20, Math.round(big * 0.6)));
  const right = Math.max(d.measure(m.widest, big, 700), d.measure(m.widestChange, small));
  const bigH = d.lineHeight(big, 700);
  const smallH = d.lineHeight(small);
  const block = named ? bigH + smallH : bigH;
  stocks.forEach((st, i) => {
    const y = top + i * rowH;
    const by = y + Math.floor((rowH - block) / 2);
    const left = { x: 0, w: d.width - right - bigH - 8 };
    d.text(st.symbol, { ...left, y: by, h: bigH, size: big, weight: 700 });
    if (named) d.text(st.name, { ...left, y: by + bigH, h: smallH, size: small });
    const col = { x: d.width - right, w: right };
    quoted(d, i, { ...col, y, h: rowH }, big, "right", () => {
      d.iconFor(q(i, "dp"), ARROW, ARROWS, { x: d.width - right - bigH - 4, y: y + Math.floor((rowH - bigH) / 2), w: bigH, h: bigH });
      d.text(price(d, i, m), { ...col, y: by, h: bigH, size: big, weight: 700, align: "right" });
      if (named) d.text(change(d, i, m), { ...col, y: by + bigH, h: smallH, size: small, align: "right" });
    });
    if (i < stocks.length - 1) d.line(0, y + rowH, d.width, y + rowH);
  });
}

/** Side by side: each symbol a column. */
function tiles(d: Draw, stocks: Stock[], m: Money) {
  const headH = Math.max(18, Math.min(28, Math.round(d.height * 0.2)));
  header(d, { x: 0, y: 0, w: d.width, h: headH });
  const top = headH + 10;
  const gap = 12;
  const colW = Math.floor((d.width - gap * (stocks.length - 1)) / stocks.length);
  const h = d.height - top;
  const big = d.fit([m.widest], colW, Math.round(h * 0.42), { weight: 700, min: 12, max: 48 });
  const small = Math.max(12, Math.min(24, Math.round(big * 0.62)));
  const smallH = d.lineHeight(small);
  const bigH = d.lineHeight(big, 700);
  stocks.forEach((st, i) => {
    const x = i * (colW + gap);
    d.text(st.symbol, { x, y: top, w: colW, h: smallH, size: small, weight: 700 });
    const py = top + smallH + 2;
    quoted(d, i, { x, y: py, w: colW, h: bigH }, big, "left", () => {
      d.text(price(d, i, m), { x, y: py, w: colW, h: bigH, size: big, weight: 700 });
      const cy = py + bigH + 2;
      d.iconFor(q(i, "dp"), ARROW, ARROWS, { x, y: cy, w: smallH, h: smallH });
      d.text(change(d, i, m, true), { x: x + smallH + 4, y: cy, w: colW - smallH - 4, h: smallH, size: small });
    });
    if (i < stocks.length - 1) d.line(x + colW + gap / 2, top, x + colW + gap / 2, d.height);
  });
}

/** One symbol, large: the price, how it moved, and the day's range. */
function single(d: Draw, st: Stock, m: Money) {
  const W = d.width, H = d.height;
  const headH = Math.max(16, Math.round(H * 0.18));
  const headSize = d.fit([`${st.symbol}  ${st.name}`], W, headH, { min: 12, max: 28 });
  d.text([st.symbol, st.name ? `  ${st.name}` : ""], { x: 0, y: 0, w: W, h: headH, size: headSize, weight: 700, valign: "middle" });
  const big = d.fit([m.widest], W, Math.round(H * 0.42), { weight: 700, max: 96 });
  const bigH = d.lineHeight(big, 700);
  const small = Math.max(12, Math.min(28, Math.round(big * 0.34)));
  const smallH = d.lineHeight(small);
  const py = headH + Math.max(0, Math.floor((H - headH - bigH - 2 * smallH - 8) / 2));
  quoted(d, 0, { x: 0, y: py, w: W, h: bigH }, big, "left", () => {
    d.text(price(d, 0, m), { x: 0, y: py, w: W, h: bigH, size: big, weight: 700 });
    const cy = py + bigH + 2;
    d.iconFor(q(0, "dp"), ARROW, ARROWS, { x: 0, y: cy, w: smallH, h: smallH });
    d.text(change(d, 0, m), { x: smallH + 6, y: cy, w: W - smallH - 6, h: smallH, size: small });
    if (H - (cy + smallH) >= smallH + 6) {
      d.text(["Day ", m.sign, d.value(q(0, "l"), m.format), " – ", m.sign, d.value(q(0, "h"), m.format), "   Prev. ", m.sign, d.value(q(0, "pc"), m.format)],
        { x: 0, y: cy + smallH + 6, w: W, h: smallH, size: Math.max(12, small - 4) });
    }
  });
}

function placeholder(d: Draw, text: string) {
  d.icon("trending-up", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
  d.text(text, { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit([text], d.width, 40, { max: 24 }), align: "center" });
}

export default defineExtension<Settings>({
  id: "stocks",
  name: "Stocks",
  description: "Up to five share prices and how they moved today, from Finnhub, every five minutes.",
  icon: "trending-up",
  category: "data",
  requires: ["finnhub"],
  size: { min: [4, 2], default: [10, 6] },
  fields: [
    {
      key: "symbols", label: "Symbols", kind: "list", placeholder: "AAPL",
      help: "Up to five, one per line, from the US exchanges (Nasdaq and NYSE). Add a name after the symbol to label one Dither does not know: “ASTS AST SpaceMobile”.",
    },
    {
      key: "layout", label: "Look", kind: "select", options: [
        { value: "auto", label: "Whatever suits the size" },
        { value: "list", label: "List — a row each" },
        { value: "tiles", label: "Tiles — side by side" },
        { value: "single", label: "Single — the first one, large" },
      ],
    },
    { key: "names", label: "Company names", kind: "toggle", visible: (s) => s.layout !== "tiles" },
    {
      key: "currency", label: "Show prices in", kind: "select",
      options: CURRENCIES.map(({ value, label }) => ({ value, label: value === "usd" ? label : `${label}, converted` })),
      help: "Converted at the day's European Central Bank rate, which the panel fetches itself.",
    },
  ],
  defaults: () => ({ symbols: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"], layout: "auto", names: true, currency: "usd" }),
  example: { symbols: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"] },
  title: (s) => {
    const stocks = stocksOf(s.symbols ?? []);
    return stocks.length ? `Stocks · ${stocks.map((x) => x.symbol).join(", ")}` : "Stocks";
  },
  source(s, env) {
    const key = env.accounts.finnhub?.key.trim() ?? "";
    const stocks = stocksOf(s.symbols ?? []);
    if (!key || stocks.length === 0) return null;
    const out: Record<string, SourceSpec> = {};
    stocks.forEach((st, i) => {
      out[`q${i}`] = {
        url: finnhubUrl(`quote?symbol=${encodeURIComponent(st.symbol)}`, key),
        every: 5,
        values: { c: "c", d: "d", dp: "dp", h: "h", l: "l", pc: "pc", t: "t" },
      };
    });
    if (currencyOf(s).value !== "usd") out.fx = rateSource("usd", currencyOf(s).value);
    out.mkt = { url: finnhubUrl("stock/market-status?exchange=US", key), every: 15, values: { open: "isOpen", session: "session" } };
    return out;
  },
  sample: (s) => {
    const now = Math.floor(Date.now() / 1000);
    const out: Record<string, number | string | boolean> = { "mkt/open": true, "mkt/session": "regular" };
    if (currencyOf(s).value !== "usd") out["fx/rate"] = SAMPLE_RATES[currencyOf(s).value] ?? 1;
    stocksOf(s.symbols ?? []).forEach(({ symbol }, i) => {
      // By symbol, so two widgets showing one agree.
      const [c, d] = SAMPLES[symbol] ?? [100, 0.5];
      const pc = c - d;
      Object.assign(out, {
        [q(i, "c")]: c, [q(i, "d")]: d, [q(i, "dp")]: Math.round((d / pc) * 10000) / 100,
        [q(i, "h")]: Math.round(c * 101.3) / 100, [q(i, "l")]: Math.round(c * 98.9) / 100, [q(i, "pc")]: pc, [q(i, "t")]: now - 60,
      });
    });
    return out;
  },
  facts: (s) => [
    { key: "open", label: "Nasdaq open", type: "boolean", value: "mkt/open" },
    ...stocksOf(s.symbols ?? []).flatMap((st, i): Fact[] => [
      {
        key: `price${i}`, label: `${st.symbol} price`, type: "number", value: q(i, "c"), unit: ` ${currencyOf(s).value.toUpperCase()}`,
        ...(currencyOf(s).value !== "usd" ? { format: { times: "fx/rate" } } : {}),
      },
      { key: `change${i}`, label: `${st.symbol} change today`, type: "number", value: q(i, "dp"), unit: "%" },
    ]),
  ],
  draw(d, s, env) {
    if (!env.accounts.finnhub?.key.trim()) return placeholder(d, "Connect Finnhub in Panel settings");
    const stocks = stocksOf(s.symbols ?? []);
    if (stocks.length === 0) return placeholder(d, "Add a symbol in its settings");
    const layout = s.layout !== "auto" ? s.layout
      : stocks.length === 1 ? "single"
      : d.width >= d.height * 3 ? "tiles"
      : d.height < 110 ? "single" : "list";
    const m = moneyOf(s);
    if (layout === "single") return single(d, stocks[0], m);
    if (layout === "tiles") return tiles(d, stocks, m);
    list(d, stocks, s, m);
  },
});
