import { describe, expect, it } from "vitest";
import { clip, extract } from "./values";

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
