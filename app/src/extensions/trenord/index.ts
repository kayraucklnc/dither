import type { Condition, Format } from "@/runtime/types";
import { defineExtension, type Draw } from "../api";
import { sha256Hex } from "../sha256";
import STATIONS from "./stations.json";

// Trenord's journey planner answers AES-256-ECB under the SHA-256 of a
// passphrase from its own web bundle: obfuscation, not security. If Trenord
// rotates it, the new one goes in the advanced setting — no release needed.
const PASSPHRASE = "8hI&WK=1NQ55*f^yyZkdEGWYyN{S";
const TRAINS = 6;

const stations = (STATIONS as [string, string, string][]).map(([value, label, town]) => ({ value, label, hint: town !== label ? town : undefined }));
const nameOf = (code: unknown) => stations.find((s) => s.value === code)?.label ?? "";

// --------------------------------------------------------------- what a train is

/** When it actually leaves: the timetable time moved by the reported delay. */
const leaves = (i: number): Format => ({ shift: { v: `d${i}`, scale: 60 } });
const minutesTo = (i: number): Format => ({ ...leaves(i), until: true });
const clock = (i: number): Format => ({ ...leaves(i), time: "HH:mm", fallback: "" });

const cancelled = (i: number): Condition => ({ any: [{ v: `c${i}`, op: "true" }, { v: `s${i}`, op: "eq", x: "S" }] });
const late = (i: number, min = 1): Condition => ({ v: `d${i}`, op: "ge", x: min });
/** Not gone yet. Trenord's list often starts with the train that just left. */
const upcoming = (i: number): Condition => ({ v: `t${i}`, f: minutesTo(i), op: "present" });
const not = (c: Condition): Condition => ({ not: c });
const and = (...c: Condition[]): Condition => ({ all: c });

// --------------------------------------------------------------- the board
//
// One table, one grid: countdown | time and train | state. The train worth
// running for is the first row, drawn as a black band in larger type; every
// later train lines up beneath it in the same columns, so the eye runs down
// "6 min, 25 min, 48 min" without hunting.

/** Not gone and not cancelled: a train you can actually catch. */
const catchable = (i: number): Condition => and(upcoming(i), not(cancelled(i)));

/**
 * Every order the board can be in, worked out here and chosen on the panel:
 * `first` is the first train not yet gone (Trenord's list often opens with the
 * one that just left), `hero` the first one worth running for. The rest follow
 * in order — a cancelled train stays on the board, struck out.
 */
function arrangements(): { when: Condition; hero: number; rest: number[] }[] {
  const out: { when: Condition; hero: number; rest: number[] }[] = [];
  for (const first of [0, 1]) {
    for (let hero = first; hero < first + 3 && hero < TRAINS; hero++) {
      const conds: Condition[] = [upcoming(first), catchable(hero)];
      if (first > 0) conds.push(not(upcoming(0)));
      for (let j = first; j < hero; j++) conds.push(cancelled(j));
      const rest = Array.from({ length: TRAINS - first }, (_, k) => first + k).filter((k) => k !== hero);
      out.push({ when: and(...conds), hero, rest });
    }
  }
  return out;
}

/** Text placed so its baseline sits at `baseline`. */
function onBaseline(d: Draw, content: Parameters<Draw["text"]>[0], x: number, baseline: number, w: number, size: number, weight: 400 | 700, align: "left" | "right" | "center" = "left", white = false) {
  const m = d.metrics(size, weight);
  d.text(content, { x, y: baseline - m.ascent, w, h: m.lineHeight, size, weight, align, white });
}

interface Grid {
  x: number;
  w: number;
  /** The countdown column, as wide as the hero's countdown — every row lines up behind it. */
  countW: number;
  stateW: number;
  /** Two-line middle column (time over train) for narrow boards. */
  stacked: boolean;
  heroBig: number;
  heroPad: number;
}

const heroUnit = (big: number) => Math.max(14, Math.round(big * 0.34));

/** The largest hero countdown that leaves the rest of its row room to breathe. */
function heroSize(d: Draw, h: number, w: number): number {
  for (const size of [96, 80, 64, 48, 40, 32, 28, 24]) {
    if (size > h * 0.66) continue;
    if (d.measure("88", size, 700) + d.measure("min", heroUnit(size), 700) + size * 0.25 <= w * 0.4) return size;
  }
  return 20;
}

/** Baseline that centres a line of this size in a band of height h. */
function centre(y: number, h: number, size: number): number {
  // Digits and capitals stop well below the font's ascent; centre on the cap height.
  return y + Math.round((h + Math.round(size * 0.73)) / 2);
}

function countdown(d: Draw, i: number, x: number, baseline: number, w: number, size: number, white: boolean, unitSize: number) {
  d.when({ v: `t${i}`, f: minutesTo(i), op: "lt", x: 1 }, () => onBaseline(d, "now", x, baseline, w, size, 700, "left", white));
  for (const [lo, hi, digits] of [[1, 10, "8"], [10, 100, "88"], [100, 1440, "888"]] as const) {
    d.when({ v: `t${i}`, f: minutesTo(i), op: "between", x: [lo, hi] }, () => {
      const nw = d.measure(digits, size, 700);
      onBaseline(d, [d.value(`t${i}`, { ...minutesTo(i), num: { d: 0 } })], x, baseline, nw + 4, size, 700, "left", white);
      onBaseline(d, "min", x + nw + Math.max(3, Math.round(unitSize * 0.25)), baseline, w - nw, unitSize, 700, "left", white);
    });
  }
}

function state(d: Draw, i: number, x: number, baseline: number, w: number, size: number, white: boolean, roomy: boolean) {
  d.when(cancelled(i), () => onBaseline(d, "Cancelled", x, baseline, w, size, 700, "right", white));
  d.when(and(not(cancelled(i)), late(i)), () =>
    onBaseline(d, roomy ? [d.value(`d${i}`, { num: { d: 0 } }), " min late"] : ["+", d.value(`d${i}`, { num: { d: 0 } }), " min"], x, baseline, w, size, 700, "right", white));
  d.when(and(not(cancelled(i)), not(late(i))), () => onBaseline(d, "on time", x, baseline, w, size, 400, "right", white));
}

/** One train, as a row of the grid. The hero row is the same row, bigger and inverted. */
function row(d: Draw, i: number, y: number, h: number, g: Grid, hero: boolean) {
  const white = hero;
  if (hero) d.rect({ x: g.x, y, w: g.w, h }, { radius: 8 });
  const pad = hero ? g.heroPad : 0;
  const big = hero ? g.heroBig : Math.min(40, Math.max(16, Math.min(Math.round(h * 0.55), Math.round(g.heroBig * 0.5))));
  const unit = hero ? heroUnit(big) : Math.max(13, Math.round(big * 0.45));
  const mid = hero ? Math.max(18, Math.min(40, Math.round(big * 0.5))) : Math.max(16, Math.min(30, Math.round(big * 0.8)));
  const small = Math.max(14, Math.round(mid * 0.68));
  const base = centre(y, h, big);

  countdown(d, i, g.x + pad, base, g.countW, big, white, unit);

  // The state column is as wide as its words at this row's size.
  const stateSize = hero && !g.stacked ? mid : small;
  const widest = hero && !g.stacked ? ["88 min late", "Cancelled"] : ["+88 min", "Cancelled"];
  const stateW = g.stateW > 0 ? Math.max(...widest.map((t) => d.measure(t, stateSize, 700))) + 6 : 0;
  const midX = g.x + pad + g.countW;
  const midW = g.w - pad * 2 - g.countW - stateW;
  const timeW = d.measure("88:88", mid, 700) + Math.round(mid * 0.45);
  const train = [d.value(`k${i}`, { fallback: "" }), " ", d.value(`n${i}`, { fallback: "" })];
  const lineY = g.stacked ? y + Math.round(h / 2) - 2 : base;
  if (g.stacked) {
    onBaseline(d, [d.value(`t${i}`, clock(i))], midX, lineY, midW, mid, 700, "left", white);
    onBaseline(d, train, midX, lineY + d.metrics(small).lineHeight, midW, small, 400, "left", white);
  } else {
    onBaseline(d, [d.value(`t${i}`, clock(i))], midX, base, timeW, mid, 700, "left", white);
    onBaseline(d, train, midX + timeW, base, midW - timeW, small, 400, "left", white);
  }
  d.when(cancelled(i), () => {
    // Struck through: still on the board, plainly not happening.
    const sy = lineY - Math.round(mid * 0.36);
    d.line(midX - 2, sy, midX + timeW - Math.round(mid * 0.3), sy, { width: Math.max(2, Math.round(mid / 10)), white });
  });
  if (stateW > 0) state(d, i, g.x + g.w - pad - stateW, base, stateW, stateSize, white, hero && !g.stacked);
}

function routeLine(d: Draw, s: Record<string, unknown>, h: number) {
  const size = Math.max(14, Math.min(22, d.fit(["Milano Porta Garibaldi"], d.width * 0.4, h)));
  const from = nameOf(s.from);
  const to = nameOf(s.to);
  const fw = Math.min(d.measure(from, size, 700), d.width * 0.42);
  const tw = Math.min(d.measure(to, size, 700), d.width * 0.42);
  d.text(from, { x: 0, y: 0, w: fw + 2, h, size, weight: 700, valign: "middle" });
  d.text(to, { x: d.width - tw - 2, y: 0, w: tw + 2, h, size, weight: 700, valign: "middle", align: "right" });
  // The line between them is the route: from here, to there.
  const ly = Math.round(h / 2) + 1;
  const x1 = fw + 12;
  const x2 = d.width - tw - 14;
  if (x2 - x1 > 24) {
    d.circle(x1 + 3, ly, 3);
    d.line(x1 + 3, ly, x2, ly, { width: 2 });
    d.line(x2 - 8, ly - 6, x2, ly, { width: 2 });
    d.line(x2 - 8, ly + 6, x2, ly, { width: 2 });
  }
}

function board(d: Draw, s: Record<string, unknown>) {
  const { width: w, height: h } = d;
  const headH = h >= 150 ? Math.max(22, Math.min(32, Math.round(h * 0.09))) : 0;
  if (headH) routeLine(d, s, headH);
  const top = headH ? headH + 8 : 0;
  const avail = h - top;
  // As many later trains as fit at a readable height, the hero taller than each.
  const later = Math.max(0, Math.min(5, Math.floor((avail - 70) / 40)));
  const unit = avail / (later + (later ? 1.9 : 1));
  const heroH = Math.round(later ? unit * 1.9 : avail);
  const rowH = later ? Math.floor((avail - heroH - 4) / later) : 0;
  const stacked = w < 380;
  const heroBig = heroSize(d, heroH, w);
  const heroPad = Math.round(Math.min(heroH * 0.14, 20));
  const stateSize = Math.max(18, Math.min(40, Math.round(heroBig * 0.5)));
  const g: Grid = {
    x: 0, w, stacked, heroBig, heroPad,
    countW: d.measure("88", heroBig, 700) + d.measure("min", heroUnit(heroBig), 700) + Math.round(heroBig * 0.45),
    stateW: d.measure(stacked ? "+88 min" : "Cancelled", stateSize, 700) + 6,
  };
  for (const a of arrangements()) {
    d.when(a.when, () => {
      row(d, a.hero, top, heroH, g, true);
      a.rest.slice(0, later).forEach((i, r) => {
        const y = top + heroH + 4 + r * rowH;
        if (r > 0) d.line(0, y, w, y, { width: 1 });
        // The bottom row gives way to a service alert when there is one.
        const isLast = r === later - 1 && later > 1;
        d.when(isLast ? { all: [{ v: `t${i}`, op: "present" }, { v: "alert", op: "absent" }] } : { v: `t${i}`, op: "present" }, () => row(d, i, y, rowH, g, false));
      });
    });
  }
  if (later > 1) {
    const y = top + heroH + 4 + (later - 1) * rowH;
    d.when({ v: "alert", op: "present" }, () => {
      d.line(0, y, w, y, { width: 1 });
      const icon = Math.min(rowH - 10, 26);
      d.icon("circle-alert", { x: 0, y: y + (rowH - icon) / 2, w: icon, h: icon });
      d.text(d.value("alert"), { x: icon + 10, y, w: w - icon - 10, h: rowH, size: Math.min(18, Math.max(14, Math.round(rowH * 0.32))), wrap: true, lines: 2, valign: "middle" });
    });
  }
}

/** A band too short for a table: just the train worth running for. */
function strip(d: Draw) {
  const heroBig = heroSize(d, d.height, d.width);
  const stateSize = Math.max(16, Math.round(heroBig * 0.5));
  const g: Grid = {
    x: 0, w: d.width, stacked: false, heroBig, heroPad: Math.round(Math.min(d.height * 0.16, 16)),
    countW: d.measure("88", heroBig, 700) + d.measure("min", heroUnit(heroBig), 700) + Math.round(heroBig * 0.45),
    stateW: d.width >= 360 ? d.measure("Cancelled", stateSize, 700) + 6 : 0,
  };
  for (const a of arrangements()) d.when(a.when, () => row(d, a.hero, 0, d.height, g, true));
}

export default defineExtension({
  id: "trenord",
  name: "Trains (Trenord)",
  description: "When your next train leaves, how late it is, and the ones after it. Lombardy, Trenord.",
  icon: "train-front",
  category: "data",
  size: { min: [5, 2], default: [10, 7] },
  fields: [
    { key: "from", label: "From", kind: "search", placeholder: "Milano Cadorna", options: () => stations },
    { key: "to", label: "To", kind: "search", placeholder: "Saronno", options: () => stations },
    { key: "transfers", label: "Changes", kind: "select", options: [{ value: "0", label: "Direct trains only" }, { value: "1", label: "Up to one change" }, { value: "2", label: "Up to two changes" }] },
    { key: "language", label: "Alerts in", kind: "select", options: [{ value: "it", label: "Italian" }, { value: "en", label: "English" }] },
    { key: "passphrase", label: "Passphrase (advanced)", kind: "secret", help: "Only change this if Trenord changes theirs and the board stops updating." },
  ],
  defaults: () => ({ from: "S01066", to: "S01933", transfers: "0", language: "en", passphrase: PASSPHRASE }),
  title: (s) => `${nameOf(s.from) || "?"} to ${nameOf(s.to) || "?"}`,
  refresh: () => 5,
  source(s) {
    if (!s.from || !s.to) return null;
    const lang = String(s.language) === "it" ? "it" : "en";
    const q = new URLSearchParams({
      orig: String(s.from), dest: String(s.to), transfers: String(s.transfers ?? "0"), language: lang,
      products: "tickets", live_data: "true", with_routes: "true",
    });
    const at = (i: number, path: string) => `solutions.${i}.${path}`;
    const values: Record<string, string> = { alert: `hafas_alerts.0.title_${lang}` };
    for (let i = 0; i < TRAINS; i++) {
      Object.assign(values, {
        [`t${i}`]: at(i, "dep_time"),
        [`d${i}`]: at(i, "delay"),
        [`c${i}`]: at(i, "cancelled"),
        [`s${i}`]: at(i, "journey_list.0.train.status"),
        [`k${i}`]: at(i, "journey_list.0.train.train_category"),
        [`n${i}`]: at(i, "journey_list.0.train.train_name"),
      });
    }
    return {
      // Times in the query are the station's local wall clock, which is the panel's.
      url: `https://www.trenord.it/mia/bff/hafas/v2?${q}&departure_date={{now|YYYYMMDD}}&departure_hour={{now|HH:mm}}`,
      headers: [["Accept", "application/json"], ["Referer", "https://www.trenord.it/store/"], ["X-3N-Language", lang]],
      decode: { aes256ecb: sha256Hex(String(s.passphrase || PASSPHRASE)) },
      every: 5,
      values,
    };
  },
  sample: () => {
    // Timetable times are wall-clock strings; make the example ones upcoming.
    const soon = (min: number) => {
      const t = new Date(Math.ceil(Date.now() / 60000) * 60000 + min * 60000);
      return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:00`;
    };
    return {
      alert: null,
      t0: soon(6), d0: 0, c0: false, s0: "", k0: "R", n0: "24015",
      t1: soon(18), d1: 7, c1: false, s1: "", k1: "RE", n1: "1611",
      t2: soon(36), d2: 0, c2: true, s2: "S", k2: "R", n2: "24019",
      t3: soon(48), d3: 0, c3: false, s3: "", k3: "S3", n3: "24121",
      t4: soon(66), d4: 0, c4: false, s4: "", k4: "R", n4: "24023",
      t5: soon(78), d5: 0, c5: false, s5: "", k5: "RE", n5: "1615",
    };
  },
  facts: () => [
    { key: "next", label: "Next train leaves in", type: "number", value: "t0", unit: " min", format: minutesTo(0) },
    { key: "delay", label: "Next train's delay", type: "number", value: "d0", unit: " min" },
    { key: "cancelled", label: "Next train is cancelled", type: "flag", test: cancelled(0) },
    {
      key: "trouble", label: "Trouble on the line", type: "flag",
      test: { any: [and(upcoming(0), cancelled(0)), and(upcoming(0), late(0, 5)), cancelled(1), late(1, 5), { v: "alert", op: "present" }] },
    },
    { key: "alert", label: "Service alert", type: "flag", test: { v: "alert", op: "present" } },
  ],
  draw(d, s) {
    if (d.height < 110) strip(d);
    else board(d, s);
  },
});
