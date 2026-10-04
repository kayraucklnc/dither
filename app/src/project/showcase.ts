// A whole day on one panel: every widget, rules that follow the clock and
// the trains, and alerts that interrupt when something needs attention.
// It is a starter like the others, and can also be poured into an existing
// project without touching its Wi-Fi, accounts or place.

import { newId } from "./ids";
import type { AlertDef, Project, RuleDef, ScreenDef, Widget } from "./schema";

interface Showcase {
  screens: ScreenDef[];
  rules: RuleDef[];
  alerts: AlertDef[];
  defaultScreenId: string;
}

export function showcase(): Showcase {
  const ids = new Map<string, string>();
  /** A widget whose id rules can refer to by a readable name. */
  const w = (name: string, type: string, x: number, y: number, width: number, h: number, settings: Record<string, unknown> = {}, frame: Widget["frame"] = "none"): Widget => {
    const id = newId("w");
    ids.set(name, id);
    return { id, type, x, y, w: width, h, frame, settings };
  };
  const screen = (name: string, widgets: Widget[]): ScreenDef => ({ id: newId("s"), name, widgets });
  const fact = (widget: string, key: string) => `${ids.get(widget)}:${key}`;

  const home = screen("Home", [
    w("home-clock", "clock", 0, 0, 10, 5, { style: "digits" }),
    w("home-weather", "weather", 10, 0, 10, 6, { detail: "today" }, "outline"),
    w("home-calendar", "google-calendar", 0, 5, 10, 7, { look: "list", density: "dense", header: false, ahead: "1" }),
    w("home-revenue", "stripe", 10, 6, 10, 5, { style: "figure", period: "today" }),
    w("home-status", "status", 10, 11, 10, 1),
  ]);
  const morning = screen("Morning", [
    w("morning-clock", "clock", 0, 0, 8, 4, { style: "tiles" }),
    w("morning-weather", "weather", 8, 0, 12, 7, { detail: "forecast" }, "outline"),
    w("morning-train", "trenord", 0, 4, 8, 8),
    w("morning-calendar", "google-calendar", 8, 7, 12, 5, { look: "next", header: false }),
  ]);
  const commute = screen("Commute", [
    w("commute-train", "trenord", 0, 0, 20, 9),
    w("commute-clock", "clock", 0, 9, 8, 3, { style: "thin", showDate: false }),
    w("commute-weather", "weather", 8, 9, 12, 3, { detail: "now" }),
  ]);
  const work = screen("Work", [
    w("work-calendar", "google-calendar", 0, 0, 12, 12, { look: "agenda", ahead: "0" }),
    w("work-revenue", "stripe", 12, 0, 8, 12, { style: "board", period: "today", names: true }),
  ]);
  const evening = screen("Evening", [
    w("evening-clock", "clock", 0, 0, 7, 7, { style: "dial", numerals: "arabic", date: "dddd" }),
    w("evening-weather", "weather", 7, 0, 13, 7, { detail: "forecast" }, "outline"),
    w("evening-messages", "messages", 0, 7, 13, 5, {}, "inverted"),
    w("evening-countdown", "countdown", 13, 7, 7, 5),
  ]);
  const weekend = screen("Weekend", [
    w("weekend-date", "date", 0, 0, 5, 7),
    w("weekend-weather", "weather", 5, 0, 15, 7, { detail: "forecast" }, "outline"),
    w("weekend-revenue", "stripe", 0, 7, 12, 5, { style: "graph", period: "week", chart: "week" }),
    w("weekend-crypto", "crypto", 12, 7, 8, 5),
  ]);
  const night = screen("Night", [
    w("night-clock", "clock", 0, 0, 20, 10, { style: "words", every: "5" }),
    w("night-status", "status", 0, 11, 20, 1, { showTime: false }),
  ]);

  const time = (from: string, to: string) => ({ fact: "time", op: "between", value: { from, to } });
  const weekdays = { fact: "weekday", op: "in", value: ["weekdays"] };
  const rule = (screenId: string, checks: RuleDef["checks"]): RuleDef => ({ id: newId("r"), screenId, match: "all", enabled: true, checks });

  const rules: RuleDef[] = [
    // Read from the top; the first that holds wins.
    rule(night.id, [time("23:00", "06:00")]),
    rule(commute.id, [weekdays, time("06:30", "09:30"), { fact: fact("morning-train", "next"), op: "lt", value: 25 }]),
    rule(morning.id, [time("06:00", "10:00")]),
    rule(work.id, [weekdays, time("10:00", "18:00")]),
    rule(weekend.id, [{ fact: "weekday", op: "in", value: ["weekend"] }, time("10:00", "18:00")]),
    rule(evening.id, [time("18:00", "23:00")]),
  ];

  const alert = (a: Omit<AlertDef, "id" | "enabled" | "match">, match: AlertDef["match"] = "any"): AlertDef =>
    ({ id: newId("a"), enabled: true, match, ...a });
  const alerts: AlertDef[] = [
    alert({ checks: [{ fact: fact("work-calendar", "next"), op: "le", value: 10 }], icon: "calendar", text: "Your next meeting is about to start", value: fact("work-calendar", "next"), style: "takeover" }),
    alert({ checks: [{ fact: fact("morning-train", "trouble"), op: "is", value: true }], icon: "train-front", text: "Trouble on your line", value: null, style: "banner" }),
    alert({ checks: [{ fact: fact("home-weather", "rain"), op: "ge", value: 60 }], icon: "umbrella", text: "Take an umbrella today", value: fact("home-weather", "rain"), style: "banner" }),
    alert({ checks: [{ fact: "online", op: "is", value: false }], icon: "wifi-off", text: "Offline — showing the last update", value: null, style: "banner" }),
  ];

  return { screens: [home, morning, commute, work, evening, weekend, night], rules, alerts, defaultScreenId: home.id };
}

/** The showcase's screens, rules and alerts, in a project that keeps its own Wi-Fi, accounts and place. */
export function withShowcase(p: Project): Project {
  const s = showcase();
  return { ...p, name: p.name || "Showcase", screens: s.screens, rules: s.rules, alerts: s.alerts, defaultScreenId: s.defaultScreenId };
}
