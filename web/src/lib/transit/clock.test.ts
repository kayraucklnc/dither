import { describe, expect, it } from "vitest";

import { between, clockOf, duration, minutesUntil, shift } from "./clock";

describe("wall clock arithmetic", () => {
  it("takes the leading HH:MM off anything clock shaped", () => {
    expect(clockOf("08:15:00")).toBe("08:15");
    expect(clockOf("08:15")).toBe("08:15");
    expect(clockOf("nonsense")).toBeUndefined();
    expect(clockOf(undefined)).toBeUndefined();
  });

  it("shifts a time by a delay, wrapping past midnight", () => {
    expect(shift("08:15", 7)).toBe("08:22");
    expect(shift("23:55", 10)).toBe("00:05");
    expect(shift("00:05", -10)).toBe("23:55");
  });

  it("measures the gap between two times", () => {
    expect(between("08:15", "08:22")).toBe(7);
    expect(between("23:55", "00:05")).toBe(10);
  });

  it("reads a large gap as running early rather than a day-long delay", () => {
    // A train published for 09:00 and estimated at 08:58 is two minutes early,
    // not twenty-three hours and fifty-eight minutes late.
    expect(between("09:00", "08:58")).toBe(0);
  });

  it("prints a journey length the way a board does", () => {
    expect(duration("00:24")).toBe("24m");
    expect(duration("01:05")).toBe("1h05");
    expect(duration(undefined)).toBeUndefined();
  });
});

describe("minutes until a departure", () => {
  const at = (clock: string) => new Date(`2026-08-27T${clock}:00`);

  it("counts forward within the day", () => {
    expect(minutesUntil("08:15", at("08:00"))).toBe(15);
  });

  it("counts across midnight when the train runs tomorrow", () => {
    expect(minutesUntil("00:10", at("23:50"), 1)).toBe(20);
  });

  it("reads a train that has only just gone as leaving now", () => {
    // Without this, 08:14 read at 08:15 is twenty-three hours away, and
    // "leaves in under ten minutes" would never fire in the minute it matters.
    expect(minutesUntil("08:14", at("08:15"))).toBe(0);
  });

  it("has no answer without a time", () => {
    expect(minutesUntil(undefined, at("08:00"))).toBeNull();
  });
});
