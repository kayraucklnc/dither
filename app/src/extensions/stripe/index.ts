import type { Condition, Format, Part } from "@/runtime/types";
import { defineExtension, type Draw, type SourceSpec } from "../api";

// Stripe counts in minor units, and a few currencies have none: divide yen by
// a hundred and every figure is wrong by two orders of magnitude.
const CURRENCIES = [
  { value: "eur", label: "Euro", sign: "€", decimals: 2 },
  { value: "usd", label: "US dollar", sign: "$", decimals: 2 },
  { value: "gbp", label: "Pound", sign: "£", decimals: 2 },
  { value: "try", label: "Turkish lira", sign: "₺", decimals: 2 },
  { value: "chf", label: "Swiss franc", sign: "CHF ", decimals: 2 },
  { value: "jpy", label: "Yen", sign: "¥", decimals: 0 },
];

const DAY = 86400;
/** A period: where it starts, and the equal stretch before it to compare with. */
const PERIODS = [
  { value: "today", label: "Today", since: "{{today}}", before: "{{today-86400}}", vs: "yesterday" },
  { value: "week", label: "Last 7 days", since: `{{today-${6 * DAY}}}`, before: `{{today-${13 * DAY}}}`, vs: "the 7 days before" },
  { value: "month", label: "Last 30 days", since: `{{today-${29 * DAY}}}`, before: `{{today-${59 * DAY}}}`, vs: "the 30 days before" },
];
const CHARTS = [
  { value: "hours", label: "Today, hour by hour", since: "{{today}}", by: "hour" as const, count: 24, from: "00:00", to: "23:00" },
  { value: "week", label: "The last 7 days", since: `{{today-${6 * DAY}}}`, by: "day" as const, count: 7, from: "7 days ago", to: "Today" },
  { value: "month", label: "The last 30 days", since: `{{today-${29 * DAY}}}`, by: "day" as const, count: 30, from: "30 days ago", to: "Today" },
];
const RECENT = 6;

export const isStripeKey = (key: string) => /^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(key);

interface Settings extends Record<string, unknown> {
  style: "auto" | "figure" | "graph" | "board" | "ledger" | "payments";
  period: string;
  chart: "auto" | "hours" | "week" | "month";
  line: "curve" | "curve-line" | "area" | "line" | "steps";
  currency: string;
  heading: string;
  compare: boolean;
  compact: boolean;
  names: boolean;
}

const currencyOf = (s: Settings) => CURRENCIES.find((c) => c.value === s.currency) ?? CURRENCIES[0];
const periodOf = (s: Settings) => PERIODS.find((p) => p.value === s.period) ?? PERIODS[0];
const chartOf = (s: Settings) => {
  const v = s.chart === "auto" ? (s.period === "today" ? "hours" : s.period === "week" ? "week" : "month") : s.chart;
  return CHARTS.find((c) => c.value === v) ?? CHARTS[0];
};
const scaleOf = (s: Settings) => (currencyOf(s).decimals ? 1 / 10 ** currencyOf(s).decimals : 1);
const money = (s: Settings, d?: number, compact = s.compact): Format =>
  ({ scale: scaleOf(s), num: { d: d ?? currencyOf(s).decimals, sep: ",", compact } });

/** Succeeded charges in a window, from Stripe's search — charges carry the customer's name. */
function search(from: string, until?: string): string {
  const q = `status:'succeeded' AND created>=${from}${until ? ` AND created<${until}` : ""}`;
  // Placeholders must survive encoding: encode around them.
  const encoded = q.split(/(\{\{[^}]+\}\})/).map((part) => (part.startsWith("{{") ? part : encodeURIComponent(part))).join("");
  return `https://api.stripe.com/v1/charges/search?limit=100&query=${encoded}`;
}

function sources(s: Settings, key: string): Record<string, SourceSpec> {
  const auth: [string, string][] = [["Authorization", `Bearer ${key}`]];
  const p = periodOf(s);
  const c = chartOf(s);
  const recent = Object.fromEntries(Array.from({ length: RECENT }, (_, i) => [
    [`a${i}`, `data.${i}.amount`],
    [`t${i}`, `data.${i}.created`],
    [`n${i}`, `data.${i}.billing_details.name`],
    [`d${i}`, `data.${i}.description`],
  ]).flat());
  const out: Record<string, SourceSpec> = {
    now: {
      url: search(p.since), headers: auth, every: p.value === "today" ? 15 : 30,
      values: { total: { path: "data", agg: "sum", field: "amount" }, count: { path: "data", agg: "count" }, more: "has_more", ...recent },
    },
    chart: {
      url: search(c.since), headers: auth, every: 30,
      values: { series: { path: "data", agg: "buckets", field: "amount", time: "created", by: c.by, count: c.count } },
    },
  };
  if (s.compare) out.before = { url: search(p.before, p.since), headers: auth, every: 60, values: { total: { path: "data", agg: "sum", field: "amount" } } };
  if (s.style === "ledger") {
    for (const q of PERIODS) out[`p_${q.value}`] = { url: search(q.since), headers: auth, every: 30, values: { total: { path: "data", agg: "sum", field: "amount" }, count: { path: "data", agg: "count" } } };
  }
  return out;
}

// --------------------------------------------------------------- pieces

function at(d: Draw, content: string | Part | (string | Part)[], x: number, baseline: number, w: number, size: number, weight: 400 | 700, opts: { white?: boolean; align?: "left" | "right" | "center" } = {}) {
  const m = d.metrics(size, weight);
  d.text(content, { x, y: baseline - m.ascent, w, h: m.lineHeight, size, weight, ...opts });
}

const up: Condition = { v: "now/total", op: "gt", vs: "before/total" };
const down: Condition = { v: "now/total", op: "lt", vs: "before/total" };

/** The period's total, as large as the box allows, with where it came from beneath. */
function figure(d: Draw, s: Settings, x: number, y: number, w: number, h: number) {
  const c = currencyOf(s);
  const label = s.heading || periodOf(s).label;
  const labelSize = Math.max(14, Math.min(24, Math.round(h * 0.14)));
  const lm = d.metrics(labelSize, 700);
  at(d, label, x, y + lm.ascent, w * 0.6, labelSize, 700);
  at(d, [d.value("now/count", { num: { d: 0 }, fallback: "0" }), " payments"], x + w * 0.4, y + lm.ascent, w * 0.6, labelSize, 400, { align: "right" });

  const subH = s.compare ? d.metrics(labelSize).lineHeight + 4 : 0;
  const room = h - lm.lineHeight - subH - 4;
  const big = d.fit([s.compact ? `${c.sign}888.8k+` : `${c.sign}88,888+`], w, room, { weight: 700, max: 128 });
  // Digits stop short of the font's ascent; the figure sits on the line above the comparison.
  const base = y + lm.lineHeight + Math.round((room + big * 0.73) / 2);
  at(d, [c.sign, d.value("now/total", money(s, 0))], x, base, w, big, 700);
  // A full page of payments: the figure is a floor, and says so.
  d.when({ v: "now/more", op: "true" }, () => at(d, "+", x, base, w, Math.round(big * 0.6), 700, { align: "right" }));

  if (s.compare) {
    const sy = y + h - Math.round(labelSize * 0.25);
    const icon = Math.round(labelSize * 1.2);
    d.when(up, () => d.icon("trending-up", { x, y: sy - icon + 2, w: icon, h: icon }));
    d.when(down, () => d.icon("trending-down", { x, y: sy - icon + 2, w: icon, h: icon }));
    at(d, ["vs ", c.sign, d.value("before/total", money(s, 0)), ` ${periodOf(s).vs}`], x + icon + 6, sy, w - icon - 6, labelSize, 400);
  }
}

/** Money over time: a line over a dithered ramp, with where it starts and ends. */
function graph(d: Draw, s: Settings, x: number, y: number, w: number, h: number) {
  const ch = chartOf(s);
  const small = Math.max(13, Math.min(16, Math.round(h * 0.08)));
  const axisH = d.metrics(small).lineHeight + 4;
  const plotH = h - axisH;
  // Curved still passes through every figure; only the shape between two of them is drawn in.
  const smooth = s.line === "curve" || s.line === "curve-line";
  const kind = s.line === "curve" ? "area" : s.line === "curve-line" ? "line" : s.line;
  d.chart({ x, y, w, h: plotH }, "chart/series", { kind, min: 0, width: 2, smooth });
  d.line(x, y + plotH, x + w, y + plotH, { width: 1 });
  at(d, ch.from, x, y + h - 2, w / 2, small, 400);
  at(d, ch.to, x + w / 2, y + h - 2, w / 2, small, 400, { align: "right" });
}

/** The latest payments: when, who or what, how much. */
function payments(d: Draw, s: Settings, x: number, y: number, w: number, h: number) {
  const c = currencyOf(s);
  const rows = Math.max(1, Math.min(RECENT, Math.floor(h / 30)));
  const rowH = Math.floor(h / rows);
  const size = Math.max(14, Math.min(24, Math.round(rowH * 0.46), d.fit([`88:88  Ayşe Kaya, Pro plan  ${c.sign}8,888.88`], w, rowH)));
  const amountW = d.measure(`${c.sign}8,888.88`, size, 700) + 4;
  const timeW = d.measure("88:88", size, 700) + Math.round(size * 0.7);
  for (let i = 0; i < rows; i++) {
    const ry = y + i * rowH;
    const base = ry + Math.round((rowH + size * 0.73) / 2);
    d.when({ v: `now/a${i}`, op: "present" }, () => {
      if (i > 0) d.line(x, ry, x + w, ry, { width: 1 });
      // Today's payments by the hour; older ones by the day.
      d.when({ v: `now/t${i}`, f: { days: true }, op: "eq", x: 0 }, () => at(d, d.value(`now/t${i}`, { time: "HH:mm" }), x, base, timeW, size, 700));
      d.when({ v: `now/t${i}`, f: { days: true }, op: "ne", x: 0 }, () => at(d, d.value(`now/t${i}`, { time: "ddd D" }), x, base, timeW, Math.max(13, size - 4), 700));
      const what: Part[] = s.names
        ? [d.value(`now/n${i}`, { fallback: "" })]
        : [d.value(`now/d${i}`, { fallback: "Payment" })];
      if (s.names) {
        // A name when Stripe has one, the description when not.
        d.when({ v: `now/n${i}`, op: "present" }, () => at(d, what, x + timeW, base, w - timeW - amountW, size, 400));
        d.when({ v: `now/n${i}`, op: "absent" }, () => at(d, d.value(`now/d${i}`, { fallback: "Payment" }), x + timeW, base, w - timeW - amountW, size, 400));
      } else at(d, what, x + timeW, base, w - timeW - amountW, size, 400);
      at(d, [c.sign, d.value(`now/a${i}`, money(s, undefined, false))], x + w - amountW, base, amountW, size, 700, { align: "right" });
    });
  }
}

/** Every period at once: a row each, the totals lined up. */
function ledger(d: Draw, s: Settings) {
  const c = currencyOf(s);
  const rowH = Math.floor(d.height / PERIODS.length);
  const size = Math.max(16, Math.min(56, Math.round(rowH * 0.42)));
  const label = Math.max(14, Math.round(size * 0.45));
  PERIODS.forEach((p, i) => {
    const y = i * rowH;
    if (i > 0) d.line(0, y, d.width, y, { width: 1 });
    const base = y + Math.round((rowH + size * 0.73) / 2);
    at(d, p.label, 0, base - Math.round(size * 0.45), d.width * 0.45, label, 700);
    at(d, [d.value(`p_${p.value}/count`, { num: { d: 0 }, fallback: "0" }), " payments"], 0, base + Math.round(label * 0.2), d.width * 0.45, label, 400);
    at(d, [c.sign, d.value(`p_${p.value}/total`, money(s, 0))], d.width * 0.4, base, d.width * 0.6, size, 700, { align: "right" });
  });
}

function placeholder(d: Draw) {
  d.icon("chart-line", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
  d.text("Connect Stripe in Panel settings", { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit(["Connect Stripe in Panel"], d.width, 40, { max: 24 }), align: "center" });
}

export default defineExtension<Settings>({
  id: "stripe",
  name: "Revenue (Stripe)",
  description: "What came in, how it moved, who paid. A figure, a graph, a ledger or a board.",
  icon: "chart-line",
  category: "data",
  requires: ["stripe"],
  size: { min: [3, 2], default: [10, 7] },
  fields: [
    {
      key: "style", label: "Look", kind: "select",
      options: [
        { value: "auto", label: "Whatever suits the size" },
        { value: "figure", label: "Figure — one big number" },
        { value: "graph", label: "Graph — the number and a line" },
        { value: "board", label: "Board — number, line and payments" },
        { value: "ledger", label: "Ledger — today, 7 and 30 days" },
        { value: "payments", label: "Payments — the latest, listed" },
      ],
    },
    { key: "period", label: "Period", kind: "select", options: PERIODS.map(({ value, label }) => ({ value, label })), visible: (s) => s.style !== "ledger" },
    {
      key: "chart", label: "Graph shows", kind: "select",
      options: [{ value: "auto", label: "Whatever suits the period" }, ...CHARTS.map(({ value, label }) => ({ value, label }))],
      visible: (s) => ["auto", "graph", "board"].includes(String(s.style)),
    },
    {
      key: "line", label: "Line", kind: "select",
      options: [
        { value: "curve", label: "Curved and shaded" },
        { value: "curve-line", label: "Curved line" },
        { value: "area", label: "Straight and shaded" },
        { value: "line", label: "Straight line" },
        { value: "steps", label: "Steps, a block per day" },
      ],
      visible: (s) => ["auto", "graph", "board"].includes(String(s.style)),
    },
    { key: "compare", label: "Compare with the period before", kind: "toggle", visible: (s) => s.style !== "ledger" && s.style !== "payments" },
    { key: "names", label: "Show customers' names", kind: "toggle", help: "Off, payments show what was bought.", visible: (s) => ["auto", "board", "payments"].includes(String(s.style)) },
    { key: "compact", label: "Shorten large numbers", kind: "toggle", help: "74,120 becomes 74.1k." },
    { key: "heading", label: "Heading", kind: "text", placeholder: "Left empty, the period names it" },
    { key: "currency", label: "Currency", kind: "select", options: CURRENCIES.map(({ value, label }) => ({ value, label })) },
  ],
  defaults: () => ({ style: "auto", period: "today", chart: "auto", line: "curve", currency: "eur", heading: "", compare: true, compact: false, names: false }),
  title: (s) => `Revenue, ${periodOf(s).label.toLowerCase()}`,
  source(s, env) {
    const key = env.accounts.stripe?.key.trim() ?? "";
    return isStripeKey(key) ? sources(s, key) : null;
  },
  sample: (s) => {
    const now = Math.floor(Date.now() / 1000);
    const cents = currencyOf(s).decimals ? 100 : 1;
    const day = [0, 0, 0, 0, 0, 0, 1, 2, 4, 9, 14, 11, 8, 12, 16, 13, 9, 7, 10, 6, 3, 2, 1, 0];
    const month = [210, 260, 190, 320, 280, 150, 120, 300, 340, 310, 290, 360, 200, 180, 380, 410, 350, 330, 420, 260, 240, 450, 480, 400, 390, 470, 300, 280, 520, 560];
    const series = chartOf(s).by === "hour" ? day.map((x) => x * 4900) : month.slice(-chartOf(s).count).map((x) => x * cents * 10);
    const recent: [number, number, string | null, string][] = [
      [4900, 600, "Ayşe Kaya", "Pro plan"], [12900, 3000, "Deniz Aydın", "Team plan, annual"], [1900, 7400, null, "Starter"],
      [4900, 9800, "Marco Rossi", "Pro plan"], [29900, 14400, "Studio Nord", "Agency plan"], [4900, 90000, "Lena Vogel", "Pro plan"],
    ];
    const out: Record<string, string | number | boolean | number[] | null> = {
      "now/total": 128450 * (cents === 1 ? 0.01 : 1), "now/count": 23, "now/more": false,
      "before/total": 98000 * (cents === 1 ? 0.01 : 1), "chart/series": series,
    };
    recent.forEach(([a, ago, name, what], i) => Object.assign(out, { [`now/a${i}`]: a, [`now/t${i}`]: now - ago, [`now/n${i}`]: name, [`now/d${i}`]: what }));
    for (const [p, total, count] of [["today", 128450, 23], ["week", 812300, 141], ["month", 3402100, 588]] as const) {
      Object.assign(out, { [`p_${p}/total`]: total, [`p_${p}/count`]: count });
    }
    return out;
  },
  facts: (s) => [
    { key: "amount", label: `Revenue, ${periodOf(s).label.toLowerCase()}`, type: "number", value: "now/total", unit: ` ${s.currency.toUpperCase()}`, format: { scale: scaleOf(s) } },
    { key: "count", label: `Payments, ${periodOf(s).label.toLowerCase()}`, type: "number", value: "now/count" },
    ...(s.compare ? [{ key: "up", label: "Ahead of the period before", type: "flag" as const, test: up }] : []),
  ],
  draw(d, s, env) {
    if (!isStripeKey(env.accounts.stripe?.key.trim() ?? "")) return placeholder(d);
    const style = s.style !== "auto" ? s.style
      : d.height < 150 || d.width < 260 ? "figure"
      : d.height >= 300 ? "board" : "graph";
    if (style === "ledger") return ledger(d, s);
    if (style === "figure") return figure(d, s, 0, 0, d.width, d.height);
    if (style === "payments") {
      const head = Math.max(48, Math.round(d.height * 0.22));
      figure(d, { ...s, compare: false }, 0, 0, d.width, head);
      d.line(0, head + 6, d.width, head + 6, { width: 2 });
      return payments(d, s, 0, head + 12, d.width, d.height - head - 12);
    }
    if (style === "graph") {
      const head = Math.round(d.height * 0.42);
      figure(d, s, 0, 0, d.width, head);
      return graph(d, s, 0, head + 12, d.width, d.height - head - 12);
    }
    // Board: side by side when wide — the figure and graph, the payments beside them.
    if (d.width >= d.height * 1.4) {
      const left = Math.round(d.width * 0.58);
      const head = Math.round(d.height * 0.42);
      figure(d, s, 0, 0, left, head);
      graph(d, s, 0, head + 12, left, d.height - head - 12);
      d.line(left + 14, 0, left + 14, d.height, { width: 1 });
      return payments(d, s, left + 28, 0, d.width - left - 28, d.height);
    }
    const head = Math.round(d.height * 0.28);
    figure(d, s, 0, 0, d.width, head);
    graph(d, s, 0, head + 10, d.width, Math.round(d.height * 0.32));
    const py = head + 10 + Math.round(d.height * 0.32) + 12;
    payments(d, s, 0, py, d.width, d.height - py);
  },
});
