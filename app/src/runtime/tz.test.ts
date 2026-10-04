import { describe, expect, it } from "vitest";
import { fromLocal, offsetAt, parseZone, toLocal } from "./tz";

describe("POSIX zones", () => {
  const berlin = parseZone("STD-1DST,M3.5.0,M10.5.0/3");
  it("switches on the last Sundays of March and October", () => {
    expect(offsetAt(berlin, Date.UTC(2026, 2, 29, 0, 59) / 1000)).toBe(3600);
    expect(offsetAt(berlin, Date.UTC(2026, 2, 29, 1, 0) / 1000)).toBe(7200);
    expect(offsetAt(berlin, Date.UTC(2026, 9, 25, 0, 59) / 1000)).toBe(7200);
    expect(offsetAt(berlin, Date.UTC(2026, 9, 25, 1, 0) / 1000)).toBe(3600);
  });
  it("handles the southern hemisphere", () => {
    const sydney = parseZone("STD-10DST,M10.1.0,M4.1.0/3");
    expect(offsetAt(sydney, Date.UTC(2026, 0, 15) / 1000)).toBe(11 * 3600);
    expect(offsetAt(sydney, Date.UTC(2026, 6, 15) / 1000)).toBe(10 * 3600);
  });
  it("handles a fixed zone with minutes", () => {
    const india = parseZone("STD-5:30");
    expect(toLocal(india, 0)).toMatchObject({ hour: 5, minute: 30 });
  });
  it("round-trips wall-clock time", () => {
    const l = { year: 2026, month: 7, day: 1, hour: 12, minute: 0, second: 0 };
    expect(toLocal(berlin, fromLocal(berlin, l))).toMatchObject(l);
  });
});
