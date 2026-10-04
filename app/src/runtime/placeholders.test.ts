import { describe, expect, it } from "vitest";
import { expand, hasPlaceholders } from "./placeholders";
import { parseZone } from "./tz";

const locale = { days: ["Sunday"], daysShort: ["Sun"], months: [], monthsShort: [] };
const ctx = { now: Date.UTC(2026, 9, 4, 13, 7, 30) / 1000, zone: parseZone("STD-1DST,M3.5.0,M10.5.0/3"), locale };

describe("placeholders", () => {
  it("expands now, offsets and patterns", () => {
    expect(expand("t={{now}}", ctx, true)).toBe(`t=${ctx.now}`);
    expect(expand("d={{now|YYYYMMDD}}&h={{now+3600|HH:mm}}", ctx, true)).toBe("d=20261004&h=16%3A07");
    expect(expand("from={{now-86400|YYYY-MM-DD[T]HH:mm:ssZ}}", ctx, true)).toBe("from=2026-10-03T15%3A07%3A30%2B02%3A00");
    expect(expand("{{now|HH:mm}}", ctx, false)).toBe("15:07");
  });
  it("crosses a clock change by the zone's own rule", () => {
    const sunday = { ...ctx, now: Date.UTC(2026, 9, 25, 0, 30) / 1000 };
    expect(expand("{{now|HH:mmZ}} {{now+3600|HH:mmZ}}", sunday, false)).toBe("02:30+02:00 02:30+01:00");
  });
  it("leaves other braces alone", () => {
    expect(expand("a={{later}}&b={x}&c={{now+60}}", ctx, true)).toBe("a={{later}}&b={x}&c={{now+60}}");
    expect(hasPlaceholders("x{{now|D}}")).toBe(true);
    expect(hasPlaceholders("x{{nowhere}}")).toBe(false);
  });

  it("gives local midnight for today, across a clock change", () => {
    expect(expand("{{today}}", ctx, true)).toBe(String(Date.UTC(2026, 9, 3, 22, 0) / 1000));
    expect(expand("gte={{today-518400}}", ctx, true)).toBe(`gte=${Date.UTC(2026, 9, 3, 22, 0) / 1000 - 518400}`);
    const sunday = { ...ctx, now: Date.UTC(2026, 9, 25, 12, 0) / 1000 }; // midnight was still summer time
    expect(expand("{{today}}", sunday, false)).toBe(String(Date.UTC(2026, 9, 24, 22, 0) / 1000));
  });
});
