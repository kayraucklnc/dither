import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { compile, type CompileDeps } from "@/compiler";
import { createProject } from "@/project/starters";
import { encodeBitmap } from "@/runtime/assets";
import { evaluate } from "@/runtime/conditions";
import { parseZone } from "@/runtime/tz";
import type { Condition, Value } from "@/runtime/types";
import type { Env } from "../api";
import gallery, { shows } from "./index";
import { COLLECTION, COLLECTION_IMAGES, collectionId } from "./collection";

const ctx = { now: 0, zone: parseZone("UTC0"), locale: { days: [], daysShort: [], months: [], monthsShort: [] } };
const holds = (c: Condition | null, clock: Record<string, Value>) =>
  c === null || evaluate(c, new Map(Object.entries(clock).map(([k, v]) => [`clock.${k}`, v])), ctx);
/** Which pictures are up at this moment. */
const up = (count: number, every: number, clock: Record<string, Value>) =>
  Array.from({ length: count }, (_, i) => i).filter((i) => holds(shows(i, count, every), clock));

describe("gallery rotation", () => {
  it("shows exactly one picture at every minute of the day, in turn", () => {
    for (const [count, every] of [[3, 60], [8, 15], [5, 180], [2, 30]]) {
      for (let m = 0; m < 1440; m++) {
        expect(up(count, every, { minutes: m, day: 1 })).toEqual([Math.floor(m / every) % count]);
      }
    }
  });

  it("changes by the day of the month when asked to change daily", () => {
    for (let day = 1; day <= 31; day++) expect(up(4, 1440, { minutes: 600, day })).toEqual([(day - 1) % 4]);
  });

  it("falls back to the first picture while the clock is unknown", () => {
    expect(up(3, 60, { minutes: null, day: null })).toEqual([0]);
    expect(up(3, 1440, { minutes: null, day: null })).toEqual([0]);
  });

  it("needs no condition for a single picture", () => {
    expect(shows(0, 1, 60)).toBeNull();
  });
});

describe("gallery collection", () => {
  it("ships every print it lists, and only public-domain ones", () => {
    for (const p of COLLECTION) {
      expect(existsSync(resolve(__dirname, "../../../public/gallery", `${p.id}.jpg`)), p.id).toBe(true);
      expect(["Public domain", "CC0"]).toContain(p.licence);
    }
  });

  it("starts a new gallery with prints from the collection", () => {
    const s = gallery.defaults({} as Env);
    expect((s.images as string[]).length).toBeGreaterThan(1);
    for (const id of s.images as string[]) expect(COLLECTION_IMAGES[id]).toBeDefined();
  });
});

describe("gallery on the panel", () => {
  let deps: CompileDeps;
  const asked: string[] = [];
  beforeAll(async () => {
    deps = {
      library: nodeLibrary, fonts: await loadFonts(), boardPanel: () => ({ width: 800, height: 480 }),
      picture: async (id, w, h) => {
        asked.push(id);
        return encodeBitmap(w, h, true, () => false);
      },
    };
  });

  it("draws each picture once, each under its own turn", async () => {
    const images = COLLECTION.slice(0, 3).map(collectionId);
    const p = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: null });
    p.screens[0].widgets = [{ id: "g", type: "gallery", x: 0, y: 0, w: 20, h: 12, frame: "none", settings: { images, every: "15" } }];
    const out = await compile(p, deps);
    expect(out.problems).toEqual([]);
    expect([...new Set(asked)].sort()).toEqual([...images].sort());
    const groups = out.runtime.screens[0].elements.filter((e) => e.t === "group");
    expect(groups).toHaveLength(3);
    // The screen wakes as often as the pictures change.
    expect(out.runtime.screens[0].refresh ?? out.runtime.refresh).toBeLessThanOrEqual(15 * 60);
  });
});
