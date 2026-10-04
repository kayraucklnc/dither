import { describe, expect, it } from "vitest";
import { nodeLibrary } from "@/assets/node";
import { fontInfo } from "@/assets/library";
import { decodeFont } from "@/runtime/assets";
import { localeFor } from "./locale";
import { fontCharsets, subsetFont } from "./subset";

const locale = localeFor("en");

describe("font subsets", () => {
  it("keeps only what a formatted number or a literal can show", () => {
    const sets = fontCharsets([
      { t: "text", x: 0, y: 0, w: 10, h: 10, font: 0, parts: [{ v: "a.t", f: { num: { d: 0 } } }, "°"] },
      { t: "text", x: 0, y: 0, w: 10, h: 10, font: 1, parts: [{ v: "a.s" }] },
    ], locale);
    const zero = sets.get(0);
    expect(zero).not.toBe("all");
    expect([...(zero as Set<number>)].map((c) => String.fromCodePoint(c)).sort().join("")).toBe("-.0123456789°–");
    expect(sets.get(1)).toBe("all");
  });

  it("covers day and month names for times", () => {
    const set = fontCharsets([{ t: "text", x: 0, y: 0, w: 1, h: 1, font: 0, parts: [{ v: "clock.epoch", f: { time: "dddd" } }] }], locale).get(0) as Set<number>;
    expect(set.has("W".codePointAt(0)!)).toBe(true);
  });

  it("re-encodes a smaller font that draws the same", async () => {
    const bytes = await nodeLibrary.font(fontInfo(128, 700));
    const small = subsetFont(bytes, new Set([..."0123456789:"].map((c) => c.codePointAt(0)!)));
    const a = decodeFont(bytes);
    const b = decodeFont(small);
    expect(small.length).toBeLessThan(bytes.length / 4);
    for (const c of "0:9 ?…") {
      const ga = a.glyphs.get(c.codePointAt(0)!)!;
      const gb = b.glyphs.get(c.codePointAt(0)!)!;
      expect({ ...gb, offset: 0 }).toEqual({ ...ga, offset: 0 });
      const n = Math.ceil(ga.width / 8) * ga.height;
      expect(small.subarray(gb.offset, gb.offset + n)).toEqual(bytes.subarray(ga.offset, ga.offset + n));
    }
    expect(b.glyphs.has("A".codePointAt(0)!)).toBe(false);
  });
});
