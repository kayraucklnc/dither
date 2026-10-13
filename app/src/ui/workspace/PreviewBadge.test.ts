import { describe, expect, it } from "vitest";
import type { Compiled } from "@/compiler";
import type { SourceStatus } from "@/state/simulation";
import { previewData, screenSources } from "./PreviewBadge";

const compiled = {
  sources: ["s0", "s1", "s2", "s3", "s10"].map((id) => ({ source: { id } })),
  runtime: {
    merges: [{ id: "m0", from: ["s3", "s10"] }],
    screens: [
      { name: "Home", elements: [{ t: "text", s: "{s0.next|time}" }, { t: "text", when: { v: "s1._ok", op: "eq", x: true } }, { t: "text", s: "{s2.total}" }] },
      { name: "Clock", elements: [{ t: "text", s: "{clock.time}" }, { t: "text", s: "{vs0.x}" }] },
      { name: "Merged", elements: [{ t: "list", v: "m0.items" }] },
    ],
  },
} as unknown as Compiled;

describe("screenSources", () => {
  it("finds the sources a screen's elements refer to, through merges too", () => {
    expect(screenSources(compiled, 0)).toEqual(["s0", "s1", "s2"]);
    expect(screenSources(compiled, 1)).toEqual([]);
    expect(screenSources(compiled, 2)).toEqual(["s3", "s10"]);
    expect(screenSources(null, 0)).toEqual([]);
  });
});

describe("previewData", () => {
  it("groups the screen's sources by where the preview got them", () => {
    const status = new Map<string, SourceStatus>([
      ["s0", { state: "sample", reason: "This browser is not allowed to ask that server; the panel can." }],
      ["s1", { state: "live", at: 1 }],
      ["s3", { state: "sample", reason: "nope" }],
    ]);
    expect(previewData(compiled, 0, status)).toEqual({
      live: ["s1"],
      loading: ["s2"],
      sample: [{ id: "s0", reason: "This browser is not allowed to ask that server; the panel can." }],
    });
  });

  it("is empty for a screen without data", () => {
    expect(previewData(compiled, 1, new Map())).toEqual({ live: [], loading: [], sample: [] });
  });
});
