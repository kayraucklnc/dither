import { describe, expect, it } from "vitest";

import { fromClock, inQuietHours, secondsUntilAwake, toClock } from "./quiet-hours";

const night = { startMinute: 23 * 60, stopMinute: 7 * 60 };
const day = { startMinute: 9 * 60, stopMinute: 17 * 60 };

describe("quiet hours", () => {
  it("covers a window that wraps past midnight", () => {
    expect(inQuietHours(night, 23 * 60 + 30)).toBe(true);
    expect(inQuietHours(night, 3 * 60)).toBe(true);
    expect(inQuietHours(night, 6 * 60 + 59)).toBe(true);
    expect(inQuietHours(night, 7 * 60)).toBe(false);
    expect(inQuietHours(night, 12 * 60)).toBe(false);
  });

  it("covers a window inside one day", () => {
    expect(inQuietHours(day, 12 * 60)).toBe(true);
    expect(inQuietHours(day, 8 * 60)).toBe(false);
    expect(inQuietHours(day, 17 * 60)).toBe(false);
  });

  it("is off when it is not set, or set to nothing", () => {
    expect(inQuietHours({ startMinute: null, stopMinute: null }, 120)).toBe(false);
    expect(inQuietHours({ startMinute: 60, stopMinute: null }, 120)).toBe(false);
    expect(inQuietHours({ startMinute: 60, stopMinute: 60 }, 120)).toBe(false);
  });

  it("sleeps until the window ends, in one wake rather than forty", () => {
    // 01:00, quiet until 07:00 - six hours.
    expect(secondsUntilAwake(night, 60)).toBe(6 * 3600);
    // 23:30, quiet until 07:00 - seven and a half.
    expect(secondsUntilAwake(night, 23 * 60 + 30)).toBe(7.5 * 3600);
  });

  it("never tells a device to sleep for no time", () => {
    expect(secondsUntilAwake(night, 7 * 60)).toBe(60);
  });

  it("round trips a clock time", () => {
    expect(toClock(fromClock("23:00")!)).toBe("23:00");
    expect(toClock(fromClock("07:05")!)).toBe("07:05");
    expect(fromClock("nonsense")).toBeNull();
    expect(fromClock("25:00")).toBeNull();
  });
});
