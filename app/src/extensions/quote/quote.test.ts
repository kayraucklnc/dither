import { describe, expect, it } from "vitest";
import { evaluate as evaluateWith } from "@/runtime/conditions";
import type { FormatContext } from "@/runtime/format";
import type { Condition, Values } from "@/runtime/types";
import { daysOf, parseQuote, quotesFor } from "./index";
import { LITERATURE, PHILOSOPHY } from "./quotes";

// The rotation reads only clock.month and clock.day, through no format.
const ctx = {} as FormatContext;
const evaluate = (c: Condition, v: Values) => evaluateWith(c, v, ctx);
const at = (month: number | null, day: number | null) => new Map<string, number | null>([["clock.month", month], ["clock.day", day]]) as Values;

describe("quote rotation", () => {
  it("shows exactly one quote on every day of the year", () => {
    for (const count of [2, 7, 31, 60, 64]) {
      const conditions = Array.from({ length: count }, (_, i) => daysOf(i, count));
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 31; day++) {
          const showing = conditions.filter((c) => evaluate(c, at(month, day)));
          expect(showing).toHaveLength(1);
        }
      }
    }
  });

  it("moves on by one quote a day", () => {
    const count = 60;
    const which = (month: number, day: number) => Array.from({ length: count }, (_, i) => i).find((i) => evaluate(daysOf(i, count), at(month, day)));
    expect(which(1, 1)).toBe(0);
    expect(which(1, 2)).toBe(1);
    expect(which(2, 1)).toBe(31);
    expect(which(3, 1)).toBe(2);
  });

  it("shows the first quote while the clock is unknown", () => {
    expect(evaluate(daysOf(0, 10), at(null, null))).toBe(true);
    expect(evaluate(daysOf(1, 10), at(null, null))).toBe(false);
  });
});

describe("quote collections", () => {
  it("keeps every quote once, alternating books and philosophers", () => {
    const all = quotesFor("all", []);
    expect(new Set(all).size).toBe(PHILOSOPHY.length + LITERATURE.length);
    expect(PHILOSOPHY).toContain(all[0]);
    expect(LITERATURE).toContain(all[1]);
  });

  it("only uses characters the fonts have at every size it draws", () => {
    const ok = /^[\x20-\x7e -ſ‘’“”—–…]*$/;
    for (const q of [...PHILOSOPHY, ...LITERATURE]) expect(`${q.text}${q.who}${q.from ?? ""}`).toMatch(ok);
  });
});

describe("parseQuote", () => {
  it("splits a line into the quote, who and the work", () => {
    expect(parseQuote("Stay hungry, stay foolish. — Stewart Brand, Whole Earth Catalog")).toEqual({ text: "Stay hungry, stay foolish.", who: "Stewart Brand", from: "Whole Earth Catalog" });
    expect(parseQuote("“Less is more” - Mies")).toEqual({ text: "Less is more", who: "Mies" });
    expect(parseQuote("No author here")).toEqual({ text: "No author here", who: "" });
    expect(parseQuote("   ")).toBeNull();
  });
});
