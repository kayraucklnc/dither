import { describe, expect, it } from "vitest";
import { clip, extract } from "./values";
import { parseZone } from "./tz";

const body = { data: [{ amount: 1200, source: { fee: 30 } }, { amount: "x" }, { amount: 800, source: { fee: 20 } }], none: [], obj: {} };

describe("extract", () => {
  it("totals a list", () => {
    const v = extract({ id: "s", url: "", every: 60, values: [
      { key: "sum", path: "data", agg: "sum", field: "amount" },
      { key: "fees", path: "data", agg: "sum", field: "source.fee" },
      { key: "n", path: "data", agg: "count" },
      { key: "empty", path: "none", agg: "sum", field: "amount" },
      { key: "bad", path: "obj", agg: "count" },
      { key: "first", path: "data.0.amount" },
    ] }, body);
    expect(Object.fromEntries(v)).toEqual({ "s.sum": 2000, "s.fees": 50, "s.n": 3, "s.empty": 0, "s.bad": null, "s.first": 1200 });
  });
  it("keeps at most 256 bytes of a string, on a character boundary", () => {
    expect(clip("a".repeat(300))).toHaveLength(256);
    expect(new TextEncoder().encode(clip("ş".repeat(200))).length).toBe(256);
    expect(new TextEncoder().encode(clip("a" + "ş".repeat(200))).length).toBe(255);
  });
});

describe("buckets", () => {
  const zone = parseZone("STD-3");
  const now = Date.UTC(2026, 9, 4, 12, 0) / 1000; // 15:00 in Istanbul
  const ctx = { now, zone, locale: { days: [], daysShort: [], months: [], monthsShort: [] } };
  const body = { data: [
    { amount: 100, created: now - 3600 }, // today 14:00
    { amount: 50, created: now - 3600 },
    { amount: 70, created: now - 86400 }, // yesterday
    { amount: 30, created: now - 86400 * 9 }, // too old
    { amount: "x", created: now },
  ] };
  it("totals by local day, newest last", () => {
    const v = extract({ id: "s", url: "", every: 60, values: [{ key: "d", path: "data", agg: "buckets", field: "amount", time: "created", by: "day", count: 7 }] }, body, ctx);
    expect(v.get("s.d")).toEqual([0, 0, 0, 0, 0, 70, 150]);
  });
  it("totals today by hour", () => {
    const v = extract({ id: "s", url: "", every: 60, values: [{ key: "h", path: "data", agg: "buckets", field: "amount", time: "created", by: "hour", count: 24 }] }, body, ctx);
    expect((v.get("s.h") as number[])[14]).toBe(150);
  });
});
