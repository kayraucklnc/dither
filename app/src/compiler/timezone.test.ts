import { describe, expect, it } from "vitest";
import { offsetAt, parseZone } from "@/runtime/tz";
import { offsetOf, posixTz } from "./timezone";

describe("IANA to POSIX", () => {
  it.each([
    ["Europe/Istanbul", "STD-3"],
    ["Europe/Berlin", "STD-1DST,M3.5.0,M10.5.0/3"],
    ["America/New_York", "STD5DST,M3.2.0,M11.1.0"],
    ["Australia/Sydney", "STD-10DST,M10.1.0,M4.1.0/3"],
    ["Asia/Kolkata", "STD-5:30"],
  ])("%s", (zone, posix) => {
    expect(posixTz(zone, 2026)).toBe(posix);
  });

  it.each(["Europe/London", "America/Los_Angeles", "America/Santiago", "Pacific/Auckland", "Asia/Tokyo"])(
    "agrees with Intl through 2026 in %s", (zone) => {
      const tz = parseZone(posixTz(zone, 2026));
      for (let t = Date.UTC(2026, 0, 1) / 1000; t < Date.UTC(2027, 0, 1) / 1000; t += 3 * 3600) {
        expect(offsetAt(tz, t)).toBe(offsetOf(zone, t));
      }
    },
  );
});
