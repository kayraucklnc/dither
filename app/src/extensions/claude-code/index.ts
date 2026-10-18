import type { Condition, Format, Part } from "@/runtime/types";
import { defineExtension, type Box, type Draw } from "../api";

// Your Claude Code usage: the plan's 5-hour and weekly limits, what you have
// spent, and the session you are in. Claude Code keeps these on your computer,
// so the panel reads them from a bridge there (app/public/claude-code/bridge.mjs) — Claude
// Code's status line, which also serves them as one JSON file on your Wi-Fi,
// with your plan and the all-time figures /stats shows.

/** The bridge's answer, kept under these names. */
const VALUES = {
  s5: "limits.session.used", r5: "limits.session.resets",
  s7: "limits.week.used", r7: "limits.week.resets",
  cost: "session.cost", tok: "session.tokens", ctx: "session.context", model: "session.model",
  add: "session.added", del: "session.removed", min: "session.minutes",
  today: "today.cost", todayTok: "today.tokens", todaySes: "today.sessions",
  week: "week.cost", weekTok: "week.tokens", weekSes: "week.sessions",
  upd: "updated", plan: "plan",
  sModel: "stats.model", sTok: "stats.tokens", sIn: "stats.input", sOut: "stats.output", sRead: "stats.cacheRead", sWrite: "stats.cacheWrite",
  sSes: "stats.sessions", sLong: "stats.longest", sAct: "stats.activeDays", sSpan: "stats.days", sBusy: "stats.busiest",
  sStreak: "stats.longestStreak", sCur: "stats.currentStreak", sWap: "stats.warAndPeace",
} as const;

const MONEY: Format = { num: { d: 2, sep: "," } };
const WHOLE: Format = { num: { d: 0 } };
const TOKENS: Format = { num: { d: 0, compact: true } };
const UNTIL: Format = { until: true };
const COUNT: Format = { num: { d: 0, sep: "," } };

interface Settings extends Record<string, unknown> {
  url: string;
  every: number;
  tokens: boolean;
  session: boolean;
  stats: boolean;
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

/** Today's spend and the last seven days', side by side, large, with their tokens beneath. */
function spend(d: Draw, s: Settings, box: Box) {
  const gap = 16;
  const colW = Math.floor((box.w - gap) / 2);
  const small = Math.max(12, Math.min(18, Math.round(box.h * 0.1)));
  const smallH = d.lineHeight(small);
  const lines = s.tokens ? 2 : 1;
  const big = d.fit(["$88,888.88"], colW, box.h - lines * smallH - 4, { weight: 700, max: 56 });
  const bigH = d.lineHeight(big, 700);
  const y = box.y + Math.max(0, Math.floor((box.h - bigH - lines * smallH - 4) / 2));
  const column = (x: number, label: string, money: string, tokens: string) => {
    d.text(label, { x, y, w: colW, h: smallH, size: small });
    d.text(["$", d.value(money, MONEY)], { x, y: y + smallH, w: colW, h: bigH, size: big, weight: 700 });
    if (s.tokens) d.text([d.value(tokens, TOKENS), " tokens"], { x, y: y + smallH + bigH + 4, w: colW, h: smallH, size: small });
  };
  column(box.x, "Today", "today", "todayTok");
  column(box.x + colW + gap, "Last 7 days", "week", "weekTok");
}

/** The session in hand: which model, then what it has cost and changed. */
function current(d: Draw, s: Settings, box: Box) {
  const figures = [
    "$", d.value("cost", MONEY), ...(s.tokens ? [" · ", d.value("tok", TOKENS), " tokens"] : []),
    " · ", d.value("ctx", WHOLE), "% context · +", d.value("add", WHOLE), " −", d.value("del", WHOLE), " · ", d.value("min", WHOLE), " min",
  ];
  const size = d.fit(["$888.88 · 888.8M tokens · 100% context · +88888 −88888 · 888 min"], box.w, Math.round(box.h / 2), { min: 12, max: 18 });
  const lh = d.lineHeight(size);
  d.when({ v: "cost", op: "absent" }, () => d.text("No session yet", { ...box, h: lh, size }));
  d.when({ v: "cost", op: "present" }, () => {
    d.text(["This session · ", d.value("model", { fallback: "Claude" })], { ...box, h: lh, size, weight: 700 });
    d.text(figures, { ...box, y: box.y + lh, h: lh, size });
  });
}

/** The rays of the spark: their lengths, as a share of its radius, going round. */
const RAYS = [1, 0.78, 0.94, 0.82, 0.98, 0.76, 0.92, 0.86, 1, 0.8, 0.9, 0.84];

/** A spark of tapering rays, after Claude's mark, drawn for the size it is shown at. */
function spark(d: Draw, box: Box) {
  const size = Math.min(box.w, box.h);
  const R = size / 2;
  const c = (size - 1) / 2;
  const rays = RAYS.map((len, i) => {
    const a = ((i * 30 + 8) * Math.PI) / 180;
    return { dx: Math.cos(a), dy: Math.sin(a), len: len * R };
  });
  d.bitmap({ x: box.x, y: box.y, w: size, h: size }, "claude-spark", (x, y) => {
    const px = x - c, py = y - c;
    if (px * px + py * py <= (R * 0.2) ** 2) return true;
    return rays.some(({ dx, dy, len }) => {
      const t = px * dx + py * dy;
      if (t < 0 || t > len) return false;
      // Wide at the middle, narrowing towards a rounded tip.
      const half = R * (0.13 - 0.07 * (t / len));
      return Math.abs(px * dy - py * dx) <= half;
    });
  });
}

/** The spark, "Claude Code" and the plan, and how fresh the figures are. */
function header(d: Draw, box: Box) {
  const size = d.fit(["Claude Code · Claude Enterprise", "As of 88:88"], Math.round(box.w * 0.6), box.h, { min: 12, max: 24 });
  const mark = Math.min(box.h, Math.round(d.lineHeight(size, 700) * 1.1));
  spark(d, { x: box.x, y: box.y + Math.floor((box.h - mark) / 2), w: mark, h: mark });
  const x = box.x + mark + Math.round(mark * 0.35);
  d.text("Claude Code", { ...box, x, w: box.w - x, size, weight: 700, valign: "middle" });
  const after = x + d.measure("Claude Code", size, 700);
  d.when({ v: "plan", op: "present" }, () => d.text([" · ", d.value("plan")], { ...box, x: after, w: Math.max(0, box.w - after - d.measure("As of 88:88", size)), size, valign: "middle" }));
  d.when({ v: "upd", op: "present" }, () => d.text(["As of ", d.value("upd", { time: "HH:mm" })], { ...box, size, align: "right", valign: "middle" }));
  d.line(box.x, box.y + box.h + 3, box.x + box.w, box.y + box.h + 3);
}

/** A figure under its name. */
function figure(d: Draw, label: string, value: (string | Part)[], box: Box, size: number, small: number) {
  d.text(label, { x: box.x, y: box.y, w: box.w, h: d.lineHeight(small), size: small });
  d.text(value, { x: box.x, y: box.y + d.lineHeight(small), w: box.w, h: d.lineHeight(size, 700), size, weight: 700 });
}

/** What /stats shows, from the start: eight figures, the tokens by kind, and a comparison. */
function allTime(d: Draw, box: Box) {
  const v = (key: string, f?: Format) => d.value(key, f);
  const head = Math.max(14, Math.min(20, Math.round(box.h * 0.055)));
  const headH = d.lineHeight(head, 700);
  d.text("All time", { x: box.x, y: box.y, w: box.w, h: headH, size: head, weight: 700 });
  const top = box.y + headH + 6;
  const h = box.y + box.h - top;
  d.when({ v: "sTok", op: "absent" }, () => {
    d.text("Claude Code's /stats figures show here once the bridge can read them.", { x: box.x, y: top, w: box.w, h, size: Math.max(12, head - 4), wrap: true, lines: 3 });
  });
  d.when({ v: "sTok", op: "present" }, () => {
    const colW = Math.floor((box.w - 12) / 2);
    const cells: [string, (string | Part)[], string][] = [
      ["Favorite model", [v("sModel")], "Haiku 88.8"],
      ["Total tokens", [v("sTok", TOKENS)], "888.8B"],
      ["Sessions", [v("sSes", COUNT)], "88,888"],
      ["Longest session", [v("sLong")], "88d 88h 88m"],
      ["Active days", [v("sAct", WHOLE), "/", v("sSpan", WHOLE)], "8888/8888"],
      ["Longest streak", [v("sStreak", WHOLE), " days"], "8888 days"],
      ["Most active day", [v("sBusy", { time: "MMM D" })], "Sep 88"],
      ["Current streak", [v("sCur", WHOLE), " days"], "8888 days"],
    ];
    // Four rows of figures, then two lines of tokens and two of comparison.
    const small = Math.max(12, Math.min(16, Math.round(h * 0.042)));
    const smallH = d.lineHeight(small);
    const rowRoom = Math.floor((h - 4 * smallH - 16) / 4) - smallH;
    const size = d.fit(cells.map((c) => c[2]), colW, Math.max(12, rowRoom), { weight: 700, min: 12, max: 26 });
    const rowH = smallH + d.lineHeight(size, 700) + 4;
    cells.forEach(([label, value], i) => {
      figure(d, label, value, { x: box.x + (i % 2) * (colW + 12), y: top + Math.floor(i / 2) * rowH, w: colW, h: rowH }, size, small);
    });
    let y = top + 4 * rowH + 6;
    d.line(box.x, y - 3, box.x + box.w, y - 3, { width: 1 });
    const line = (content: (string | Part)[], bold = false) => {
      d.text(content, { x: box.x, y, w: box.w, h: smallH, size: small, ...(bold ? { weight: 700 as const } : {}) });
      y += smallH;
    };
    line(["Input ", v("sIn", TOKENS), " · Output ", v("sOut", TOKENS)]);
    line(["Cache read ", v("sRead", TOKENS), " · Cache write ", v("sWrite", TOKENS)]);
    y += 4;
    d.when({ v: "sWap", op: "ge", x: 1 }, () => {
      d.text(["Your input and output are ~", v("sWap", COUNT), "× the tokens in War and Peace"], { x: box.x, y, w: box.w, h: 2 * smallH, size: small, wrap: true, lines: 2 });
    });
  });
}

/**
 * The whole screen's worth: the limits and spend on the left, all
 * time on the right, the session along the bottom.
 */
function wide(d: Draw, s: Settings) {
  const W = d.width, H = d.height;
  const headH = Math.max(16, Math.min(30, Math.round(H * 0.065)));
  header(d, { x: 0, y: 0, w: W, h: headH });
  const footH = s.session ? 2 * d.lineHeight(Math.max(12, Math.min(18, Math.round(H * 0.035)))) + 8 : 0;
  const leftW = Math.round(W * 0.55);
  const top = headH + 12;
  const bottom = H - footH;
  const size = Math.max(14, Math.min(24, Math.round(H * 0.05)));
  const small = Math.max(12, Math.min(16, Math.round(size * 0.68)));
  const rowH = d.lineHeight(size, 700) + d.lineHeight(small) + 6;
  limit(d, "s5", "Session", "HH:mm", { x: 0, y: top, w: leftW - 16, h: rowH }, size, small);
  limit(d, "s7", "Week", "ddd HH:mm", { x: 0, y: top + rowH, w: leftW - 16, h: rowH }, size, small);
  const y = top + 2 * rowH + 6;
  spend(d, s, { x: 0, y, w: leftW - 16, h: bottom - y - 8 });
  d.line(leftW, top, leftW, bottom - 8, { width: 1 });
  allTime(d, { x: leftW + 16, y: top, w: W - leftW - 16, h: bottom - top - 8 });
  if (s.session) {
    d.line(0, bottom + 2, W, bottom + 2);
    current(d, s, { x: 0, y: bottom + 6, w: W, h: footH - 6 });
  }
}

/** Everything but all time: the limits across the top, spend beneath, the session at the bottom. */
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
  spend(d, s, { x: 0, y, w: W, h: midH });
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
  size: { min: [5, 2], default: [20, 12] },
  fields: [
    {
      key: "url", label: "Bridge address", kind: "text", placeholder: "http://192.168.1.20:8787/usage.json",
      help: "The address the bridge prints when it starts. Setting it up takes a minute; see below.",
    },
    {
      key: "setup", label: "How to set up the bridge", kind: "guide",
      steps: [
        { text: "Download the bridge to the computer you use Claude Code on. It needs Node.js and nothing else.", code: "curl -fsSL --create-dirs -o ~/.claude/dither/bridge.mjs {{app}}claude-code/bridge.mjs" },
        { text: "Make it Claude Code's status line: add this to ~/.claude/settings.json, then start a new Claude Code session.", code: '"statusLine": { "type": "command", "command": "node ~/.claude/dither/bridge.mjs statusline" }' },
        { text: "Start its server, and leave it running. It prints the addresses it can be reached at.", code: "node ~/.claude/dither/bridge.mjs serve" },
        { text: "Enter an address above. This preview can use the one below; the panel needs the one with your computer's network address (192.168…), and that address fixed in your router.", code: "http://127.0.0.1:8787/usage.json" },
      ],
      help: "Limits show on Pro and Max plans, after a session's first reply. The figures change only while Claude Code is running; while the computer sleeps the panel keeps the last ones.",
    },
    { key: "every", label: "Check every", kind: "number", min: 1, max: 60, unit: "min" },
    { key: "tokens", label: "Tokens", kind: "toggle" },
    { key: "session", label: "Current session", kind: "toggle" },
    { key: "stats", label: "All-time stats", kind: "toggle", help: "What /stats shows, when the widget is about the size of the screen." },
  ],
  defaults: () => ({ url: "", every: 5, tokens: true, session: true, stats: true }),
  example: { url: "http://192.168.1.20:8787/usage.json" },
  title: () => "Claude Code",
  source(s) {
    const url = addressOf(s);
    if (!url) return null;
    return { url, every: Math.max(1, Number(s.every) || 5), values: { ...VALUES } };
  },
  sample: () => {
    const now = Math.floor(Date.now() / 1000);
    return {
      s5: 42, r5: now + 2 * 3600 + 14 * 60, s7: 61, r7: now + 3 * 86400 + 5 * 3600,
      cost: 3.21, tok: 4_820_000, ctx: 38, model: "Opus 5.5", add: 214, del: 57, min: 48,
      today: 12.4, todayTok: 18_300_000, todaySes: 5, week: 48.2, weekTok: 71_900_000, weekSes: 21,
      upd: now - 120, plan: "Claude Max 5x",
      sModel: "Sonnet 5", sTok: 12_739_720_000, sIn: 1_420_000, sOut: 48_300_000, sRead: 12_400_000_000, sWrite: 290_000_000,
      sSes: 148, sLong: "6d 4h 12m", sAct: 61, sSpan: 84, sBusy: "2026-09-24", sStreak: 17, sCur: 6, sWap: 68,
    };
  },
  facts: () => [
    { key: "session", label: "Session limit used", type: "number", value: "s5", unit: "%" },
    { key: "week", label: "Weekly limit used", type: "number", value: "s7", unit: "%" },
    { key: "resets", label: "Minutes until the session limit resets", type: "number", value: "r5", unit: " min", format: UNTIL },
    { key: "today", label: "Spent on Claude Code today", type: "number", value: "today", unit: " USD" },
    { key: "limits", label: "Plan limits known", type: "flag", test: { v: "s5", op: "present" } },
    { key: "streak", label: "Days in a row with Claude Code", type: "number", value: "sCur", unit: " days" },
  ],
  draw(d, s) {
    if (!addressOf(s)) return needsAddress(d);
    if (s.stats && d.width >= 640 && d.height >= 400) return wide(d, s);
    if (d.width >= 360 && d.height >= 220) return dashboard(d, s);
    if (d.width >= 200 && d.height >= 110) return compact(d);
    single(d);
  },
});
