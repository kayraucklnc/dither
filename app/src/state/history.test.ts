import { describe, expect, it } from "vitest";
import { createProject } from "@/project/starters";
import type { Project } from "@/project/schema";
import { historyReducer, initialHistory, type History } from "./history";

const start = createProject({ starter: "blank", timezone: "UTC", language: "en", units: "metric", place: null });
const rename = (name: string) => (p: Project): Project => ({ ...p, name });

function type(state: History, name: string, at: number, coalesce = "name"): History {
  return historyReducer(state, { type: "update", fn: rename(name), coalesce, at });
}

describe("historyReducer", () => {
  it("merges quick edits with the same key into one undo step", () => {
    let s = initialHistory(start);
    s = type(s, "a", 1000);
    s = type(s, "ab", 1500);
    s = type(s, "abc", 2000);
    expect(s.past).toHaveLength(1);
    expect(historyReducer(s, { type: "undo" }).present.name).toBe(start.name);
  });

  it("starts a new step after a pause or with another key", () => {
    let s = initialHistory(start);
    s = type(s, "a", 1000);
    s = type(s, "ab", 5000);
    s = type(s, "abc", 5100, "other");
    expect(s.past).toHaveLength(3);
  });

  it("does not merge across undo, redo or replace", () => {
    let s = type(initialHistory(start), "a", 1000);
    s = type(s, "b", 1100, "x");
    s = historyReducer(s, { type: "undo" });
    expect(s.coalesce).toBeNull();
    s = type(s, "c", 1200, "x");
    expect(s.past).toHaveLength(2);

    s = historyReducer(s, { type: "replace", project: { ...start, name: "new" } });
    s = type(s, "d", 1300, "x");
    expect(s.past.map((p) => p.name)).toEqual([start.name, "a", "c", "new"]);
  });

  it("ignores updates that change nothing", () => {
    const s = initialHistory(start);
    expect(historyReducer(s, { type: "update", fn: (p) => p, at: 0 })).toBe(s);
  });
});
