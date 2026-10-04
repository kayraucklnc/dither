import type { Condition, Format, Part } from "@/runtime/types";
import type { GoogleLink } from "@/project/schema";
import { defineExtension, type Draw, type Env, type SourceSpec } from "../api";

export type { GoogleLink } from "@/project/schema";
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", "openid", "email"];
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

const EVENTS = 6;
const MAX_LANES = 4;

/** One calendar shown on the widget: which account, which of its calendars. */
export interface Lane {
  account: string;
  calendar: string;
  name: string;
}

interface Settings extends Record<string, unknown> {
  /** Empty means every linked account's main calendar. */
  lanes: Lane[];
  look: "agenda" | "list" | "next";
  /** Days beyond today to show: 0 today only, 1 through tomorrow, 6 a week. */
  ahead: string;
  header: boolean;
  places: boolean;
  ends: boolean;
  tags: boolean;
  allday: boolean;
  hours: "24" | "12";
  density: "roomy" | "dense";
}

/** Everything drawing needs from the settings, worked out once. */
interface Opt {
  hm: Format;
  hmSample: string;
  /** Account names per merge position; empty when tags are off or there is one account. */
  labels: string[];
  places: boolean;
  ends: boolean;
  allday: boolean;
  ahead: number;
  rowMin: number;
}

function optOf(s: Settings, labels: string[]): Opt {
  const twelve = s.hours === "12";
  return {
    hm: { time: twelve ? "h:mm A" : "HH:mm" },
    hmSample: twelve ? "12:00 PM" : "88:88",
    labels: s.tags && labels.length > 1 ? labels : [],
    places: s.places,
    ends: s.ends,
    allday: s.allday,
    ahead: Number(s.ahead) || 0,
    rowMin: s.density === "dense" ? 34 : 46,
  };
}

/** The account a lane reads: the one it names, else the first linked. */
export function linkFor(env: Env, id: string): GoogleLink | undefined {
  return env.accounts.google.find((a) => a.id === id) ?? env.accounts.google[0];
}

function lanesOf(s: Settings, env: Env): Lane[] {
  const chosen = s.lanes.filter((l) => env.accounts.google.some((a) => a.id === l.account));
  const lanes = chosen.length ? chosen : env.accounts.google.map((a) => ({ account: a.id, calendar: "primary", name: "" }));
  return lanes.slice(0, MAX_LANES);
}

const laneTitle = (lane: Lane, env: Env) => {
  const a = linkFor(env, lane.account);
  const who = a?.label || a?.email.split("@")[0] || "Calendar";
  return lane.name && lane.calendar !== "primary" ? `${who} · ${lane.name}` : who;
};

// --------------------------------------------------------------- an event, as conditions
//
// Every account's calendar is fetched on its own (sources c0, c1, …) and the
// panel merges them into one agenda: `agenda/<field><n>` for timed events,
// `allday/<field><n>` for all-day ones, duplicates dropped. Fields: title t,
// start s, all-day date a, end e, place w; `from<n>` says which account.

const AGENDA = 8;
const ALLDAY = 3;
const g = (list: string, field: string, n: number) => `${list}/${field}${n}`;

const has = (n: number, list = "agenda"): Condition => ({ v: g(list, "t", n), op: "present" });
/** Present, and within the days the widget looks ahead. */
const within = (n: number, o: Opt, list = "agenda"): Condition =>
  ({ all: [has(n, list), { v: g(list, list === "allday" ? "a" : "s", n), f: { days: true }, op: "le", x: o.ahead }] });
const started = (n: number): Condition => ({ v: g("agenda", "s", n), f: { until: true }, op: "absent" });
const ongoing = (n: number): Condition => ({ all: [has(n), started(n), { v: g("agenda", "e", n), f: { until: true }, op: "present" }] });
const onDay = (n: number, day: number, list = "agenda", field = "s"): Condition => ({ v: g(list, field, n), f: { days: true }, op: "eq", x: day });
const not = (c: Condition): Condition => ({ not: c });
const and = (...c: Condition[]): Condition => ({ all: c });

// --------------------------------------------------------------- drawing

/** Text placed so its baseline sits at `baseline`. */
function at(d: Draw, content: string | Part | (string | Part)[], x: number, baseline: number, w: number, size: number, weight: 400 | 700, opts: { white?: boolean; align?: "left" | "right" } = {}) {
  const m = d.metrics(size, weight);
  d.text(content, { x, y: baseline - m.ascent, w, h: m.lineHeight, size, weight, white: opts.white, align: opts.align });
}

/** "Work · Room 4.2": which account (when there is more than one) and where. */
function detail(d: Draw, n: number, o: Opt, x: number, baseline: number, w: number, size: number, white = false) {
  const who: Format = { map: { k: o.labels.map((_, i) => i), o: o.labels } };
  const account = o.labels.length ? d.value(g("agenda", "from", n), who) : null;
  if (!o.places) {
    if (account) at(d, [account], x, baseline, w, size, 400, { white });
    return;
  }
  const place = d.value(g("agenda", "w", n));
  d.when({ v: g("agenda", "w", n), op: "present" }, () => at(d, account ? [account, " · ", place] : [place], x, baseline, w, size, 400, { white }));
  if (account) d.when({ v: g("agenda", "w", n), op: "absent" }, () => at(d, [account], x, baseline, w, size, 400, { white }));
}

/** The date, large, so the panel answers "what day is it" from across a room. */
function dateHeader(d: Draw, x: number, y: number, w: number, h: number) {
  const big = d.fit(["30"], w * 0.4, h, { weight: 700, max: 112 });
  const m = d.metrics(big, 700);
  const numW = d.measure("30", big, 700);
  d.text(d.time("D"), { x, y: y + Math.round((h - m.lineHeight) / 2), w: numW, h: m.lineHeight, size: big, weight: 700, valign: "middle", align: "right" });
  const side = Math.max(13, Math.min(28, Math.round(big * 0.34), Math.floor(h / 2.5)));
  const sm = d.metrics(side, 700);
  const top = y + Math.round((h - sm.lineHeight * 2) / 2);
  const tx = x + numW + Math.round(big * 0.2);
  d.text(d.time("dddd"), { x: tx, y: top, w: x + w - tx, h: sm.lineHeight, size: side, weight: 700 });
  d.text(d.time("MMMM YYYY"), { x: tx, y: top + sm.lineHeight, w: x + w - tx, h: sm.lineHeight, size: side });
}

/** The event that matters most — on now, or next — as a black card: when, what, where. */
function hero(d: Draw, o: Opt, x: number, y: number, w: number, h: number) {
  d.rect({ x, y, w, h }, { radius: 10 });
  const pad = Math.round(Math.min(h * 0.1, 20));
  const iw = w - pad * 2;
  const kicker = Math.max(14, Math.min(24, Math.round(h * 0.11)));
  const small = Math.max(13, Math.min(22, Math.round(kicker * 0.9)));
  const km = d.metrics(kicker, 700);
  const sm = d.metrics(small);
  // One line of title, as large as a typical one fits; a long one ends in "…".
  const room = h - pad * 2 - km.lineHeight - sm.lineHeight - 12;
  const title = Math.max(18, Math.min(64, d.fit(["Design review"], iw, room, { weight: 700 })));
  const tm = d.metrics(title, 700);
  const lines = 1;
  const block = km.lineHeight + 6 + tm.lineHeight * lines + 6 + sm.lineHeight;
  const top = y + Math.max(pad, Math.round((h - block) / 2));
  const kb = top + km.ascent;

  d.when(not(within(0, o)), () => at(d, "Nothing else on the calendar", x + pad, y + Math.round(h / 2 + kicker * 0.3), iw, kicker, 700, { white: true }));
  d.when(ongoing(0), () => at(d, ["Now · until ", d.value(g("agenda", "e", 0), o.hm)], x + pad, kb, iw, kicker, 700, { white: true }));
  d.when(and(has(0), not(started(0)), onDay(0, 0)), () => {
    d.when({ v: g("agenda", "s", 0), f: { until: true }, op: "lt", x: 60 }, () =>
      at(d, ["Next · in ", d.value(g("agenda", "s", 0), { until: true, num: { d: 0 } }), " min"], x + pad, kb, iw, kicker, 700, { white: true }));
    d.when({ v: g("agenda", "s", 0), f: { until: true }, op: "ge", x: 60 }, () =>
      at(d, ["Next · ", d.value(g("agenda", "s", 0), o.hm)], x + pad, kb, iw, kicker, 700, { white: true }));
  });
  d.when(and(within(0, o), onDay(0, 1)), () => at(d, ["Tomorrow · ", d.value(g("agenda", "s", 0), o.hm)], x + pad, kb, iw, kicker, 700, { white: true }));
  d.when(and(within(0, o), not(onDay(0, 0)), not(onDay(0, 1))), () =>
    at(d, [d.value(g("agenda", "s", 0), { time: `dddd D · ${o.hm.time}` })], x + pad, kb, iw, kicker, 700, { white: true }));

  const titleY = top + km.lineHeight + 6;
  d.when(within(0, o), () => {
    d.text(d.value(g("agenda", "t", 0)), { x: x + pad, y: titleY, w: iw, h: tm.lineHeight * lines, size: title, weight: 700, wrap: lines > 1, lines, white: true });
    detail(d, 0, o, x + pad, titleY + tm.lineHeight * lines + 6 + sm.ascent, iw, small, true);
  });
}

interface RowStyle {
  size: number;
  small: number;
  timeW: number;
  rule: number;
}

/** One later event on the timeline: when on the left, what and where on the right. */
function row(d: Draw, n: number, o: Opt, x: number, y: number, w: number, h: number, st: RowStyle) {
  const textX = st.rule + 12;
  const textW = x + w - textX;
  const mid = y + Math.round(h / 2);
  const top = mid - Math.round(st.size * 0.1);
  const low = top + d.metrics(st.small).lineHeight;
  d.when(within(n, o), () => {
    d.when(onDay(n, 0), () => {
      // On now: said so, with when it ends, and the dot ringed.
      d.when(ongoing(n), () => {
        at(d, "Now", x, top, st.timeW, st.size, 700);
        at(d, ["until ", d.value(g("agenda", "e", n), o.hm)], x, low, st.timeW, st.small, 400);
        d.circle(st.rule, mid, Math.max(5, Math.round(st.size * 0.34)), { fill: false, stroke: 2 });
      });
      d.when(not(ongoing(n)), () => {
        at(d, d.value(g("agenda", "s", n), o.hm), x, top, st.timeW, st.size, 700);
        if (o.ends) at(d, d.value(g("agenda", "e", n), { ...o.hm, fallback: "" }), x, low, st.timeW, st.small, 400);
      });
      d.circle(st.rule, mid, Math.max(3, Math.round(st.size * 0.22)));
    });
    d.when(not(onDay(n, 0)), () => {
      d.when(onDay(n, 1), () => at(d, "Tomorrow", x, top, st.timeW, st.small, 700));
      d.when(not(onDay(n, 1)), () => at(d, d.value(g("agenda", "s", n), { time: "ddd D" }), x, top, st.timeW, st.small, 700));
      at(d, d.value(g("agenda", "s", n), o.hm), x, low, st.timeW, st.small, 400);
      d.circle(st.rule, mid, Math.max(3, Math.round(st.size * 0.22)), { fill: false, stroke: 2 });
    });
    at(d, d.value(g("agenda", "t", n)), textX, top, textW, st.size, 700);
    detail(d, n, o, textX, low, textW, st.small);
  });
}

/** All-day events as a row of pills: what, and when it is not today. */
function pills(d: Draw, o: Opt, x: number, y: number, w: number, h: number) {
  const slots = w >= 520 ? 3 : 2;
  const gap = 8;
  const pw = Math.floor((w - gap * (slots - 1)) / slots);
  const size = Math.max(13, Math.min(18, Math.round(h * 0.42)));
  for (let n = 0; n < Math.min(ALLDAY, slots); n++) {
    const px = x + n * (pw + gap);
    d.when(within(n, o, "allday"), () => {
      d.rect({ x: px, y, w: pw, h }, { fill: false, stroke: 2, radius: h / 2 });
      const base = y + Math.round((h + size * 0.73) / 2);
      d.when(onDay(n, 0, "allday", "a"), () => at(d, [d.value(g("allday", "t", n))], px + 12, base, pw - 24, size, 700));
      d.when(onDay(n, 1, "allday", "a"), () => at(d, ["Tomorrow · ", d.value(g("allday", "t", n))], px + 12, base, pw - 24, size, 700));
      d.when(and(not(onDay(n, 0, "allday", "a")), not(onDay(n, 1, "allday", "a"))), () =>
        at(d, [d.value(g("allday", "a", n), { time: "ddd D" }), " · ", d.value(g("allday", "t", n))], px + 12, base, pw - 24, size, 700));
    });
  }
}

/** The timeline of everything after the hero, moved up when there are no all-day events. */
function timeline(d: Draw, o: Opt, first: number, x: number, y: number, w: number, h: number) {
  const pillH = Math.max(30, Math.min(40, Math.round(h * 0.12)));
  const draw = (top: number) => {
    const avail = y + h - top;
    const rows = Math.max(1, Math.min(AGENDA - first, Math.floor(avail / o.rowMin)));
    const rowH = Math.floor(avail / rows);
    const size = Math.max(14, Math.min(24, Math.round(rowH * (o.rowMin < 40 ? 0.42 : 0.36)), d.fit([`${o.hmSample} Quarterly planning`], w, rowH)));
    const small = Math.max(13, Math.round(size * 0.74));
    const timeW = Math.max(d.measure(o.hmSample, size, 700), d.measure("Tomorrow", small, 700)) + 10;
    const st: RowStyle = { size, small, timeW, rule: x + timeW + 4 };
    for (let r = 1; r < rows; r++) {
      d.when(within(first + r, o), () => d.line(st.rule, top + (r - 1) * rowH + rowH / 2, st.rule, top + r * rowH + rowH / 2, { width: 1 }));
    }
    for (let r = 0; r < rows; r++) row(d, first + r, o, x, top + r * rowH, w, rowH, st);
  };
  if (!o.allday) return draw(y);
  d.when(within(0, o, "allday"), () => {
    pills(d, o, x, y, w, pillH);
    draw(y + pillH + 10);
  });
  d.when(not(within(0, o, "allday")), () => draw(y));
}

/** Too little room: what is now or next, and the one after. */
function compact(d: Draw, o: Opt) {
  const half = Math.floor(d.height / 2);
  hero(d, o, 0, 0, d.width, d.height >= 120 ? half + 20 : d.height);
  if (d.height >= 120) {
    const tw = Math.max(d.measure("Tomorrow", 13, 700), d.measure(o.hmSample, 16, 700)) + 10;
    row(d, 1, o, 0, half + 26, d.width, d.height - half - 26, { size: 16, small: 13, timeW: tw, rule: tw + 4 });
  }
}

function placeholder(d: Draw) {
  const iconH = Math.min(d.height * 0.45, 96);
  d.icon("calendar", { x: 0, y: d.height * 0.12, w: d.width, h: iconH });
  d.text("Connect Google in Panel settings", {
    x: 0, y: d.height * 0.12 + iconH + 8, w: d.width, h: d.height * 0.4, size: d.fit(["Connect Google in Panel"], d.width, 40, { max: 24 }),
    align: "center", wrap: true, lines: 2,
  });
}

function spec(link: GoogleLink, calendar: string): SourceSpec {
  const q = `singleEvents=true&orderBy=startTime&maxResults=${EVENTS}&fields=items(summary,location,start,end)`;
  const values: Record<string, string> = {};
  for (let n = 0; n < EVENTS; n++) {
    Object.assign(values, {
      [`t${n}`]: `items.${n}.summary`,
      [`s${n}`]: `items.${n}.start.dateTime`,
      [`a${n}`]: `items.${n}.start.date`,
      [`e${n}`]: `items.${n}.end.dateTime`,
      [`w${n}`]: `items.${n}.location`,
    });
  }
  return {
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar || "primary")}/events?${q}&timeMin={{now|YYYY-MM-DD[T]HH:mm:ssZ}}`,
    auth: {
      url: TOKEN_URL,
      form: [["grant_type", "refresh_token"], ["refresh_token", link.refreshToken], ["client_id", link.clientId], ["client_secret", link.clientSecret]],
      token: "access_token",
      expires: "expires_in",
    },
    every: 10,
    values,
  };
}

export default defineExtension<Settings>({
  id: "google-calendar",
  name: "Google Calendar",
  description: "Every linked account as one agenda: what is on now, what is next, and the rest of the day.",
  icon: "calendar-days",
  category: "time",
  requires: ["google"],
  size: { min: [4, 3], default: [12, 8] },
  fields: [
    { key: "lanes", label: "Calendars", kind: "calendars", help: "Leave all unticked to show every account's main calendar." },
    {
      key: "look", label: "Look", kind: "select",
      options: [
        { value: "agenda", label: "Agenda — now or next, then the rest" },
        { value: "list", label: "List — everything on one timeline" },
        { value: "next", label: "Next up — one event, large" },
      ],
    },
    {
      key: "ahead", label: "Show", kind: "select",
      options: [{ value: "0", label: "Today only" }, { value: "1", label: "Today and tomorrow" }, { value: "6", label: "The next 7 days" }],
    },
    { key: "hours", label: "Times", kind: "select", options: [{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }] },
    { key: "density", label: "Rows", kind: "select", options: [{ value: "roomy", label: "Roomy" }, { value: "dense", label: "Dense — more events" }], visible: (s) => s.look !== "next" },
    { key: "header", label: "Show the date", kind: "toggle" },
    { key: "places", label: "Show where", kind: "toggle" },
    { key: "ends", label: "Show when events end", kind: "toggle", visible: (s) => s.look !== "next" },
    { key: "tags", label: "Say which account", kind: "toggle", help: "Only when more than one calendar is shown." },
    { key: "allday", label: "Show all-day events", kind: "toggle", visible: (s) => s.look !== "next" },
  ],
  defaults: () => ({
    lanes: [], look: "agenda", ahead: "6", header: true, places: true, ends: true, tags: true, allday: true, hours: "24", density: "roomy",
  }),
  title: (s, env) => `Calendar: ${lanesOf(s, env).map((l) => laneTitle(l, env)).join(" + ") || "none"}`,
  source(s, env) {
    const out: Record<string, SourceSpec> = {};
    lanesOf(s, env).forEach((lane, i) => {
      const link = linkFor(env, lane.account);
      if (link?.refreshToken) out[`c${i}`] = spec(link, lane.calendar);
    });
    return Object.keys(out).length ? out : null;
  },
  merges(s, env) {
    const from = lanesOf(s, env).map((_, i) => `c${i}`);
    const fields = ["t", "s", "a", "e", "w"];
    return {
      // The same meeting on two accounts is one meeting.
      agenda: { from, fields, count: AGENDA, skip: ["t", "s"], sort: ["s"], unique: ["t", "s"] },
      allday: { from, fields, count: ALLDAY, skip: ["t", "a"], sort: ["a"], unique: ["t", "a"] },
    };
  },
  sample: (s, env) => {
    const now = Date.now();
    const iso = (min: number) => new Date(Math.round(now / 300000) * 300000 + min * 60000).toISOString().replace(/\.\d+Z$/, "Z");
    const day = (n: number) => new Date(now + n * 86400000).toISOString().slice(0, 10);
    const lanes: Record<string, unknown>[] = [
      { t0: "Standup", s0: iso(-10), e0: iso(20), w0: "Meet", t1: "Design review", s1: iso(55), e1: iso(115), w1: "Room 4.2", t2: "1:1 with Ayşe", s2: iso(180), e2: iso(210), t3: "Quarterly planning", s3: iso(1500), e3: iso(1620), w3: "Board room", t4: "Offsite", a4: day(3) },
      { t0: "Mum's birthday", a0: day(0), t1: "Gym", s1: iso(240), e1: iso(300), w1: "Fit Club", t2: "Design review", s2: iso(55), e2: iso(115), w2: "Room 4.2", t3: "Dinner with Deniz", s3: iso(360), e3: iso(480), w3: "Kadıköy" },
      { t0: "Pick up the kids", s0: iso(90), e0: iso(120), t1: "Piano lesson", s1: iso(1470), e1: iso(1530) },
    ];
    const out: Record<string, unknown> = {};
    lanesOf(s, env).forEach((_, i) => {
      for (const [key, v] of Object.entries(lanes[i % lanes.length])) out[`c${i}/${key}`] = v;
    });
    return out as Record<string, string | number | null>;
  },
  facts: () => [
    { key: "busy", label: "In an event now", type: "flag", test: ongoing(0) },
    { key: "next", label: "Next event starts in", type: "number", value: g("agenda", "s", 0), unit: " min", format: { until: true } },
    { key: "title", label: "Next event's title", type: "text", value: g("agenda", "t", 0) },
    { key: "allday", label: "An all-day event today", type: "flag", test: and(has(0, "allday"), onDay(0, 0, "allday", "a")) },
  ],
  draw(d, s, env) {
    const lanes = lanesOf(s, env);
    if (lanes.length === 0 || !lanes.some((l) => linkFor(env, l.account)?.refreshToken)) return placeholder(d);
    const o = optOf(s, lanes.map((l) => laneTitle(l, env)));
    if (d.height < 200 || d.width < 260) return compact(d, o);
    const wide = d.width >= d.height * 1.35 && d.width >= 480;

    if (s.look === "next") {
      const headH = s.header && d.height >= 260 ? Math.max(44, Math.min(110, Math.round(d.height * 0.22))) : 0;
      if (headH) dateHeader(d, 0, 0, d.width, headH);
      return hero(d, o, 0, headH ? headH + 12 : 0, d.width, d.height - (headH ? headH + 12 : 0));
    }
    if (s.look === "list") {
      if (wide && s.header) {
        const left = Math.round(d.width * 0.3);
        dateHeader(d, 0, 0, left, Math.min(d.height, 130));
        return timeline(d, o, 0, left + 24, 0, d.width - left - 24, d.height);
      }
      const headH = s.header && d.height >= 260 ? Math.max(44, Math.min(90, Math.round(d.height * 0.15))) : 0;
      if (headH) dateHeader(d, 0, 0, d.width, headH);
      return timeline(d, o, 0, 0, headH ? headH + 14 : 0, d.width, d.height - (headH ? headH + 14 : 0));
    }
    if (wide) {
      // Side by side: the day and what matters now on the left, the rest on the right.
      const left = Math.round(d.width * 0.4);
      const headH = s.header ? Math.max(56, Math.min(130, Math.round(d.height * 0.3))) : 0;
      if (headH) dateHeader(d, 0, 0, left, headH);
      hero(d, o, 0, headH ? headH + 14 : 0, left, d.height - (headH ? headH + 14 : 0));
      timeline(d, o, 1, left + 24, 0, d.width - left - 24, d.height);
      return;
    }
    const headH = s.header && d.height >= 300 ? Math.max(44, Math.min(90, Math.round(d.height * 0.15))) : 0;
    if (headH) dateHeader(d, 0, 0, d.width, headH);
    const heroY = headH ? headH + 10 : 0;
    const heroH = Math.max(96, Math.min(170, Math.round(d.height * 0.3)));
    hero(d, o, 0, heroY, d.width, heroH);
    timeline(d, o, 1, 0, heroY + heroH + 14, d.width, d.height - heroY - heroH - 14);
  },
});
