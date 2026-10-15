import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { compile, type CompileDeps } from "@/compiler";
import { sampleValues } from "@/compiler/sample";
import { createProject } from "@/project/starters";
import type { Project } from "@/project/schema";
import type { Env, SourceSpec } from "../api";
import { formatValue } from "@/runtime/format";
import { parseZone } from "@/runtime/tz";
import aircraft, { airportsIn, boxAround, heading } from "./index";

const milan = { name: "Milan", latitude: 45.46, longitude: 9.19 };
const env = { units: "metric", place: milan, language: "en", timezone: "Europe/Rome", accounts: { google: [], stripe: null, opensky: null } } as unknown as Env;
const settings = aircraft.defaults(env);
const source = (s = settings, e = env) => aircraft.source!(s, e) as SourceSpec | null;

describe("aircraft source", () => {
  it("asks about a box that is square on the ground", () => {
    const b = boxAround(milan, 25);
    expect(b.lamax - b.lamin).toBeCloseTo(50 / 111.32, 3);
    // At 45° a degree of longitude is about 0.7 of one of latitude.
    expect((b.lomax - b.lomin) * Math.cos((45.46 * Math.PI) / 180)).toBeCloseTo(b.lamax - b.lamin, 3);
    const url = new URL(source()!.url);
    expect(Number(url.searchParams.get("lamin"))).toBe(b.lamin);
    expect(Number(url.searchParams.get("lomax"))).toBe(b.lomax);
  });

  it("stays on the globe near the poles and the date line", () => {
    const b = boxAround({ name: "", latitude: 89.9, longitude: 179.9 }, 100);
    expect(b.lamax).toBe(90);
    expect(b.lomax).toBe(180);
  });

  it("has no source without a place", () => {
    expect(source(settings, { ...env, place: null })).toBeNull();
  });

  it("reads each plane's fields from its slot of the positional answer", () => {
    const v = source()!.values;
    expect(v.cs0).toBe("states.0.1");
    expect(v.lat3).toBe("states.3.6");
    expect(v.alt11).toBe("states.11.7");
    expect(v.trk0).toBe("states.0.10");
    expect(v.n).toEqual({ path: "states", agg: "count" });
  });

  it("signs in only with a linked client, and then asks more often", () => {
    expect(source()!.auth).toBeUndefined();
    expect(source()!.every).toBe(5);
    const linked = source(settings, { ...env, accounts: { ...env.accounts, opensky: { clientId: "me-api-client", clientSecret: "shh" } } })!;
    expect(linked.auth?.form).toContainEqual(["grant_type", "client_credentials"]);
    expect(linked.auth?.form).toContainEqual(["client_id", "me-api-client"]);
    expect(linked.auth?.token).toBe("access_token");
    expect(linked.every).toBe(2);
  });

  it("asks for each plane's category and squawk too", () => {
    const s = source()!;
    expect(new URL(s.url).searchParams.get("extended")).toBe("1");
    expect(s.values.cat2).toBe("states.2.17");
    expect(s.values.sq2).toBe("states.2.14");
  });

  it("leaves out planes on the ground only when asked to", () => {
    expect(aircraft.merges!(settings, env).near.skip).toEqual(["alt"]);
    expect(aircraft.merges!({ ...settings, hideGround: false }, env).near.skip).toEqual([]);
  });
});

describe("aircraft details", () => {
  const ctx = { now: 0, zone: parseZone("UTC0"), locale: { days: [], daysShort: [], months: [], monthsShort: [] } };
  it("points each aircraft along its heading", () => {
    const icon = (trk: number | null, kind: Parameters<typeof heading>[0] = "jet") => formatValue(trk, heading(kind), ctx);
    expect(icon(0)).toBe("jet-0");
    expect(icon(355)).toBe("jet-0");
    expect(icon(10)).toBe("jet-0");
    expect(icon(12)).toBe("jet-22");
    expect(icon(100, "heli")).toBe("heli-90");
    expect(icon(250, "prop")).toBe("prop-247");
    // No heading: it still shows, pointing north.
    expect(icon(null, "glider")).toBe("glider-0");
    // The 3D view's solid models, seen side-on when flying east.
    expect(formatValue(90, heading("heavy", "-3d"), ctx)).toBe("heavy-3d-90");
  });

  it("knows the airports around a place", () => {
    const codes = airportsIn(boxAround(milan, 25)).map((a) => a.code);
    expect(codes).toContain("LIN");
    expect(codes).not.toContain("MXP"); // 37 km west
    expect(airportsIn(boxAround(milan, 50)).map((a) => a.code)).toContain("MXP");
  });
});

describe("aircraft on the panel", () => {
  let deps: CompileDeps;
  beforeAll(async () => {
    deps = { library: nodeLibrary, fonts: await loadFonts(), picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };
  });

  function project(layout: string): Project {
    const p = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: milan });
    p.screens[0].widgets = [{ id: "sky", type: "aircraft", x: 0, y: 0, w: 20, h: 12, frame: "none", settings: { layout } }];
    return p;
  }

  it("lists the nearest plane first, and how far and which way it is", async () => {
    const out = await compile(project("list"), deps);
    expect(out.problems).toEqual([]);
    const near = out.widgetSources.get("sky")!.near;
    const values = sampleValues(out, Math.floor(Date.now() / 1000));
    const listed = Array.from({ length: 12 }, (_, i) => [String(values.get(`${near}.cs${i}`)).trim(), values.get(`${near}.dist${i}`)]);
    expect(listed[0][0]).toBe("THY1TU");
    const dists = listed.map(([, dist]) => dist).filter((x): x is number => typeof x === "number");
    expect(dists).toEqual([...dists].sort((a, b) => a - b));
    // Only those within the radius: the box's corners are farther.
    expect(Math.max(...dists)).toBeLessThanOrEqual(25);
    expect(listed.some(([cs]) => cs === "UAE91")).toBe(false);
  });

  it("is never asked from the browser, which OpenSky refuses, and the panel is not told so", async () => {
    const out = await compile(project("list"), deps);
    const sky = out.sources.find((s) => s.source.url.includes("opensky-network.org"))!;
    expect(sky.panelOnly).toMatch(/only answers the panel/);
    expect(JSON.stringify(out.runtime)).not.toContain("panelOnly");
  });

  it("lists the lowest plane first when asked", async () => {
    const p = project("list");
    p.screens[0].widgets[0].settings.order = "low";
    const out = await compile(p, deps);
    expect(out.problems).toEqual([]);
    const near = out.widgetSources.get("sky")!.near;
    const values = sampleValues(out, Math.floor(Date.now() / 1000));
    expect(values.get(`${near}.cs0`)).toMatch(/^IHELI/);
    expect(values.get(`${near}.cs1`)).toMatch(/^IABCD/);
    // The one on the ground is left out.
    const listed = Array.from({ length: 12 }, (_, i) => values.get(`${near}.cs${i}`));
    expect(listed.some((c) => String(c).startsWith("ITY1325"))).toBe(false);
    expect(listed.filter(Boolean)).toHaveLength(7); // and UAE91, in the box's corner, beyond 25 km
  });

  it("keeps a full-panel radar and its list within budget", async () => {
    const blank = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: milan });
    const base = (await compile(blank, deps)).blob.length;
    const radar = (await compile(project("radar"), deps)).blob.length;
    // Every cell holds a dot for every plane; this is what that costs.
    expect(radar - base).toBeLessThan(230_000);
    const sky = (await compile(project("sky"), deps)).blob.length;
    expect(sky - base).toBeLessThan(230_000);
  });
});
