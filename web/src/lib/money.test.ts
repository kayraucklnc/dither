import { describe, expect, it } from "vitest";

import { changePercent, formatMoney, minorUnitsPerMajor, symbolFor, toMajorUnits } from "./money";

describe("minor units", () => {
  it("divides by a hundred for the currencies that have hundredths", () => {
    expect(minorUnitsPerMajor("eur")).toBe(100);
    expect(minorUnitsPerMajor("USD")).toBe(100);
    expect(toMajorUnits(318400, "eur")).toBe(3184);
  });

  it("does not divide a zero-decimal currency, which would be wrong by a hundred", () => {
    expect(minorUnitsPerMajor("jpy")).toBe(1);
    expect(toMajorUnits(318400, "JPY")).toBe(318400);
  });

  it("divides by a thousand for the three-decimal currencies", () => {
    expect(minorUnitsPerMajor("kwd")).toBe(1000);
    expect(toMajorUnits(318400, "kwd")).toBe(318.4);
  });
});

describe("symbols", () => {
  it("knows the common ones and falls back to the code rather than to nothing", () => {
    expect(symbolFor("eur")).toBe("€");
    expect(symbolFor("GBP")).toBe("£");
    expect(symbolFor("xyz")).toBe("XYZ");
  });
});

describe("formatting a figure for a panel", () => {
  it("shortens a large number, because 74120 at 76px runs off an 800px panel", () => {
    expect(formatMoney(74120, "eur", "en-GB", { compact: true }).figure).toBe("74.1k");
    expect(formatMoney(74120, "eur", "en-GB").figure).toBe("74,120");
  });

  it("keeps the symbol separate as well as joined, so a template can place it", () => {
    const money = formatMoney(3184, "eur", "en-GB");

    expect(money.symbol).toBe("€");
    expect(money.figure).toBe("3,184");
    expect(money.text).toBe("€3,184");
  });

  it("rounds to whole units unless asked otherwise", () => {
    expect(formatMoney(3184.62, "eur", "en-GB").amount).toBe(3185);
    expect(formatMoney(3184.62, "eur", "en-GB", { decimals: true }).figure).toBe("3,184.62");
  });
});

describe("change against the window before", () => {
  it("is a whole percentage either way", () => {
    expect(changePercent(115, 100)).toBe(15);
    expect(changePercent(85, 100)).toBe(-15);
  });

  it("is nothing at all when there is no baseline, rather than infinity", () => {
    expect(changePercent(100, 0)).toBeNull();
    expect(changePercent(100, Number.NaN)).toBeNull();
  });
});
