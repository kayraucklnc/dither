import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { compile, type CompileDeps } from "@/compiler";
import { createProject } from "@/project/starters";
import { formatValue } from "@/runtime/format";
import { parseZone } from "@/runtime/tz";
import type { Env, SourceSpec } from "../api";
import airQuality, { bandOf, indexOf, UV_BAND } from "./index";

const milan = { name: "Milan", latitude: 45.46, longitude: 9.19 };
const env = { units: "metric", place: milan, language: "en", timezone: "Europe/Rome", accounts: {} } as unknown as Env;
const settings = airQuality.defaults(env);
const source = (e = env) => airQuality.source!(settings, e) as SourceSpec | null;
const ctx = { now: 0, zone: parseZone("UTC0"), locale: { days: [], daysShort: [], months: [], monthsShort: [] } };

describe("air quality source", () => {
  it("has no source without a place", () => {
    expect(source({ ...env, place: null })).toBeNull();
  });

  it("asks for the air, the sun and the pollen", () => {
    const url = new URL(source()!.url);
    const current = url.searchParams.get("current")!.split(",");
    expect(current).toEqual(expect.arrayContaining(["european_aqi", "us_aqi", "uv_index", "pm2_5", "grass_pollen", "ragweed_pollen"]));
    expect(url.searchParams.get("daily")).toBe("uv_index_max");
    expect(source()!.values.aqiEuH).toEqual({ path: "hourly.european_aqi", count: 24 });
  });

  it("uses the index of where the panel keeps time", () => {
    expect(indexOf(settings, env)).toBe("eu");
    expect(indexOf(settings, { ...env, timezone: "America/New_York" })).toBe("us");
    expect(indexOf({ ...settings, index: "us" }, env)).toBe("us");
  });
});

describe("bands", () => {
  it("names the air and the sun", () => {
    expect(formatValue(75, bandOf("eu"), ctx)).toBe("Poor");
    expect(formatValue(19, bandOf("eu"), ctx)).toBe("Good");
    expect(formatValue(104, bandOf("us"), ctx)).toBe("Unhealthy for some");
    expect(formatValue(50, bandOf("us"), ctx)).toBe("Good");
    expect(formatValue(6, UV_BAND, ctx)).toBe("High");
    expect(formatValue(2.9, UV_BAND, ctx)).toBe("Low");
  });
});

describe("air quality on the panel", () => {
  let deps: CompileDeps;
  beforeAll(async () => {
    deps = { library: nodeLibrary, fonts: await loadFonts(), picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };
  });

  it("stays small, even with everything shown", async () => {
    const blank = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: milan });
    const base = (await compile(blank, deps)).blob.length;
    const p = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: milan });
    p.screens[0].widgets = [{ id: "aq", type: "air-quality", x: 0, y: 0, w: 20, h: 12, frame: "none", settings: { show: "all" } }];
    const out = await compile(p, deps);
    expect(out.problems).toEqual([]);
    expect(out.blob.length - base).toBeLessThan(60_000);
  });
});
