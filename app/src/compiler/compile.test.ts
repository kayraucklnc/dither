import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { createProject, STARTERS } from "@/project/starters";
import type { Font } from "@/runtime/assets";
import { decodeBlob } from "@/runtime/blob";
import { renderScreen, AssetStore } from "@/runtime/render";
import { builtins } from "@/runtime/values";
import { compile, type CompileDeps } from "./index";

let deps: CompileDeps;
const place = { name: "Milan", latitude: 45.46, longitude: 9.19 };

beforeAll(async () => {
  const fonts: Map<string, Font> = await loadFonts();
  deps = { library: nodeLibrary, fonts, picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };
});

describe("compile", () => {
  it.each(STARTERS.map((s) => s.id))("compiles and draws the %s starter", async (starter) => {
    const project = createProject({ starter, timezone: "Europe/Rome", language: "en", units: "metric", place });
    const out = await compile(project, deps);
    expect(out.problems).toEqual([]);
    const blob = decodeBlob(out.blob);
    expect(blob.runtime.screens).toHaveLength(project.screens.length);
    const values = builtins(Date.UTC(2026, 9, 4, 13, 0) / 1000, out.runtime.tz);
    for (const s of out.sources) for (const [k, v] of s.sample) values.set(k, v);
    const store = new AssetStore(blob.bytes, blob.runtime.assets);
    out.runtime.screens.forEach((_, i) => {
      const fb = renderScreen(out.runtime, store, i, values, Date.UTC(2026, 9, 4, 13, 0) / 1000);
      if (project.screens[i].widgets.length) expect(fb.bits.some((b) => b !== 0)).toBe(true);
    });
  });

  it("turns rules into conditions with the default screen last", async () => {
    const project = createProject({ starter: "clock-weather", timezone: "Europe/Rome", language: "en", units: "metric", place });
    const out = await compile(project, deps);
    expect(out.runtime.rules).toEqual([
      { screen: 1, when: { v: "clock.minutes", op: "between", x: [1380, 420] } },
      { screen: 0, when: null },
    ]);
  });

  it("shares one fetch between two widgets asking the same question", async () => {
    const project = createProject({ starter: "blank", timezone: "UTC", language: "en", units: "metric", place });
    project.screens[0].widgets = [
      { id: "a", type: "weather", x: 0, y: 0, w: 8, h: 6, frame: "none", settings: {} },
      { id: "b", type: "weather", x: 8, y: 0, w: 4, h: 3, frame: "none", settings: { detail: "now" } },
    ];
    const out = await compile(project, deps);
    expect(out.runtime.sources).toHaveLength(1);
    expect(out.sources[0].widgetIds).toEqual(["a", "b"]);
  });

  it.each(STARTERS.map((s) => s.id))("draws the %s starter identically with trimmed fonts", async (starter) => {
    const project = createProject({ starter, timezone: "Europe/Istanbul", language: "tr", units: "metric", place });
    const full = await compile(project, { ...deps, subsetFonts: false });
    const trimmed = await compile(project, deps);
    expect(trimmed.blob.length).toBeLessThanOrEqual(full.blob.length);
    for (const now of [Date.UTC(2026, 9, 4, 13, 0) / 1000, Date.UTC(2026, 1, 28, 21, 59) / 1000]) {
      const values = builtins(now, full.runtime.tz);
      for (const s of full.sources) for (const [k, v] of s.sample) values.set(k, v);
      full.runtime.screens.forEach((_, i) => {
        const a = renderScreen(full.runtime, new AssetStore(full.blob, full.runtime.assets), i, values, now);
        const b = renderScreen(trimmed.runtime, new AssetStore(trimmed.blob, trimmed.runtime.assets), i, values, now);
        expect(Buffer.from(b.bits).equals(Buffer.from(a.bits))).toBe(true);
      });
    }
  });
});
