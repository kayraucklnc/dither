import { describe, expect, it } from "vitest";
import { AssetStore, renderScreen } from "./render";
import type { Element, Runtime, Value } from "./types";

const locale = { days: [], daysShort: [], months: [], monthsShort: [] };

function rows(el: Element, w: number, h: number, values: Record<string, Value>): string[] {
  const runtime = { v: 1, width: w, height: h, tz: "UTC0", locale, screens: [{ name: "", elements: [el] }], assets: [] } as unknown as Runtime;
  const fb = renderScreen(runtime, new AssetStore(new Uint8Array(), []), 0, new Map(Object.entries(values)), 0);
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (fb.get(x, y) ? "#" : ".")).join(""));
}

const values = { "p.x": 5, "p.y": 2.5, "p.far": 11, "p.edge": 10 };
const at = (x: string, extra: Partial<{ box: number[]; xs: number[] }> = {}) =>
  ({ x, y: "p.y", box: [0, 0, 8, 8], xs: [0, 10], ys: [10, 0], ...extra }) as never;
const dot: Element = { t: "rect", x: 0, y: 0, w: 1, h: 1 };

describe("placed groups", () => {
  it("move their elements to where the values fall in the box", () => {
    expect(rows({ t: "group", at: at("p.x"), els: [{ t: "rect", x: -1, y: -1, w: 2, h: 2 }] }, 8, 8, values))
      .toEqual(["........", "........", "........", "........", "........", "...##...", "...##...", "........"]);
  });
  it("draw nothing out of range, without a value, or over a range of nothing", () => {
    const blank = Array(8).fill("........");
    expect(rows({ t: "group", at: at("p.far"), els: [dot] }, 8, 8, values)).toEqual(blank);
    expect(rows({ t: "group", at: at("p.none"), els: [dot] }, 8, 8, values)).toEqual(blank);
    expect(rows({ t: "group", at: at("p.x", { xs: [3, 3] }), els: [dot] }, 8, 8, values)).toEqual(blank);
  });
  it("clip at the panel's edge", () => {
    expect(rows({ t: "group", at: at("p.edge", { box: [0, 0, 7, 0] }), els: [{ t: "rect", x: 0, y: 0, w: 3, h: 1 }] }, 8, 2, values))
      .toEqual([".......#", "........"]);
  });
  it("add their moves when nested", () => {
    const inner: Element = { t: "group", at: at("p.x", { box: [1, 0, 4, 0] }), els: [dot] };
    expect(rows({ t: "group", at: at("p.x", { box: [0, 0, 4, 0] }), els: [inner] }, 8, 1, values)).toEqual([".....#.."]);
  });
});

describe("globe-placed groups", () => {
  const where: Record<string, Value> = {
    "g.lat0": 0, "g.lon0": 0, "g.lat1": 0, "g.lon1": 90, "g.lat2": 90, "g.lon2": 0,
    "g.lat3": 30, "g.lon3": 30, "g.lat4": 0, "g.lon4": 180, "g.lat5": 0, "g.lon5": -170,
  };
  // Where the one dot lands on an 11 × 11 panel, or null when nothing is drawn.
  const spot = (n: number, side?: string, globe = [0, 0]) => {
    const el = { t: "group", at: { lat: `g.lat${n}`, lon: `g.lon${n}`, globe, c: [5, 5], r: 4, ...(side ? { side } : {}) }, els: [dot] } as Element;
    const r = rows(el, 11, 11, where);
    const y = r.findIndex((row) => row.includes("#"));
    return y < 0 ? null : [r[y].indexOf("#"), y];
  };
  it("puts the centre in the middle, the limb at the rim, the pole at the top", () => {
    expect(spot(0)).toEqual([5, 5]);
    expect(spot(1)).toEqual([9, 5]);
    expect(spot(2)).toEqual([5, 1]);
    expect(spot(3)).toEqual([7, 3]);
  });
  it("draws the far side only when asked", () => {
    expect(spot(4, "front")).toBeNull();
    expect(spot(4, "back")).toEqual([5, 5]);
    expect(spot(0, "back")).toBeNull();
    expect(spot(4)).toEqual([5, 5]);
  });
  it("turns across the date line", () => {
    expect(spot(5, "front", [0, 170])).toEqual([6, 5]);
  });
});
