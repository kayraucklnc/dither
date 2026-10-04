import { describe, expect, it } from "vitest";
import { applyMerges } from "./merge";
import { parseZone } from "./tz";
import type { Value } from "./types";

const ctx = { now: Date.UTC(2026, 9, 4, 13, 0) / 1000, zone: parseZone("STD-3"), locale: { days: [], daysShort: [], months: [], monthsShort: [] } };
const merge = { id: "m0", from: ["a", "b"], fields: ["t", "s"], count: 4, skip: ["s"], sort: ["s"], unique: ["t", "s"] };

describe("merges", () => {
  it("interleaves by time, drops duplicates and keeps where each came from", () => {
    const v = new Map<string, Value>([
      ["a.t0", "Standup"], ["a.s0", "2026-10-04T17:00:00+03:00"],
      ["a.t1", "Review"], ["a.s1", "2026-10-04T19:00:00+03:00"],
      ["b.t0", "Gym"], ["b.s0", "2026-10-04T18:00:00+03:00"],
      ["b.t1", "Review"], ["b.s1", "2026-10-04T16:00:00Z"], // the same moment as a.s1, written differently: not equal
      ["b.t2", "Standup"], ["b.s2", "2026-10-04T17:00:00+03:00"], // a true duplicate of a.t0
      ["b.t3", "All day"], ["b.s3", null],
    ]);
    applyMerges([merge], v, ctx);
    expect([0, 1, 2, 3].map((n) => [v.get(`m0.t${n}`), v.get(`m0.from${n}`)])).toEqual([
      ["Standup", 0], ["Gym", 1], ["Review", 0], ["Review", 1],
    ]);
  });
  it("fills the rest with nothing", () => {
    const v = new Map<string, Value>([["a.t0", "Only"], ["a.s0", "2026-10-04T17:00"]]);
    applyMerges([{ ...merge, from: ["a", "missing"] }], v, ctx);
    expect(v.get("m0.t0")).toBe("Only");
    expect(v.get("m0.t1")).toBeNull();
    expect(v.get("m0.from1")).toBeNull();
  });
});
