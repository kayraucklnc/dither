import type { GoogleLink } from "@/project/schema";
import { defineExtension, type Draw, type Env, type SourceSpec } from "../api";
import { agenda } from "./agenda";
import { MIXED, TIMED, and, dayIs, not, ongoing, or, ref, timed } from "./events";
import { dateBar, datePane, focus } from "./focus";
import type { Opt } from "./style";

export type { GoogleLink } from "@/project/schema";
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", "openid", "email"];
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

const EVENTS = 8;
const MAX_LANES = 4;
/** Records kept by each merge: as many as the tallest agenda can show. */
const COUNT = 8;

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

function optOf(s: Settings, labels: string[]): Opt {
  const twelve = s.hours === "12";
  return {
    hm: { time: twelve ? "h:mm A" : "HH:mm" },
    hmShapes: twelve ? ["##:## AM", "##:## PM"] : ["##:##"],
    labels: s.tags && labels.length > 1 ? labels : [],
    places: s.places,
    ends: s.ends,
    ahead: Number(s.ahead) || 0,
    dense: s.density === "dense",
    emphasis: s.look !== "list",
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

// --------------------------------------------------------------- drawing

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
  description: "Every linked account as one agenda, day by day: what is on now, what is next, and the days ahead.",
  icon: "calendar-days",
  category: "time",
  requires: ["google"],
  size: { min: [4, 3], default: [12, 8] },
  fields: [
    { key: "lanes", label: "Calendars", kind: "calendars", help: "Leave all unticked to show every account's main calendar." },
    {
      key: "look", label: "Look", kind: "select",
      options: [
        { value: "agenda", label: "Agenda — by day, what is on now stands out" },
        { value: "list", label: "List — by day, every event alike" },
        { value: "next", label: "Next up — one event large, then what follows" },
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
      [TIMED.name]: { from, fields, count: COUNT, skip: ["t", "s"], sort: ["s"], unique: ["t", "s"] },
      // All-day events too, each first on its day (a date alone is local midnight).
      [MIXED.name]: { from, fields, count: COUNT, skip: ["t"], sort: ["s", "a"], unique: ["t", "s", "a"] },
    };
  },
  sample: (s, env) => {
    const now = Date.now();
    const iso = (min: number) => new Date(Math.round(now / 300000) * 300000 + min * 60000).toISOString().replace(/\.\d+Z$/, "Z");
    const day = (n: number) => new Date(now + n * 86400000).toISOString().slice(0, 10);
    const lanes: Record<string, unknown>[] = [
      {
        t0: "Standup", s0: iso(-10), e0: iso(20), w0: "Meet",
        t1: "Design review", s1: iso(40), e1: iso(100), w1: "Room 4.2",
        t2: "1:1 with Ayşe", s2: iso(180), e2: iso(210),
        t3: "Quarterly planning", s3: iso(1500), e3: iso(1620), w3: "Board room",
        t4: "Offsite", a4: day(2),
      },
      { t0: "Mum's birthday", a0: day(0), t1: "Gym", s1: iso(240), e1: iso(300), w1: "Fit Club", t2: "Design review", s2: iso(40), e2: iso(100), w2: "Room 4.2", t3: "Dinner with Deniz", s3: iso(360), e3: iso(480), w3: "Kadıköy" },
      { t0: "Pick up the kids", s0: iso(90), e0: iso(120), t1: "Piano lesson", s1: iso(1470), e1: iso(1530) },
    ];
    const out: Record<string, unknown> = {};
    lanesOf(s, env).forEach((_, i) => {
      for (const [key, v] of Object.entries(lanes[i % lanes.length])) out[`c${i}/${key}`] = v;
    });
    return out as Record<string, string | number | null>;
  },
  facts: () => [
    { key: "busy", label: "In an event now", type: "flag", test: ongoing(TIMED, 0) },
    { key: "next", label: "Next event starts in", type: "number", value: ref(TIMED, "s", 0), unit: " min", format: { until: true } },
    { key: "title", label: "Next event's title", type: "text", value: ref(TIMED, "t", 0) },
    // All-day events come first on their day, so today's are among the first few.
    { key: "allday", label: "An all-day event today", type: "flag", test: or(...[0, 1, 2, 3].map((n) => and(not(timed(MIXED, n)), dayIs(MIXED, n, "0")))) },
  ],
  draw(d, s, env) {
    const lanes = lanesOf(s, env);
    if (lanes.length === 0 || !lanes.some((l) => linkFor(env, l.account)?.refreshToken)) return placeholder(d);
    const o = optOf(s, lanes.map((l) => laneTitle(l, env)));
    const full = { x: 0, y: 0, w: d.width, h: d.height };
    const below = (top: number) => ({ x: 0, y: top, w: d.width, h: d.height - top });

    if (s.look === "next") {
      if (s.header && d.height >= 260) return focus(d, o, below(dateBar(d, full) + 16));
      return focus(d, o, full);
    }
    const list = s.allday ? MIXED : TIMED;
    // Wide: the date as a page on the left, the agenda beside it.
    if (s.header && d.width >= 600 && d.width >= d.height * 1.3) {
      const pane = Math.max(150, Math.min(210, Math.round(d.width * 0.24)));
      datePane(d, { x: 0, y: 0, w: pane, h: d.height });
      d.rect({ x: pane + 16, y: 0, w: 2, h: d.height });
      return agenda(d, list, o, { x: pane + 40, y: 0, w: d.width - pane - 40, h: d.height }, COUNT);
    }
    if (s.header && d.height >= 330) return agenda(d, list, o, below(dateBar(d, full) + 14), COUNT);
    agenda(d, list, o, full, COUNT);
  },
});
