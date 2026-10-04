import type { Condition, Format } from "@/runtime/types";
import { defineExtension, type Draw } from "../api";

export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", "openid", "email"];
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS = 5;

export interface GoogleLink {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  email: string;
}

interface Settings extends Record<string, unknown> {
  calendar: string;
  calendarName: string;
  show: "auto" | "next" | "agenda";
}

const HHMM: Format = { time: "HH:mm" };
// Timed events have start.dateTime; all-day ones only start.date.
const started = (i: number): Condition => ({ all: [{ v: `s${i}`, op: "present" }, { v: `s${i}`, f: { until: true }, op: "absent" }] });
const ongoing = (i: number): Condition => ({ all: [started(i), { v: `e${i}`, f: { until: true }, op: "present" }] });
const allDay = (i: number): Condition => ({ all: [{ v: `s${i}`, op: "absent" }, { v: `a${i}`, op: "present" }] });

function when(d: Draw, i: number, x: number, y: number, w: number, h: number, size: number) {
  d.when(allDay(i), () => d.text("All day", { x, y, w, h, size, weight: 700, valign: "middle" }));
  d.when(ongoing(i), () => d.text("Now", { x, y, w, h, size, weight: 700, valign: "middle" }));
  d.when({ all: [{ v: `s${i}`, op: "present" }, { not: ongoing(i) }] }, () =>
    d.text(d.value(`s${i}`, HHMM), { x, y, w, h, size, weight: 700, valign: "middle" }));
}

function drawNext(d: Draw) {
  const labelH = Math.round(d.height * 0.22);
  const titleH = Math.round(d.height * 0.46);
  const labelSize = d.fit(["In 888 minutes"], d.width, labelH, { max: 32 });
  d.when({ v: "t0", op: "absent" }, () => d.text("Nothing coming up", { x: 0, y: 0, w: d.width, h: d.height, size: labelSize, align: "center", valign: "middle" }));
  d.when({ v: "t0", op: "present" }, () => {
    d.when(ongoing(0), () => d.text(["Now, until ", d.value("e0", HHMM)], { x: 0, y: 0, w: d.width, h: labelH, size: labelSize, valign: "middle" }));
    d.when(allDay(0), () => d.text("Today, all day", { x: 0, y: 0, w: d.width, h: labelH, size: labelSize, valign: "middle" }));
    d.when({ all: [{ v: "s0", op: "present" }, { not: started(0) }] }, () =>
      d.text(["In ", d.value("s0", { until: true, num: { d: 0 } }), " min · ", d.value("s0", HHMM)], { x: 0, y: 0, w: d.width, h: labelH, size: labelSize, valign: "middle" }));
    const size = d.fit(["Quarterly planning review"], d.width, titleH / 2, { weight: 700, max: 64 });
    d.text(d.value("t0"), { x: 0, y: labelH, w: d.width, h: titleH, size, weight: 700, wrap: true, lines: 2, valign: "middle" });
    const whereSize = Math.max(14, Math.min(labelSize, 24));
    d.text(d.value("w0", { fallback: "" }), { x: 0, y: labelH + titleH, w: d.width, h: d.height - labelH - titleH, size: whereSize, valign: "top" });
  });
}

function drawAgenda(d: Draw, calendarName: string) {
  const headH = Math.max(26, Math.round(d.height * 0.14));
  d.text(calendarName || "Calendar", { x: 0, y: 0, w: d.width, h: headH, size: d.fit(["Calendar"], d.width, headH, { max: 28 }), weight: 700, valign: "middle" });
  d.line(0, headH + 2, d.width, headH + 2, { width: 2 });
  const rows = Math.max(1, Math.min(EVENTS, Math.floor((d.height - headH - 6) / 34)));
  const rowH = Math.floor((d.height - headH - 6) / rows);
  const size = d.fit(["88:88  A meeting with a long name"], d.width, rowH, { max: 32 });
  const timeW = d.measure("All day", size, 700) + 14;
  d.when({ v: "t0", op: "absent" }, () => d.text("Nothing coming up", { x: 0, y: headH + 6, w: d.width, h: rowH, size, valign: "middle" }));
  for (let i = 0; i < rows; i++) {
    const y = headH + 6 + i * rowH;
    d.when({ v: `t${i}`, op: "present" }, () => {
      when(d, i, 0, y, timeW, rowH, size);
      d.text(d.value(`t${i}`), { x: timeW, y, w: d.width - timeW, h: rowH, size, valign: "middle" });
    });
  }
}

export default defineExtension<Settings>({
  id: "google-calendar",
  name: "Google Calendar",
  description: "Your next event or the day's agenda. Rules can ask whether you are in a meeting.",
  icon: "calendar-days",
  category: "time",
  size: { min: [4, 2], default: [8, 6] },
  requires: ["google"],
  fields: [
    {
      key: "calendar", label: "Calendar", kind: "remote-select",
      load: async (env) => (env.accounts.google ? (await import("./oauth")).listCalendars(env.accounts.google).then((l) => l.map((c) => ({ value: c.id, label: c.name }))) : []),
    },
    {
      key: "show", label: "Show", kind: "select",
      options: [{ value: "auto", label: "As much as fits" }, { value: "next", label: "The next event" }, { value: "agenda", label: "The next few events" }],
    },
  ],
  defaults: () => ({ calendar: "primary", calendarName: "", show: "auto" }),
  title: (s) => (s.calendarName ? `Calendar: ${s.calendarName}` : "Google Calendar"),
  source(s, env) {
    const a = env.accounts.google;
    if (!a?.refreshToken || !a.clientId) return null;
    const q = "singleEvents=true&orderBy=startTime&maxResults=" + EVENTS + "&fields=items(summary,location,start,end)";
    return {
      url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(s.calendar || "primary")}/events?${q}&timeMin={{now|YYYY-MM-DD[T]HH:mm:ssZ}}`,
      auth: {
        url: TOKEN_URL,
        form: [["grant_type", "refresh_token"], ["refresh_token", a.refreshToken], ["client_id", a.clientId], ["client_secret", a.clientSecret]],
        token: "access_token",
        expires: "expires_in",
      },
      every: 10,
      values: Object.fromEntries(Array.from({ length: EVENTS }, (_, i) => [
        [`t${i}`, `items.${i}.summary`],
        [`s${i}`, `items.${i}.start.dateTime`],
        [`a${i}`, `items.${i}.start.date`],
        [`e${i}`, `items.${i}.end.dateTime`],
        [`w${i}`, `items.${i}.location`],
      ]).flat()),
    };
  },
  sample: () => {
    const at = (min: number) => new Date(Math.ceil(Date.now() / 300000) * 300000 + min * 60000).toISOString().replace(/\.\d+Z$/, "Z");
    return {
      t0: "Design review", s0: at(25), e0: at(85), w0: "Room 4.2",
      t1: "Lunch with Ayşe", s1: at(150), e1: at(210), w1: null,
      t2: "Gym", s2: at(420), e2: at(480), w2: null,
      t3: "Mum's birthday", s3: null, a3: "2026-10-05", e3: null, w3: null,
      t4: null, s4: null, a4: null, e4: null, w4: null,
    };
  },
  facts: () => [
    { key: "next", label: "Next event starts in", type: "number", value: "s0", unit: " min", format: { until: true } },
    { key: "busy", label: "In an event now", type: "flag", test: ongoing(0) },
    { key: "title", label: "Next event's title", type: "text", value: "t0" },
    { key: "any", label: "Anything coming up", type: "flag", test: { v: "t0", op: "present" } },
  ],
  draw(d, s, env) {
    if (!env.accounts.google?.refreshToken) {
      // Nothing to bind to yet; say what is missing rather than drawing dashes.
      const iconH = Math.min(d.height * 0.45, 96);
      d.icon("calendar", { x: 0, y: d.height * 0.12, w: d.width, h: iconH });
      d.text("Connect Google in Panel settings", {
        x: 0, y: d.height * 0.12 + iconH + 8, w: d.width, h: d.height * 0.4, size: d.fit(["Connect Google in Panel"], d.width, 40, { max: 24 }),
        align: "center", wrap: true, lines: 2,
      });
      return;
    }
    const show = s.show === "auto" ? (d.height >= 200 ? "agenda" : "next") : s.show;
    if (show === "next") drawNext(d);
    else drawAgenda(d, s.calendarName);
  },
});
