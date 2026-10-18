import type { Condition, Format, Part } from "@/runtime/types";
import { defineExtension, type Box, type Draw } from "../api";

// Your Claude Code usage: the plan's 5-hour and weekly limits, what you have
// spent, and the session you are in. Claude Code keeps these on your computer,
// so the panel reads them from tools/claude-code/bridge.mjs there — Claude
// Code's status line, which also serves them as one JSON file on your Wi-Fi.

/** The bridge's answer, kept under these names. */
const VALUES = {
  s5: "limits.session.used", r5: "limits.session.resets",
  s7: "limits.week.used", r7: "limits.week.resets",
  cost: "session.cost", tok: "session.tokens", ctx: "session.context", model: "session.model",
  proj: "session.project", add: "session.added", del: "session.removed", min: "session.minutes",
  today: "today.cost", todayTok: "today.tokens", todaySes: "today.sessions",
  week: "week.cost", weekTok: "week.tokens", weekSes: "week.sessions",
  upd: "updated",
} as const;
const DAYS = 7;

const MONEY: Format = { num: { d: 2, sep: "," } };
const WHOLE: Format = { num: { d: 0 } };
const TOKENS: Format = { num: { d: 0, compact: true } };
const UNTIL: Format = { until: true };

interface Settings extends Record<string, unknown> {
  url: string;
  every: number;
  tokens: boolean;
  session: boolean;
}

const addressOf = (s: Settings) => {
  const url = String(s.url ?? "").trim();
  return /^https?:\/\//.test(url) ? url : "";
};

function needsAddress(d: Draw) {
  d.icon("gauge", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
  const text = "Run the bridge, then enter its address";
  d.text(text, { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit(["Run the bridge, then"], d.width, 40, { max: 24 }), align: "center", wrap: true, lines: 2 });
}

/**
 * A limit: its name, a bar, how much is used, and when it starts again. A
 * window that has reset since the panel last heard says so; a plan without
 * limits (or a bridge that has not seen one yet) says that instead.
 */
function limit(d: Draw, key: "s5" | "s7", label: string, pattern: string, box: Box, size: number, small: number) {
  const r = key === "s5" ? "r5" : "r7";
  const lh = d.lineHeight(size, 700);
  const labelW = Math.max(d.measure("Session", size, 700), d.measure("Week", size, 700)) + 10;
  const pctW = d.measure("100%", size, 700) + 8;
  const line = { y: box.y, h: lh, size };
  d.text(label, { ...line, x: box.x, w: labelW, weight: 700 });
  d.when({ v: key, op: "absent" }, () => {
    d.text("No limit data", { ...line, x: box.x + labelW, w: box.w - labelW, size: Math.max(12, small), valign: "middle" });
  });
  d.when({ v: key, op: "present" }, () => {
    const barH = Math.max(8, Math.round(lh * 0.55));
    const bar = { x: box.x + labelW, y: box.y + Math.round((lh - barH) / 2), w: box.w - labelW - pctW, h: barH };
    d.rect(bar, { fill: false, stroke: 2 });
    d.bar({ x: bar.x + 3, y: bar.y + 3, w: bar.w - 6, h: bar.h - 6 }, key, 0, 100);
    d.text([d.value(key, WHOLE), "%"], { ...line, x: box.x + box.w - pctW, w: pctW, weight: 700, align: "right" });
    if (box.h < lh + d.lineHeight(small)) return;
    const reset = { x: bar.x, y: box.y + lh, w: box.w - labelW, h: d.lineHeight(small), size: small };
    const soon: Condition = { v: r, f: UNTIL, op: "lt", x: 60 };
    const later: Condition = { v: r, f: UNTIL, op: "ge", x: 60 };
    d.when(soon, () => d.text(["Resets in ", d.value(r, { ...UNTIL, ...WHOLE }), " min"], reset));
    d.when(later, () => d.text(["Resets ", d.value(r, { time: pattern })], reset));
    d.when({ all: [{ v: r, op: "present" }, { v: r, f: UNTIL, op: "absent" }] }, () => d.text(["Reset at ", d.value(r, { time: pattern })], reset));
  });
}

/** What a day is called under the graph: "Today", or the panel's own clock some days back. */
const dayName = (i: number): string | Part => {
  const ago = DAYS - 1 - i;
  return ago === 0 ? "Today" : { v: "clock.epoch", f: { add: -ago * 86400, time: "ddd" } };
};

/** Each of the last seven days' spend as a bar, its amount riding on it, its name beneath. */
function week(d: Draw, box: Box) {
  const small = Math.max(12, Math.min(16, Math.round(box.h * 0.09)));
  const sm = d.metrics(small, 700);
  const top = sm.lineHeight + 2 + 5 + 2;
  const plotH = box.h - top - (sm.lineHeight + 4);
  if (plotH < 24) return;
  const plotY = box.y + top;
  const figureW = d.measure("$888", small, 700) + 8;
  const every = Math.max(1, Math.ceil(figureW / Math.max(1, box.w / DAYS)));
  d.chart({ x: box.x, y: plotY, w: box.w, h: plotH }, "days", {
    kind: "bars", min: 0, gap: Math.max(2, Math.round(box.w / DAYS / 5)),
    labels: { size: small, weight: 700, every, before: "$", format: { ...WHOLE, fallback: "" } },
  });
  d.line(box.x, plotY + plotH, box.x + box.w, plotY + plotH, { width: 1 });
  const lw = Math.min(figureW, Math.floor(box.w / DAYS) + 8);
  for (let i = DAYS - 1; i >= 0; i -= every) {
    const px = box.x + Math.floor(((2 * i + 1) * box.w) / (2 * DAYS));
    const lx = Math.max(box.x, Math.min(box.x + box.w - lw, px - Math.round(lw / 2)));
    d.text(dayName(i), { x: lx, y: plotY + plotH + 3, w: lw, h: sm.lineHeight, size: small, weight: i === DAYS - 1 ? 700 : 400, align: "center" });
  }
}

/** Today's spend, large, and the last seven days' beneath it. */
function spend(d: Draw, s: Settings, box: Box) {
  const rows: (string | Part)[][] = [
    ["today", ...(s.tokens ? [" · ", d.value("todayTok", TOKENS), " tokens"] : [])],
    ["7 days $", d.value("week", MONEY), ...(s.tokens ? [" · ", d.value("weekTok", TOKENS)] : [])],
  ];
  const widest = s.tokens ? ["today · 888.8M tokens", "7 days $88,888.88 · 888.8M"] : ["7 days $88,888.88"];
  const small = d.fit(widest, box.w, Math.max(14, Math.round(box.h * 0.14)), { min: 12, max: 20 });
  const smallH = d.lineHeight(small);
  const big = d.fit(["$8,888.88"], box.w, box.h - rows.length * smallH - 4, { weight: 700, max: 72 });
  const bigH = d.lineHeight(big, 700);
  const y = box.y + Math.max(0, Math.floor((box.h - bigH - rows.length * smallH - 4) / 2));
  d.text(["$", d.value("today", MONEY)], { x: box.x, y, w: box.w, h: bigH, size: big, weight: 700 });
  rows.forEach((content, i) => d.text(content, { x: box.x, y: y + bigH + 4 + i * smallH, w: box.w, h: smallH, size: small }));
}

/** The session in hand: which model, where, then what it has cost and changed. */
function current(d: Draw, s: Settings, box: Box) {
  const figures = [
    "$", d.value("cost", MONEY), ...(s.tokens ? [" · ", d.value("tok", TOKENS), " tokens"] : []),
    " · ", d.value("ctx", WHOLE), "% context · +", d.value("add", WHOLE), " −", d.value("del", WHOLE), " · ", d.value("min", WHOLE), " min",
  ];
  const size = d.fit(["$888.88 · 888.8M tokens · 100% context · +88888 −88888 · 888 min"], box.w, Math.round(box.h / 2), { min: 12, max: 18 });
  const lh = d.lineHeight(size);
  d.when({ v: "cost", op: "absent" }, () => d.text("No session yet", { ...box, h: lh, size }));
  d.when({ v: "cost", op: "present" }, () => {
    d.text(["This session · ", d.value("model", { fallback: "Claude" }), " · ", d.value("proj", { fallback: "" })], { ...box, h: lh, size, weight: 700 });
    d.text(figures, { ...box, y: box.y + lh, h: lh, size });
  });
}

/** "Claude Code", and how fresh the figures are. */
function header(d: Draw, box: Box) {
  const size = d.fit(["Claude Code", "As of 88:88"], Math.round(box.w * 0.5), box.h, { min: 12, max: 24 });
  d.text("Claude Code", { ...box, size, weight: 700, valign: "middle" });
  d.when({ v: "upd", op: "present" }, () => d.text(["As of ", d.value("upd", { time: "HH:mm" })], { ...box, size, align: "right", valign: "middle" }));
  d.line(box.x, box.y + box.h + 3, box.x + box.w, box.y + box.h + 3);
}

/** Everything: the limits across the top, spend and the week's bars, the session at the bottom. */
function dashboard(d: Draw, s: Settings) {
  const W = d.width, H = d.height;
  const headH = Math.max(16, Math.min(28, Math.round(H * 0.08)));
  header(d, { x: 0, y: 0, w: W, h: headH });
  const size = Math.max(14, Math.min(26, Math.round(H * 0.065)));
  const small = Math.max(12, Math.min(18, Math.round(size * 0.7)));
  const rowH = d.lineHeight(size, 700) + d.lineHeight(small) + 4;
  let y = headH + 10;
  limit(d, "s5", "Session", "HH:mm", { x: 0, y, w: W, h: rowH }, size, small);
  limit(d, "s7", "Week", "ddd HH:mm", { x: 0, y: y + rowH, w: W, h: rowH }, size, small);
  y += 2 * rowH + 4;
  const footH = s.session ? 2 * d.lineHeight(Math.max(12, Math.min(18, small))) + 8 : 0;
  const midH = H - y - footH;
  const leftW = Math.round(W * 0.45);
  spend(d, s, { x: 0, y, w: leftW - 12, h: midH });
  week(d, { x: leftW, y: y + 4, w: W - leftW, h: midH - 4 });
  if (s.session) {
    d.line(0, H - footH + 2, W, H - footH + 2);
    current(d, s, { x: 0, y: H - footH + 6, w: W, h: footH - 6 });
  }
}

/** The two limits and today's spend. */
function compact(d: Draw) {
  const W = d.width, H = d.height;
  const size = Math.max(13, Math.min(24, Math.round(H * 0.14)));
  const small = Math.max(12, Math.round(size * 0.7));
  const rowH = d.lineHeight(size, 700) + d.lineHeight(small) + 2;
  const top = Math.max(0, Math.floor((H - 2 * rowH - d.lineHeight(size)) / 2));
  limit(d, "s5", "Session", "HH:mm", { x: 0, y: top, w: W, h: rowH }, size, small);
  limit(d, "s7", "Week", "ddd HH:mm", { x: 0, y: top + rowH, w: W, h: rowH }, size, small);
  d.text(["$", d.value("today", MONEY), " today · $", d.value("week", MONEY), " in 7 days"], { x: 0, y: top + 2 * rowH, w: W, h: d.lineHeight(size), size: small, valign: "middle" });
}

/** Only the 5-hour limit, as large as it goes. */
function single(d: Draw) {
  const size = Math.max(12, Math.min(40, Math.round(d.height * 0.36)));
  const small = Math.max(12, Math.round(size * 0.6));
  const h = d.lineHeight(size, 700) + d.lineHeight(small);
  limit(d, "s5", "Session", "HH:mm", { x: 0, y: Math.max(0, Math.floor((d.height - h) / 2)), w: d.width, h }, size, small);
}

export default defineExtension<Settings>({
  id: "claude-code",
  name: "Claude Code",
  description: "Your session and weekly limits, what you have spent, and the session you are in — from your own computer.",
  icon: "gauge",
  category: "data",
  size: { min: [5, 2], default: [12, 8] },
  fields: [
    {
      key: "url", label: "Bridge address", kind: "text", placeholder: "http://192.168.1.20:8787/usage.json",
      help: "Run “node tools/claude-code/bridge.mjs serve” on the computer you use Claude Code on, with the bridge as Claude Code's status line, and enter the address it prints. See the README.",
    },
    { key: "every", label: "Check every", kind: "number", min: 1, max: 60, unit: "min" },
    { key: "tokens", label: "Tokens", kind: "toggle" },
    { key: "session", label: "Current session", kind: "toggle" },
  ],
  defaults: () => ({ url: "", every: 5, tokens: true, session: true }),
  example: { url: "http://192.168.1.20:8787/usage.json" },
  title: () => "Claude Code",
  source(s) {
    const url = addressOf(s);
    if (!url) return null;
    return { url, every: Math.max(1, Number(s.every) || 5), values: { ...VALUES, days: { path: "days", count: DAYS } } };
  },
  sample: () => {
    const now = Math.floor(Date.now() / 1000);
    return {
      s5: 42, r5: now + 2 * 3600 + 14 * 60, s7: 61, r7: now + 3 * 86400 + 5 * 3600,
      cost: 3.21, tok: 4_820_000, ctx: 38, model: "Opus 5.5", proj: "dither", add: 214, del: 57, min: 48,
      today: 12.4, todayTok: 18_300_000, todaySes: 5, week: 48.2, weekTok: 71_900_000, weekSes: 21,
      days: [3.1, 0, 8.4, 11.2, 6, 7.1, 12.4], upd: now - 120,
    };
  },
  facts: () => [
    { key: "session", label: "Session limit used", type: "number", value: "s5", unit: "%" },
    { key: "week", label: "Weekly limit used", type: "number", value: "s7", unit: "%" },
    { key: "resets", label: "Minutes until the session limit resets", type: "number", value: "r5", unit: " min", format: UNTIL },
    { key: "today", label: "Spent on Claude Code today", type: "number", value: "today", unit: " USD" },
    { key: "limits", label: "Plan limits known", type: "flag", test: { v: "s5", op: "present" } },
  ],
  draw(d, s) {
    if (!addressOf(s)) return needsAddress(d);
    if (d.width >= 360 && d.height >= 220) return dashboard(d, s);
    if (d.width >= 200 && d.height >= 110) return compact(d);
    single(d);
  },
});
