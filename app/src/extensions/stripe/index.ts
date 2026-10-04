import type { Format } from "@/runtime/types";
import { defineExtension, type Draw } from "../api";

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

const PERIODS = [
  { value: "today", label: "Today", since: "{{today}}", every: 15 },
  { value: "week", label: "Last 7 days", since: "{{today-518400}}", every: 30 },
  { value: "month", label: "Last 30 days", since: "{{today-2505600}}", every: 60 },
];

const RECENT = 5;

export const isStripeKey = (key: string) => /^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(key);

interface Settings extends Record<string, unknown> {
  period: string;
  currency: string;
  measure: "gross" | "net";
}

const currencyOf = (s: Settings) => CURRENCIES.find((c) => c.value === s.currency) ?? CURRENCIES[0];
const periodOf = (s: Settings) => PERIODS.find((p) => p.value === s.period) ?? PERIODS[0];

/** Minor units to a printed amount, with the currency's own decimals. */
const money = (s: Settings, decimals?: number): Format => {
  const c = currencyOf(s);
  return { scale: c.decimals ? 1 / 10 ** c.decimals : 1, num: { d: decimals ?? c.decimals, sep: "," } };
};

/** The period's total, as a black band: what, how much, from how many payments. */
function band(d: Draw, s: Settings, h: number) {
  const c = currencyOf(s);
  d.rect({ x: 0, y: 0, w: d.width, h }, { radius: 8 });
  const pad = Math.round(Math.min(h * 0.12, 18));
  const labelSize = Math.max(14, Math.min(24, Math.round(h * 0.15), d.fit(["Last 30 days  888 payments"], d.width - pad * 2, h)));
  const labelM = d.metrics(labelSize);
  const top = pad;
  d.text(periodOf(s).label, { x: pad, y: top, w: d.width / 2, h: labelM.lineHeight, size: labelSize, white: true });
  d.text([d.value("count", { num: { d: 0 }, fallback: "0" }), " payments"], {
    x: d.width / 2, y: top, w: d.width / 2 - pad, h: labelM.lineHeight, size: labelSize, align: "right", white: true,
  });
  const room = h - pad * 2 - labelM.lineHeight;
  const big = d.fit([`${c.sign}88,888+`], d.width - pad * 2, room, { weight: 700, max: 128 });
  const m = d.metrics(big, 700);
  // Digits stop short of the font's ascent; sit the figure on the band's floor.
  const baseline = h - pad - Math.round(m.descent * 0.2);
  const y = baseline - m.ascent;
  // Whole units on the big line: cents at that size are noise.
  d.text([c.sign, d.value(s.measure, money(s, 0))], { x: pad, y, w: d.width - pad * 2, h: m.lineHeight, size: big, weight: 700, white: true });
  // More than one page of payments: the figure is a floor, and says so.
  d.when({ v: "more", op: "true" }, () =>
    d.text("+", { x: pad, y, w: d.width - pad * 2, h: m.lineHeight, size: big, weight: 700, align: "right", white: true }));
}

/** The latest payments, in the band's columns: when, what, how much. */
function recent(d: Draw, s: Settings, y: number, h: number) {
  const c = currencyOf(s);
  const rows = Math.max(1, Math.min(RECENT, Math.floor(h / 34)));
  const rowH = Math.floor(h / rows);
  // Sized so time, a plan name and the amount share a row without cutting the name.
  const size = Math.max(14, Math.min(26, Math.round(rowH * 0.46), d.fit([`88:88  Team plan, annual  ${c.sign}8,888.88`], d.width, rowH)));
  const amountW = d.measure(`${c.sign}8,888.88`, size, 700) + 4;
  const timeW = d.measure("88:88", size, 700) + Math.round(size * 0.7);
  for (let i = 0; i < rows; i++) {
    const ry = y + i * rowH;
    d.when({ v: `a${i}`, op: "present" }, () => {
      if (i > 0) d.line(0, ry, d.width, ry, { width: 1 });
      d.text(d.value(`t${i}`, { time: "HH:mm", fallback: "" }), { x: 0, y: ry, w: timeW, h: rowH, size, weight: 700, valign: "middle" });
      d.text(d.value(`n${i}`, { fallback: "Payment" }), { x: timeW, y: ry, w: d.width - timeW - amountW, h: rowH, size, valign: "middle" });
      d.text([c.sign, d.value(`a${i}`, money(s))], { x: d.width - amountW, y: ry, w: amountW, h: rowH, size, weight: 700, align: "right", valign: "middle" });
    });
  }
}

export default defineExtension<Settings>({
  id: "stripe",
  name: "Revenue (Stripe)",
  description: "What came in today, this week or this month, and the latest payments. Rules can react to it.",
  icon: "chart-line",
  category: "data",
  size: { min: [3, 2], default: [8, 6] },
  requires: ["stripe"],
  fields: [
    { key: "period", label: "Period", kind: "select", options: PERIODS.map(({ value, label }) => ({ value, label })) },
    {
      key: "measure", label: "Show", kind: "select",
      options: [{ value: "gross", label: "What customers paid" }, { value: "net", label: "What you keep, after fees" }],
    },
    { key: "currency", label: "Currency", kind: "select", options: CURRENCIES.map(({ value, label }) => ({ value, label })) },
  ],
  defaults: () => ({ period: "today", currency: "eur", measure: "gross" }),
  title: (s) => `Revenue, ${periodOf(s).label.toLowerCase()}`,
  source(s, env) {
    const key = env.accounts.stripe?.key.trim() ?? "";
    if (!isStripeKey(key)) return null;
    const p = periodOf(s);
    return {
      url: `https://api.stripe.com/v1/balance_transactions?limit=100&type=charge&created%5Bgte%5D=${p.since}`,
      headers: [["Authorization", `Bearer ${key}`]],
      every: p.every,
      values: {
        gross: { path: "data", agg: "sum", field: "amount" },
        net: { path: "data", agg: "sum", field: "net" },
        count: { path: "data", agg: "count" },
        more: "has_more",
        ...Object.fromEntries(Array.from({ length: RECENT }, (_, i) => [
          [`a${i}`, `data.${i}.amount`],
          [`t${i}`, `data.${i}.created`],
          [`n${i}`, `data.${i}.description`],
        ]).flat()),
      },
    };
  },
  sample: () => {
    const now = Math.floor(Date.now() / 1000);
    return {
      gross: 128450, net: 124310, count: 23, more: false,
      a0: 4900, t0: now - 600, n0: "Pro plan",
      a1: 12900, t1: now - 3000, n1: "Team plan, annual",
      a2: 1900, t2: now - 7400, n2: null,
      a3: 4900, t3: now - 9800, n3: "Pro plan",
      a4: 29900, t4: now - 14400, n4: "Agency plan",
    };
  },
  facts: (s) => [
    { key: "amount", label: `Revenue, ${periodOf(s).label.toLowerCase()}`, type: "number", value: s.measure === "net" ? "net" : "gross", unit: ` ${s.currency.toUpperCase()}`, format: { scale: currencyOf(s).decimals ? 1 / 10 ** currencyOf(s).decimals : 1 } },
    { key: "count", label: `Payments, ${periodOf(s).label.toLowerCase()}`, type: "number", value: "count" },
  ],
  draw(d, s, env) {
    if (!isStripeKey(env.accounts.stripe?.key.trim() ?? "")) {
      d.icon("chart-line", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
      d.text("Connect Stripe in Panel settings", { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit(["Connect Stripe in Panel"], d.width, 40, { max: 24 }), align: "center" });
      return;
    }
    if (d.height < 150) return band(d, s, d.height);
    const bandH = Math.round(Math.max(120, d.height * 0.42));
    band(d, s, bandH);
    recent(d, s, bandH + 6, d.height - bandH - 6);
  },
});
