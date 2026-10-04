// What a new project starts from. Each starter is a finished, good-looking
// panel, so the first flash already shows something worth hanging up.

import { newId } from "./ids";
import { PROJECT_VERSION, type Place, type Project, type RuleDef, type ScreenDef, type Widget } from "./schema";

export interface StarterInfo {
  id: string;
  name: string;
  description: string;
}

export const STARTERS: StarterInfo[] = [
  { id: "clock-weather", name: "Clock & weather", description: "The time, today's weather and the next two days. Dims to a quiet clock at night." },
  { id: "dashboard", name: "Daily dashboard", description: "Date, time, weather, a countdown and a thought for the day." },
  { id: "photo", name: "Photo frame", description: "One picture, with the time along the bottom." },
  { id: "blank", name: "Blank", description: "An empty panel. Add what you like." },
];

const w = (type: string, x: number, y: number, width: number, h: number, settings: Record<string, unknown> = {}, frame: Widget["frame"] = "none"): Widget =>
  ({ id: newId("w"), type, x, y, w: width, h, frame, settings });

function screens(starter: string): { screens: ScreenDef[]; rules: (screens: ScreenDef[]) => RuleDef[] } {
  switch (starter) {
    case "clock-weather": {
      const home: ScreenDef = {
        id: newId("s"), name: "Home",
        widgets: [
          w("clock", 0, 0, 11, 7, { style: "digital", showDate: true }),
          w("weather", 11, 0, 9, 11, { detail: "forecast" }, "outline"),
          w("messages", 0, 7, 11, 4),
          w("status", 0, 11, 20, 1),
        ],
      };
      const night: ScreenDef = {
        id: newId("s"), name: "Night",
        widgets: [w("clock", 0, 0, 20, 12, { style: "analog", every: "15" })],
      };
      return {
        screens: [home, night],
        rules: ([, n]) => [{
          id: newId("r"), screenId: n.id, match: "all", enabled: true,
          checks: [{ fact: "time", op: "between", value: { from: "23:00", to: "07:00" } }],
        }],
      };
    }
    case "dashboard":
      return {
        screens: [{
          id: newId("s"), name: "Dashboard",
          widgets: [
            w("date", 0, 0, 5, 7),
            w("clock", 5, 0, 7, 4, { showDate: false }),
            w("countdown", 5, 4, 7, 3),
            w("weather", 12, 0, 8, 7, { detail: "today" }, "outline"),
            w("messages", 0, 7, 20, 4, {}, "inverted"),
            w("status", 0, 11, 20, 1),
          ],
        }],
        rules: () => [],
      };
    case "photo":
      return {
        screens: [{
          id: newId("s"), name: "Photo",
          widgets: [w("picture", 0, 0, 20, 10), w("clock", 0, 10, 8, 2, { showDate: false, every: "15" }), w("status", 8, 10, 12, 2)],
        }],
        rules: () => [],
      };
    default:
      return { screens: [{ id: newId("s"), name: "Home", widgets: [] }], rules: () => [] };
  }
}

export interface NewProjectOptions {
  starter: string;
  timezone: string;
  language: string;
  units: "metric" | "imperial";
  place: Place | null;
}

export function createProject(o: NewProjectOptions): Project {
  const s = screens(o.starter);
  return {
    version: PROJECT_VERSION,
    name: STARTERS.find((x) => x.id === o.starter)?.name ?? "My panel",
    board: "xiao-epaper-75",
    rotation: 0,
    timezone: o.timezone,
    language: o.language,
    units: o.units,
    place: o.place,
    wifi: [{ ssid: "", password: "" }],
    accounts: { google: null, stripe: null },
    refreshMinutes: 15,
    quiet: { enabled: false, from: "23:00", to: "07:00" },
    screens: s.screens,
    defaultScreenId: s.screens[0].id,
    rules: s.rules(s.screens),
    alerts: [],
    images: {},
  };
}
