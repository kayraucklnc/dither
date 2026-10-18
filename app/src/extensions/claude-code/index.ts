import type { Format, Part } from "@/runtime/types";
import { defineExtension, type Box, type Content, type Draw } from "../api";

// Your Claude Code usage: the plan's 5-hour and weekly limits, and the
// all-time figures /stats shows. Claude Code keeps these on your computer,
// so the panel reads them from a bridge there (app/public/claude-code/bridge.mjs) — Claude
// Code's status line, which also serves them as one JSON file on your Wi-Fi,
// with your plan.

/** The bridge's answer, kept under these names. */
const VALUES = {
  s5: "limits.session.used", r5: "limits.session.resets",
  s7: "limits.week.used", r7: "limits.week.resets",
  upd: "updated", plan: "plan",
  sModel: "stats.model", sTok: "stats.tokens", sIn: "stats.input", sOut: "stats.output",
  sSes: "stats.sessions", sLong: "stats.longest", sAct: "stats.activeDays", sSpan: "stats.days", sBusy: "stats.busiest",
  sStreak: "stats.longestStreak", sCur: "stats.currentStreak", sWap: "stats.warAndPeace",
} as const;

const WHOLE: Format = { num: { d: 0 } };
const TOKENS: Format = { num: { d: 0, compact: true } };
const UNTIL: Format = { until: true };
const COUNT: Format = { num: { d: 0, sep: "," } };

interface Settings extends Record<string, unknown> {
  url: string;
  every: number;
  /** "limits": the two limits alone, large; "all": the limits, all time and the tokens. */
  show: "limits" | "all";
  /** Before there were modes: false meant the limits alone. */
  stats?: boolean;
}

const modeOf = (s: Settings) => s.show ?? (s.stats === false ? "limits" : "all");

const addressOf = (s: Settings) => {
  const url = String(s.url ?? "").trim();
  return /^https?:\/\//.test(url) ? url : "";
};

function needsAddress(d: Draw) {
  d.icon("gauge", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
  const text = "Run the bridge, then enter its address";
  d.text(text, { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit(["Run the bridge, then"], d.width, 40, { max: 24 }), align: "center", wrap: true, lines: 2 });
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

/** One type scale for the whole dashboard, from how big it is shown: 1 at 800 × 480. */
interface Type {
  title: number;
  head: number;
  label: number;
  value: number;
  hero: number;
}

const typeFor = (k: number): Type => ({
  title: Math.max(14, Math.round(22 * k)),
  head: Math.max(12, Math.round(13 * k)),
  label: Math.max(12, Math.round(14 * k)),
  value: Math.max(13, Math.round(24 * k)),
  hero: Math.max(16, Math.round(40 * k)),
});

/** A figure: its name above, the value in bold; `worst` is the widest it may become. */
interface Cell {
  label: string;
  value: (string | Part)[];
  worst: string;
}

/** A section of the dashboard: how tall it is, and how to draw it at a height. */
interface Section {
  h: number;
  draw: (y: number) => void;
}

/** The spark, "Claude Code" and the plan, and how fresh the figures are, over a rule. */
function header(d: Draw, box: Box, scale: Type) {
  // The title, and the plan and time beside it in proportion, give way until the longest plan fits.
  const labelFor = (title: number) => Math.min(scale.label, Math.max(12, Math.round(title * 0.6)));
  const room = (title: number) => {
    const mark = Math.round(d.lineHeight(title, 700) * 1.05);
    return mark * 1.4 + d.measure("Claude Code", title, 700) + title * 0.5 + d.measure("Claude Enterprise", labelFor(title)) + 16 + d.measure("Updated 88:88", labelFor(title));
  };
  let title = scale.title;
  while (title > 14 && room(title) > box.w) title--;
  const t = { ...scale, label: labelFor(title) };
  const mark = Math.round(d.lineHeight(title, 700) * 1.05);
  spark(d, { x: box.x, y: box.y + Math.floor((box.h - mark) / 2), w: mark, h: mark });
  const x = box.x + mark + Math.round(mark * 0.4);
  d.text("Claude Code", { ...box, x, w: box.w - x, size: title, weight: 700, valign: "middle" });
  const after = x + d.measure("Claude Code", title, 700) + Math.round(title * 0.5);
  const asOf = d.measure("Updated 88:88", t.label) + 8;
  d.when({ v: "plan", op: "present" }, () => d.text(d.value("plan"), { ...box, x: after, w: Math.max(0, box.x + box.w - asOf - after), size: t.label, valign: "middle" }));
  d.when({ v: "upd", op: "present" }, () => d.text(["Updated ", d.value("upd", { time: "HH:mm" })], { ...box, size: t.label, align: "right", valign: "middle" }));
  d.rect({ x: box.x, y: box.y + box.h + 6, w: box.w, h: 2 });
}

/** A section's name in capitals, a hairline after it, and on the right whatever `aside` holds. */
function heading(d: Draw, name: string, box: Box, t: Type, aside?: { content: Content; worst: string }) {
  const h = d.lineHeight(t.head, 700);
  d.text(name, { x: box.x, y: box.y, w: box.w, h, size: t.head, weight: 700 });
  const asideW = aside ? d.measure(aside.worst, t.head) + 10 : 0;
  if (aside) d.text(aside.content, { x: box.x + box.w - asideW, y: box.y, w: asideW, h, size: t.head, align: "right" });
  const from = box.x + d.measure(name, t.head, 700) + 10;
  const to = box.x + box.w - asideW - (aside ? 6 : 0);
  if (to > from) d.line(from, box.y + Math.round(h / 2), to, box.y + Math.round(h / 2), { width: 1 });
}

const headingH = (d: Draw, t: Type) => d.lineHeight(t.head, 700) + Math.round(t.head * 0.7);
const cellH = (d: Draw, t: Type, size = t.value) => d.lineHeight(t.label) + d.lineHeight(size, 700);

/** Figures in rows of `cols`, each its name over its value. Returns how tall they are. */
function cells(d: Draw, list: Cell[], cols: number, x: number, y: number, w: number, t: Type, size = t.value, gap = Math.round(t.value * 0.5)) {
  const colW = Math.floor((w - (cols - 1) * 16) / cols);
  const rowH = cellH(d, t, size);
  list.forEach((c, i) => {
    const cx = x + (i % cols) * (colW + 16);
    const cy = y + Math.floor(i / cols) * (rowH + gap);
    d.text(c.label, { x: cx, y: cy, w: colW, h: d.lineHeight(t.label), size: t.label });
    d.text(c.value, { x: cx, y: cy + d.lineHeight(t.label), w: colW, h: d.lineHeight(size, 700), size, weight: 700 });
  });
  const rows = Math.ceil(list.length / cols);
  return rows * rowH + (rows - 1) * gap;
}

/** The largest value size, up to the scale's, at which every cell's widest value fits its column. */
const fitCells = (d: Draw, list: Cell[], cols: number, w: number, max: number) =>
  d.fit(list.map((c) => c.worst), Math.floor((w - (cols - 1) * 16) / cols), 1000, { weight: 700, min: 12, max });

/**
 * A limit as a figure with a bar beside it: its name and when it resets on the
 * first line, how much is used and the bar on the second. A window that reset
 * since the panel last heard says so; without a plan's limits, says that.
 */
function meter(d: Draw, key: "s5" | "s7", label: string, pattern: string, box: Box, t: Type) {
  const r = key === "s5" ? "r5" : "r7";
  const lh = d.lineHeight(t.label), vh = d.lineHeight(t.value, 700);
  const pctW = d.measure("100%", t.value, 700) + Math.round(t.value * 0.6);
  const top = { x: box.x, y: box.y, w: box.w, h: lh, size: t.label };
  d.text(label, top);
  const reset = { ...top, align: "right" as const };
  d.when({ v: r, f: UNTIL, op: "lt", x: 60 }, () => d.text(["Resets in ", d.value(r, { ...UNTIL, ...WHOLE }), " min"], reset));
  d.when({ v: r, f: UNTIL, op: "ge", x: 60 }, () => d.text(["Resets ", d.value(r, { time: pattern })], reset));
  d.when({ all: [{ v: r, op: "present" }, { v: r, f: UNTIL, op: "absent" }] }, () => d.text(["Reset at ", d.value(r, { time: pattern })], reset));
  const y = box.y + lh;
  d.text([d.value(key, { ...WHOLE, fallback: "–" }), d.value(key, { steps: { t: [], o: ["%"] }, fallback: "" })], { x: box.x, y, w: pctW, h: vh, size: t.value, weight: 700 });
  const barH = Math.max(10, Math.round(vh * 0.42));
  const bar = { x: box.x + pctW, y: y + Math.round((vh - barH) / 2), w: box.w - pctW, h: barH };
  d.when({ v: key, op: "absent" }, () => d.text("No limit data yet", { x: bar.x, y, w: bar.w, h: vh, size: t.label, valign: "middle" }));
  d.when({ v: key, op: "present" }, () => {
    d.rect(bar, { fill: false, stroke: 2, radius: Math.floor(barH / 2) });
    d.bar({ x: bar.x + 3, y: bar.y + 3, w: bar.w - 6, h: bar.h - 6 }, key, 0, 100);
  });
}

const meterH = (d: Draw, t: Type) => d.lineHeight(t.label) + d.lineHeight(t.value, 700);

/** Both limits, one long bar each; under a heading unless they are all there is. */
function limitsSection(d: Draw, x: number, w: number, t: Type, titled = true): Section {
  const gap = Math.round(t.value * 0.55);
  const head = titled ? headingH(d, t) : 0;
  return {
    h: head + 2 * meterH(d, t) + gap,
    draw: (y) => {
      if (titled) heading(d, "LIMITS", { x, y, w, h: 0 }, t);
      const top = y + head;
      meter(d, "s5", "Session", "HH:mm", { x, y: top, w, h: meterH(d, t) }, t);
      meter(d, "s7", "Week", "ddd HH:mm", { x, y: top + meterH(d, t) + gap, w, h: meterH(d, t) }, t);
    },
  };
}

const statCells = (d: Draw): Cell[] => {
  const v = (key: string, f?: Format) => d.value(key, f);
  return [
    { label: "Favorite model", value: [v("sModel")], worst: "Sonnet 88.8" },
    { label: "Total tokens", value: [v("sTok", TOKENS)], worst: "888.8B" },
    { label: "Sessions", value: [v("sSes", COUNT)], worst: "88,888" },
    { label: "Longest session", value: [v("sLong")], worst: "88d 88h 88m" },
    { label: "Active days", value: [v("sAct", WHOLE), "/", v("sSpan", WHOLE)], worst: "888/888" },
    { label: "Longest streak", value: [v("sStreak", WHOLE), " days"], worst: "888 days" },
    { label: "Most active day", value: [v("sBusy", { time: "MMM D" })], worst: "Sep 88" },
    { label: "Current streak", value: [v("sCur", WHOLE), " days"], worst: "888 days" },
  ];
};

const tokenCells = (d: Draw): Cell[] => [
  { label: "Input", value: [d.value("sIn", TOKENS)], worst: "888.8M" },
  { label: "Output", value: [d.value("sOut", TOKENS)], worst: "888.8M" },
];

const known = { v: "sTok", op: "present" } as const;

/** What /stats shows from the start: eight figures in rows of `cols`. */
function allTimeSection(d: Draw, x: number, w: number, t: Type, cols: number): Section {
  const gap = Math.round(t.value * 0.55);
  const rows = Math.ceil(8 / cols);
  return {
    h: headingH(d, t) + rows * cellH(d, t) + (rows - 1) * gap,
    draw: (y) => {
      heading(d, "ALL TIME", { x, y, w, h: 0 }, t);
      const top = y + headingH(d, t);
      d.when({ v: "sTok", op: "absent" }, () => {
        d.text("Claude Code's /stats figures show here once the bridge can read them.", { x, y: top, w, h: 2 * d.lineHeight(t.label), size: t.label, wrap: true, lines: 2 });
      });
      d.when(known, () => cells(d, statCells(d), cols, x, top, w, t, t.value, gap));
    },
  };
}

/**
 * The tokens that are yours: what you sent and what came back, in the first
 * two of `cols` columns, and beside them how many War and Peaces that is.
 */
function tokensSection(d: Draw, x: number, w: number, t: Type, cols: number): Section {
  return {
    h: headingH(d, t) + cellH(d, t),
    draw: (y) => d.when(known, () => {
      heading(d, "TOKENS", { x, y, w, h: 0 }, t);
      const top = y + headingH(d, t);
      const colW = Math.floor((w - (cols - 1) * 16) / cols);
      const pair = cols >= 4 ? 2 * colW + 16 : w;
      cells(d, tokenCells(d), 2, x, top, pair, t);
      const note = ["Your input and output are ~", d.value("sWap", COUNT), "× the tokens in War and Peace."];
      if (cols >= 4) {
        d.when({ v: "sWap", op: "ge", x: 1 }, () => {
          d.text(note, { x: x + pair + 16, y: top, w: w - pair - 16, h: cellH(d, t), size: t.label, wrap: true, lines: 2, valign: "middle" });
        });
      }
    }),
  };
}

/** The largest value size, up to the scale's, at which every figure fits `cols` columns of `w`. */
const figureSize = (d: Draw, t: Type, w: number, cols: number) =>
  Math.min(fitCells(d, statCells(d), cols, w, t.value), fitCells(d, tokenCells(d), Math.max(2, cols), w, t.value), t.value);

/**
 * Sections down a column from `top` to `bottom`, the space left over shared
 * evenly between them (up to `most` each, the rest left at the bottom), so the
 * column ends on the bottom line. Sections that do not fit are left out from the end.
 */
function stack(sections: Section[], top: number, bottom: number, most = Infinity) {
  const list = [...sections];
  while (list.length > 1 && list.reduce((n, x) => n + x.h, 0) > bottom - top) list.pop();
  const free = Math.max(0, bottom - top - list.reduce((n, x) => n + x.h, 0));
  const gap = list.length > 1 ? Math.min(most, Math.floor(free / (list.length - 1))) : 0;
  let y = top;
  for (const x of list) {
    x.draw(y);
    y += x.h + gap;
  }
}

const total = (list: Section[]) => list.reduce((n, x) => n + x.h, 0);

/**
 * The largest type, from `k` down, at which `columns` of sections all fit the
 * height under the header with a line's worth of air between them. When none
 * does down to `least`, the last section of each column goes and the search
 * starts again: fewer things, legible, rather than everything small.
 */
function fitType(k: number, room: (t: Type) => number, columns: (t: Type) => Section[][], least = 0.45): { t: Type; columns: Section[][] } {
  for (let drop = 0; ; drop++) {
    for (let f = k; f > (columns(typeFor(k)).every((c) => c.length - drop <= 1) ? 0.45 : least); f -= 0.05) {
      const t = typeFor(f);
      const cols = columns(t).map((c) => c.slice(0, Math.max(1, c.length - drop)));
      if (cols.every((c) => total(c) + (c.length - 1) * Math.round(t.value * 0.7) <= room(t))) return { t, columns: cols };
    }
    if (columns(typeFor(0.45)).every((c) => c.length - drop <= 1)) {
      const t = typeFor(0.45);
      return { t, columns: columns(t).map((c) => c.slice(0, 1)) };
    }
  }
}

const headerH = (d: Draw, t: Type) => d.lineHeight(t.title, 700) + 4;
const bodyTop = (d: Draw, t: Type) => headerH(d, t) + 8 + Math.round(t.value * 0.7);

/**
 * Rows across the whole width: the limits as long bars, all time four by
 * two, then the tokens, so one value size and one grid carry the screen.
 */
function wide(d: Draw) {
  const W = d.width, H = d.height;
  const sections = (scale: Type) => {
    const t = { ...scale, value: figureSize(d, scale, W, 4) };
    return [[limitsSection(d, 0, W, t), allTimeSection(d, 0, W, t, 4), tokensSection(d, 0, W, t, 4)]];
  };
  const { t, columns } = fitType(1.4 * Math.min(W / 800, H / 480), (t) => H - bodyTop(d, t), sections);
  header(d, { x: 0, y: 0, w: W, h: headerH(d, t) }, t);
  stack(columns[0], bodyTop(d, t), H);
}

/** The limits and, with room, all time two by two. */
function dashboard(d: Draw) {
  const W = d.width, H = d.height;
  const sections = (scale: Type) => {
    const t = { ...scale, value: figureSize(d, scale, W, 2) };
    return [[limitsSection(d, 0, W, t), allTimeSection(d, 0, W, t, 2), tokensSection(d, 0, W, t, 2)]];
  };
  const { t, columns } = fitType(Math.min(W / 300, H / 240, 1.6), (t) => H - bodyTop(d, t), sections, 0.75);
  header(d, { x: 0, y: 0, w: W, h: headerH(d, t) }, t);
  stack(columns[0], bodyTop(d, t), H, Math.round(t.value * 1.4));
}

/** The limits mode: the header and both limits, as large as the box allows, in the middle of it. */
function limitsOnly(d: Draw) {
  const W = d.width, H = d.height;
  const sections = (t: Type) => [[limitsSection(d, 0, W, t, false)]];
  const { t, columns } = fitType(Math.min(W / 220, H / 180, 3), (t) => H - bodyTop(d, t), sections);
  header(d, { x: 0, y: 0, w: W, h: headerH(d, t) }, t);
  const free = H - bodyTop(d, t) - columns[0][0].h;
  columns[0][0].draw(bodyTop(d, t) + Math.floor(free / 2));
}

/** Both limits, as large as the box allows. */
function compact(d: Draw) {
  const W = d.width, H = d.height;
  let t = typeFor(0.45);
  for (let f = Math.min(W / 300, 2); f > 0.45; f -= 0.05) {
    t = typeFor(f);
    if (2 * meterH(d, t) + Math.round(t.value * 0.6) <= H) break;
  }
  const gap = Math.round(t.value * 0.6);
  const top = Math.max(0, Math.floor((H - 2 * meterH(d, t) - gap) / 2));
  meter(d, "s5", "Session", "HH:mm", { x: 0, y: top, w: W, h: meterH(d, t) }, t);
  meter(d, "s7", "Week", "ddd HH:mm", { x: 0, y: top + meterH(d, t) + gap, w: W, h: meterH(d, t) }, t);
}

/** Only the 5-hour limit, as large as it goes. */
function single(d: Draw) {
  let t = typeFor(0.45);
  for (let f = Math.min(d.width / 300, 2); f > 0.45; f -= 0.05) {
    t = typeFor(f);
    if (meterH(d, t) <= d.height) break;
  }
  meter(d, "s5", "Session", "HH:mm", { x: 0, y: Math.max(0, Math.floor((d.height - meterH(d, t)) / 2)), w: d.width, h: meterH(d, t) }, t);
}

export default defineExtension<Settings>({
  id: "claude-code",
  name: "Claude Code",
  description: "Your session and weekly limits and your all-time stats — from your own computer.",
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
    {
      key: "show", label: "Show", kind: "select",
      options: [
        { value: "limits", label: "Limits — the session and weekly limits, large" },
        { value: "all", label: "Everything — the limits, all-time stats and tokens" },
      ],
      help: "Everything needs about the whole screen to show all of it; smaller, it shows what fits.",
    },
  ],
  defaults: () => ({ url: "", every: 5, show: "all" }),
  example: { url: "http://192.168.1.20:8787/usage.json" },
  title: (s) => (modeOf(s) === "limits" ? "Claude Code · Limits" : "Claude Code"),
  source(s) {
    const url = addressOf(s);
    if (!url) return null;
    return { url, every: Math.max(1, Number(s.every) || 5), values: { ...VALUES } };
  },
  sample: () => {
    const now = Math.floor(Date.now() / 1000);
    return {
      s5: 42, r5: now + 2 * 3600 + 14 * 60, s7: 61, r7: now + 3 * 86400 + 5 * 3600,
      upd: now - 120, plan: "Claude Max 5x",
      sModel: "Sonnet 5", sTok: 12_739_720_000, sIn: 1_420_000, sOut: 48_300_000,
      sSes: 148, sLong: "6d 4h 12m", sAct: 61, sSpan: 84, sBusy: "2026-09-24", sStreak: 17, sCur: 6, sWap: 68,
    };
  },
  facts: () => [
    { key: "session", label: "Session limit used", type: "number", value: "s5", unit: "%" },
    { key: "week", label: "Weekly limit used", type: "number", value: "s7", unit: "%" },
    { key: "resets", label: "Minutes until the session limit resets", type: "number", value: "r5", unit: " min", format: UNTIL },
    { key: "limits", label: "Plan limits known", type: "flag", test: { v: "s5", op: "present" } },
    { key: "streak", label: "Days in a row with Claude Code", type: "number", value: "sCur", unit: " days" },
  ],
  draw(d, s) {
    if (!addressOf(s)) return needsAddress(d);
    const mode = modeOf(s);
    if (mode === "limits" && d.width >= 300 && d.height >= 200) return limitsOnly(d);
    if (mode === "all" && d.width >= 640 && d.height >= 400) return wide(d);
    if (mode === "all" && d.width >= 360 && d.height >= 220) return dashboard(d);
    if (d.width >= 200 && d.height >= 100) return compact(d);
    single(d);
  },
});
