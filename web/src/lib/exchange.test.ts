import { describe, expect, it } from "vitest";

import { convertMinor, rateBetween, type Rates } from "./exchange";

const table: Rates = {
  base: "USD",
  rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 147, KWD: 0.31 },
  fetchedAt: new Date("2026-08-27T06:00:00Z"),
};

describe("finding a rate", () => {
  it("reads one straight off the table when the base is the one asked for", () => {
    expect(rateBetween(table, "USD", "EUR")).toBe(0.92);
  });

  it("crosses two rates when neither end is the base", () => {
    // A euro is worth 0.79/0.92 pounds, whatever the table happens to be
    // quoted in. Rounded because a cross rate is a division and this is a
    // comparison, not a payment.
    expect(rateBetween(table, "EUR", "GBP")).toBeCloseTo(0.79 / 0.92, 10);
  });

  it("is exactly one between a currency and itself, whatever the table says", () => {
    // Never 0.9999999: a figure converted to its own currency has to come back
    // as the same figure, or an account shows a different number for choosing
    // the currency it was already in.
    expect(rateBetween(table, "EUR", "EUR")).toBe(1);
    expect(rateBetween({ ...table, rates: {} }, "EUR", "EUR")).toBe(1);
  });

  it("does not care how the currency was spelled", () => {
    expect(rateBetween(table, "usd", "eur")).toBe(0.92);
  });

  it("answers with nothing for a currency it has never heard of", () => {
    // Nothing, rather than 1. A missing rate that silently means "no
    // conversion" adds dollars to yen and calls the total money.
    expect(rateBetween(table, "USD", "XYZ")).toBeUndefined();
    expect(rateBetween(table, "XYZ", "USD")).toBeUndefined();
  });
});

describe("converting an amount", () => {
  it("carries the amount across, in each currency's own smallest unit", () => {
    // $10.00 is 1000 cents; at 0.92 that is 920 cents of euro.
    expect(convertMinor(1000, "usd", "eur", 0.92)).toBe(920);
  });

  it("knows a currency with no subdivision at either end", () => {
    // 1000 yen is 1000 yen, not 100000. At 1/147 of a dollar it is $6.80.
    expect(convertMinor(1000, "jpy", "usd", 1 / 147)).toBe(680);
    expect(convertMinor(1000, "usd", "jpy", 147)).toBe(1470);
  });

  it("knows a currency counted in thousandths", () => {
    // $10.00 at 0.31 dinar is 3.100 KWD, which Stripe counts as 3100.
    expect(convertMinor(1000, "usd", "kwd", 0.31)).toBe(3100);
  });

  it("leaves an amount alone when both ends are the same currency", () => {
    expect(convertMinor(1234, "eur", "eur", 1)).toBe(1234);
  });

  it("gives a whole number of the smallest unit, because that is what money is", () => {
    expect(Number.isInteger(convertMinor(999, "usd", "eur", 0.92))).toBe(true);
    expect(Number.isInteger(convertMinor(1, "jpy", "kwd", 0.0021))).toBe(true);
  });

  it("keeps a negative amount negative, so a refund still subtracts", () => {
    expect(convertMinor(-1000, "usd", "eur", 0.92)).toBe(-920);
  });
});
