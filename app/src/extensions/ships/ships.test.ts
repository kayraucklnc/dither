import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { compile, type CompileDeps } from "@/compiler";
import { sampleValues } from "@/compiler/sample";
import { createProject } from "@/project/starters";
import type { Project } from "@/project/schema";
import type { Env, SourceSpec } from "../api";
import { boxAround } from "../geo";
import { formatValue } from "@/runtime/format";
import { parseZone } from "@/runtime/tz";
import ships, { boundsFor, course, shapeOf, STATUS, TYPE } from "./index";
import { COAST } from "./coast";
import { expandTo, landMask, letterbox, paddedBounds, ringsFor, ringsOf } from "./coast-draw";
import { AREA_CAP, REGIONS, areaOf, boundsOf, regionOf } from "./regions";

const istanbul = { name: "Istanbul", latitude: 41.01, longitude: 28.98 };
const env = { units: "metric", place: istanbul, language: "en", timezone: "Europe/Istanbul", accounts: { google: [], stripe: null, opensky: null, finnhub: null } } as unknown as Env;
const settings = ships.defaults(env);
const source = (s = settings, e = env) => ships.source!(s, e) as SourceSpec | null;

describe("the regions", () => {
  it("are distinct boxes small enough for an anonymous request, each with a coast", () => {
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
    for (const r of REGIONS) {
      const b = boundsOf(r);
      expect(b.south, r.id).toBeLessThan(b.north);
      expect(b.west, r.id).toBeLessThan(b.east);
      expect(areaOf(b), r.id).toBeLessThanOrEqual(AREA_CAP);
      expect(COAST[r.id]?.length, r.id).toBeGreaterThan(0);
      expect(ringsOf(r.id).length, r.id).toBeGreaterThan(0);
    }
  });

  it("keep every coast point inside the padded box, and the table small", () => {
    for (const r of REGIONS) {
      const b = paddedBounds(boundsOf(r));
      let outside = 0;
      for (const ring of ringsOf(r.id)) {
        for (const [lon, lat] of ring) if (lon < b.west - 1e-9 || lon > b.east + 1e-9 || lat < b.south - 1e-9 || lat > b.north + 1e-9) outside++;
      }
      expect(outside, r.id).toBe(0);
    }
    expect(readFileSync(new URL("./coast.ts", import.meta.url)).length).toBeLessThan(384 * 1024);
  });

  it("draw the Bosphorus as a strait between two shores", () => {
    const b = boundsOf(regionOf("bosphorus")!);
    const w = 240;
    const h = 200;
    const land = landMask([ringsOf("bosphorus")], b, w, h);
    const at = (lat: number, lon: number) => land[Math.floor(((b.north - lat) / (b.north - b.south)) * h) * w + Math.floor(((lon - b.west) / (b.east - b.west)) * w)];
    expect(at(41.25, 29.15), "the Black Sea").toBe(0);
    expect(at(41.02, 28.95), "Fatih").toBe(1);
    expect(at(41.1, 29.2), "Beykoz, the Asian shore").toBe(1);
    const row = Math.floor(((b.north - 41.12) / (b.north - b.south)) * h);
    const from = Math.floor(((29.0 - b.west) / (b.east - b.west)) * w);
    const to = Math.floor(((29.1 - b.west) / (b.east - b.west)) * w);
    const water = Array.from({ length: to - from }, (_, i) => land[row * w + from + i]).filter((v) => v === 0).length;
    expect(water, "the strait is open at 41.12° N").toBeGreaterThan(0);
  });

  it("lend a custom box the smallest preset that holds it, or every one it overlaps", () => {
    expect(ringsFor({ south: 41.0, west: 29.0, north: 41.2, east: 29.2 })).toEqual([ringsOf("bosphorus")]);
    expect(ringsFor({ south: 40.9, west: 28.5, north: 41.4, east: 29.5 })).toEqual([ringsOf("istanbul")]);
    // 25 km around Istanbul sits within the Istanbul preset's padded box; a wider box straddles it, the Marmara and the Bosphorus.
    expect(ringsFor({ south: 40.7854, west: 28.6824, north: 41.2346, east: 29.2776 })).toEqual([ringsOf("istanbul")]);
    const around = ringsFor({ south: 40.5, west: 27.5, north: 41.5, east: 29.9 });
    expect(around.length).toBeGreaterThanOrEqual(3);
    expect(around).toContain(ringsOf("istanbul"));
    expect(around).toContain(ringsOf("marmara"));
    expect(around).toContain(ringsOf("bosphorus"));
    expect(ringsFor({ south: 10, west: 10, north: 11, east: 11 })).toEqual([]);
  });

  it("fill overlapping presets over one another, not through one another", () => {
    const b = { south: 40.5, west: 27.5, north: 41.5, east: 29.9 };
    const w = 200;
    const h = 200;
    const both = landMask(ringsFor(b), b, w, h);
    const one = landMask([ringsOf("istanbul")], b, w, h);
    // Wherever the Istanbul preset says land, so does the pair: nothing cancelled.
    for (let i = 0; i < w * h; i++) if (one[i]) expect(both[i]).toBe(1);
    expect(both.reduce((n, v) => n + v, 0)).toBeGreaterThan(one.reduce((n, v) => n + v, 0));
  });

  it("grow the waters to the chart's shape, as far as the coast is known", () => {
    const b = boundsOf(regionOf("bosphorus")!);
    const wide = expandTo(b, 2, paddedBounds(b));
    expect(wide.south).toBe(b.south);
    expect(wide.north).toBe(b.north);
    expect(wide.west).toBeLessThan(b.west);
    expect(wide.east).toBeGreaterThan(b.east);
    expect(wide.west).toBeGreaterThanOrEqual(paddedBounds(b).west);
    expect((wide.west + wide.east) / 2).toBeCloseTo((b.west + b.east) / 2, 9);
    const tall = expandTo(b, 0.3, paddedBounds(b));
    expect(tall.west).toBe(b.west);
    expect(tall.south).toBeLessThan(b.south);
    expect(tall.north).toBeGreaterThan(b.north);
  });

  it("letterbox a box to its shape on the ground", () => {
    const plot = letterbox({ south: 59.2, west: 22.5, north: 60.7, east: 30.3 }, { x: 0, y: 0, w: 400, h: 400 });
    // 7.8° of longitude at 60° N is about 3.9° of latitude wide: wider than tall.
    expect(plot.w).toBe(400);
    expect(plot.h).toBeGreaterThan(140);
    expect(plot.h).toBeLessThan(170);
    expect(plot.y).toBe(Math.floor((400 - plot.h) / 2));
  });
});

describe("ships source", () => {
  it("asks Open Waters about the region's box, for ships heard lately", () => {
    const s = source()!;
    expect(s.url).toBe("https://ais.openwaters.io/v1/vessels?bbox=40.98,28.9,41.28,29.22&max_age=600");
    expect(s.every).toBe(10);
    expect(s.panelOnly).toBeUndefined();
    expect(source({ ...settings, maxAge: "1800" })!.url).toContain("max_age=1800");
  });

  it("reads each ship's fields from its slot of the GeoJSON", () => {
    const v = source()!.values;
    expect(v.lat3).toBe("features.3.geometry.coordinates.1");
    expect(v.lon3).toBe("features.3.geometry.coordinates.0");
    expect(v.name0).toBe("features.0.properties.name");
    expect(v.nav11).toBe("features.11.properties.nav_status");
    expect(v.n).toEqual({ path: "features", agg: "count" });
    expect(v.lat12).toBeUndefined();
  });

  it("carries more ships, with less about each, on a chart; only speeds for a count", () => {
    expect(shapeOf({ ...settings, layout: "chart" })).toEqual({ slots: 24, fields: ["name", "lat", "lon", "sog", "cog", "hdg"] });
    const chart = source({ ...settings, layout: "chart" })!.values;
    expect(chart.lat23).toBeDefined();
    expect(chart.name23).toBeDefined();
    expect(chart.dest0).toBeUndefined();
    const count = source({ ...settings, layout: "count" })!.values;
    expect(Object.keys(count).sort()).toEqual(["n", ...Array.from({ length: 20 }, (_, i) => `sog${i}`)].sort());
  });

  it("boxes a place of one's own, and asks nothing without one", () => {
    const custom = { ...settings, region: "custom", radius: 25 };
    const b = boxAround(istanbul, 25);
    expect(boundsFor(custom, env)).toEqual({ south: b.lamin, west: b.lomin, north: b.lamax, east: b.lomax });
    expect(source(custom, { ...env, place: null })).toBeNull();
    expect(boundsFor({ ...settings, region: "nowhere" }, env)).toEqual(boundsOf(regionOf("bosphorus")!));
  });

  it("keeps every layout's slots within a modest share of the panel's cache", () => {
    for (const layout of ["auto", "chart", "list", "hero", "count"] as const) {
      const s = { ...settings, layout };
      const sample = ships.sample!(s, env);
      const bytes = Object.entries(source(s)!.values).reduce((sum, [key]) => {
        const v = sample[key];
        return sum + 4 + key.length + 3 + (typeof v === "string" ? 4 + v.length : 9);
      }, 0);
      expect(bytes, layout).toBeLessThan(4 * 1024);
    }
  });
});

describe("ships details", () => {
  const ctx = { now: 0, zone: parseZone("UTC0"), locale: { days: [], daysShort: [], months: [], monthsShort: [] } };
  it("turns each hull to its course", () => {
    const icon = (cog: number | null, kind: "ship" | "boat" = "ship") => formatValue(cog, course(kind), ctx);
    expect(icon(0)).toBe("ship-0");
    expect(icon(355)).toBe("ship-0");
    expect(icon(12)).toBe("ship-22");
    expect(icon(90)).toBe("ship-90");
    expect(icon(250, "boat")).toBe("boat-247");
    // No course, or AIS's "not available": it points north.
    expect(icon(null)).toBe("ship-0");
    expect(icon(360)).toBe("ship-0");
  });

  it("says what a ship is doing and what it is", () => {
    expect(formatValue(1, STATUS, ctx)).toBe("At anchor");
    expect(formatValue(5, STATUS, ctx)).toBe("Moored");
    expect(formatValue(15, STATUS, ctx)).toBe("");
    expect(formatValue(null, STATUS, ctx)).toBe("");
    expect(formatValue(70, TYPE, ctx)).toBe("Cargo");
    expect(formatValue(89, TYPE, ctx)).toBe("Tanker");
    expect(formatValue(36, TYPE, ctx)).toBe("Sailing");
    expect(formatValue(52, TYPE, ctx)).toBe("Tug");
    expect(formatValue(29, TYPE, ctx)).toBe("");
    expect(formatValue(null, TYPE, ctx)).toBe("");
  });
});

describe("ships on the panel", () => {
  let deps: CompileDeps;
  beforeAll(async () => {
    deps = { library: nodeLibrary, fonts: await loadFonts(), picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };
  });

  function project(widgets: { id: string; w: number; h: number; settings: Record<string, unknown> }[]): Project {
    const p = createProject({ starter: "blank", timezone: "Europe/Istanbul", language: "en", units: "metric", place: istanbul });
    let x = 0;
    p.screens[0].widgets = widgets.map(({ id, w, h, settings }) => ({ id, type: "ships", x: (x += w) - w, y: 0, w, h, frame: "none" as const, settings }));
    return p;
  }

  it("lists the fastest ship first, and knows which are under way", async () => {
    const out = await compile(project([{ id: "sea", w: 20, h: 12, settings: { layout: "list" } }]), deps);
    expect(out.problems).toEqual([]);
    const fleet = out.widgetSources.get("sea")!.fleet;
    const moving = out.widgetSources.get("sea")!.moving;
    const values = sampleValues(out, Math.floor(Date.now() / 1000));
    const speeds = Array.from({ length: 12 }, (_, i) => values.get(`${fleet}.sog${i}`)).filter((x): x is number => typeof x === "number");
    expect(values.get(`${fleet}.name0`)).toBe("TURGUT-REIS");
    expect(speeds).toEqual([...speeds].sort((a, b) => b - a));
    expect(speeds).toHaveLength(12);
    // Seven of the first twelve sample ships make half a knot.
    expect(values.get(`${moving}.sog6`)).toBeTypeOf("number");
    expect(values.get(`${moving}.sog7`)).toBeNull();
  });

  it("leaves the stopped ones out of the list when asked", async () => {
    const out = await compile(project([{ id: "sea", w: 20, h: 12, settings: { layout: "list", show: "underway" } }]), deps);
    const fleet = out.widgetSources.get("sea")!.fleet;
    const values = sampleValues(out, Math.floor(Date.now() / 1000));
    const listed = Array.from({ length: 12 }, (_, i) => values.get(`${fleet}.name${i}`)).filter(Boolean);
    expect(listed).toHaveLength(7);
    expect(listed).not.toContain("LEADER S");
  });

  it("asks once for a region shown twice, with everything both need", async () => {
    const out = await compile(project([{ id: "chart", w: 12, h: 12, settings: { layout: "chart" } }, { id: "list", w: 8, h: 12, settings: { layout: "list" } }]), deps);
    expect(out.problems).toEqual([]);
    const sources = out.sources.filter((s) => s.source.url.includes("openwaters.io"));
    expect(sources).toHaveLength(1);
    const keys = sources[0].source.values.map((v) => v.key);
    expect(keys).toContain("lat23");
    expect(keys).toContain("dest11");
  });

  it("draws every layout, and keeps a full-panel chart within budget", async () => {
    const base = (await compile(createProject({ starter: "blank", timezone: "Europe/Istanbul", language: "en", units: "metric", place: istanbul }), deps)).blob.length;
    for (const layout of ["auto", "chart", "list", "hero", "count"]) {
      const out = await compile(project([{ id: "sea", w: 20, h: 12, settings: { layout } }]), deps);
      expect(out.problems, layout).toEqual([]);
      if (layout === "chart") expect(out.blob.length - base).toBeLessThan(150_000);
    }
    const custom = await compile(project([{ id: "sea", w: 20, h: 12, settings: { layout: "chart", region: "custom", radius: 20 } }]), deps);
    expect(custom.problems).toEqual([]);
  });
});
