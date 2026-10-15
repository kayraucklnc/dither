import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { compile, type CompileDeps } from "@/compiler";
import { createProject } from "@/project/starters";
import { expand } from "@/runtime/placeholders";
import { parseZone } from "@/runtime/tz";
import type { Env, SourceSpec } from "../api";
import iss, { HALO, globeInk } from "./index";

const env = { units: "metric", place: { name: "Milan", latitude: 45.46, longitude: 9.19 }, language: "en", timezone: "Europe/Rome", accounts: { google: [], stripe: null, opensky: null } } as unknown as Env;
const settings = iss.defaults(env);
const sources = () => iss.source!(settings, env) as Record<string, SourceSpec>;

describe("space station sources", () => {
  it("asks for one whole orbit, ten positions at a time, around now", () => {
    const s = sources();
    expect(Object.keys(s)).toEqual(["a", "b", "c", "d"]);
    const ctx = { now: 1_800_000_000, zone: parseZone("UTC0"), locale: { days: [], daysShort: [], months: [], monthsShort: [] } };
    const stamps = Object.values(s).flatMap((x) => new URL(expand(x.url, ctx, true)).searchParams.get("timestamps")!.split(",").map(Number));
    expect(stamps).toHaveLength(40);
    expect(stamps[0]).toBe(1_800_000_000 - 20 * 140);
    expect(stamps[20]).toBe(1_800_000_000);
    expect(stamps.at(-1)).toBe(1_800_000_000 + 19 * 140);
    // Its height, speed and daylight come from the point at now.
    expect(s.c.values.alt).toBe("0.altitude");
    expect(s.c.values.vis).toBe("0.visibility");
    expect(s.a.values.la3).toBe("3.latitude");
  });

  it("looks again as often as asked, within reason", () => {
    expect(sources().a.every).toBe(10);
    expect((iss.source!({ ...settings, every: 1 }, env) as Record<string, SourceSpec>).a.every).toBe(5);
  });
});

describe("space station globe", () => {
  it("draws a rim, stippled land and an atmosphere, and leaves the corners empty", () => {
    const R = 60;
    const ink = globeInk(R, 15);
    const at = (x: number, y: number) => ink(HALO + x, HALO + y);
    expect(ink(0, 0)).toBe(false);
    expect(at(R, 0)).toBe(true); // the rim at the top
    // Just outside the rim, the atmosphere: some pixels, not all.
    const air = Array.from({ length: 26 }, (_, i) => ink(HALO + R - 13 + (i % 13), HALO - 2 - Math.floor(i / 13)));
    expect(air.some(Boolean)).toBe(true);
    expect(air.every(Boolean)).toBe(false);
    // Somewhere in the Sahara (about 22° N, 15° E): stippled, so some pixels inked and some not.
    const y = R - Math.round(R * Math.sin((22 * Math.PI) / 180));
    const block = Array.from({ length: 16 }, (_, i) => at(R - 2 + (i % 4), y - 2 + Math.floor(i / 4)));
    expect(block.some(Boolean)).toBe(true);
    expect(block.every(Boolean)).toBe(false);
  });

  it("is lit from the upper left: the far limb is darker than the near one", () => {
    const R = 80;
    const ink = globeInk(R, -150); // the Pacific: nearly all sea
    const density = (cx: number, cy: number) => {
      let n = 0;
      for (let y = -6; y < 6; y++) for (let x = -6; x < 6; x++) n += ink(HALO + cx + x, HALO + cy + y) ? 1 : 0;
      return n;
    };
    expect(density(R + 55, R + 40)).toBeGreaterThan(density(R - 40, R - 40));
  });
});

describe("space station on the panel", () => {
  let deps: CompileDeps;
  beforeAll(async () => {
    deps = { library: nodeLibrary, fonts: await loadFonts(), picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };
  });

  it("carries eight globes and stays within budget", async () => {
    const blank = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: env.place });
    const p = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: env.place });
    p.screens[0].widgets = [{ id: "iss", type: "iss", x: 0, y: 0, w: 20, h: 12, frame: "none", settings: {} }];
    const out = await compile(p, deps);
    expect(out.problems).toEqual([]);
    const globes = out.runtime.assets.length;
    expect(globes).toBeGreaterThanOrEqual(8);
    const base = (await compile(blank, deps)).blob.length;
    // Eight globes and an orbit drawn on each: about as much as the aircraft 3D view.
    expect(out.blob.length - base).toBeLessThan(300_000);
  });
});
