import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { compile, type Compiled, type CompileDeps } from "@/compiler";
import { createProject } from "@/project/starters";
import { activityNames } from "./labels";

let deps: CompileDeps;
const place = { name: "Milan", latitude: 45.46, longitude: 9.19 };

beforeAll(async () => {
  deps = { library: nodeLibrary, fonts: await loadFonts(), picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };
});

describe("activityNames", () => {
  it("names sources after their widgets and screens after the project", async () => {
    const project = createProject({ starter: "clock-weather", timezone: "Europe/Rome", language: "en", units: "metric", place });
    const compiled = await compile(project, deps);
    const names = activityNames(project, compiled);
    expect(names.screens).toEqual(project.screens.map((s) => s.name));
    expect(compiled.sources.length).toBeGreaterThan(0);
    for (const s of compiled.sources) {
      const name = names.sources.get(s.source.id);
      expect(name).toBeTruthy();
      expect(name).not.toBe(s.source.id);
    }
  });

  it("numbers sources that would read the same", () => {
    const project = createProject({ starter: "clock-weather", timezone: "Europe/Rome", language: "en", units: "metric", place });
    const weather = project.screens.flatMap((s) => s.widgets).find((w) => w.type === "weather");
    expect(weather).toBeDefined();
    const fake = {
      runtime: { screens: [{ name: "Only" }] },
      sources: [
        { source: { id: "s0" }, widgetIds: [weather!.id] },
        { source: { id: "s1" }, widgetIds: [weather!.id] },
        { source: { id: "s2" }, widgetIds: ["gone"] },
      ],
    } as unknown as Compiled;
    const names = activityNames(project, fake);
    expect(names.sources.get("s0")).toMatch(/\(1\)$/);
    expect(names.sources.get("s1")).toMatch(/\(2\)$/);
    expect(names.sources.get("s2")).toBe("s2");
    expect(names.screens).toEqual(["Only"]);
  });

  it("falls back to the project's screen names before anything compiles", () => {
    const project = createProject({ starter: "clock-weather", timezone: "Europe/Rome", language: "en", units: "metric", place });
    expect(activityNames(project, null)).toEqual({ sources: new Map(), screens: project.screens.map((s) => s.name) });
  });
});
