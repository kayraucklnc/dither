import { describe, expect, it } from "vitest";
import { automatic, fixed, formatValue, readTime, upper } from "./format";
import { parseZone } from "./tz";

const locale = {
  days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const berlin = parseZone("STD-1DST,M3.5.0,M10.5.0/3");
// 2026-10-04T13:05:09Z = 15:05:09 in Berlin (summer time).
const now = Date.UTC(2026, 9, 4, 13, 5, 9) / 1000;
const ctx = { now, zone: berlin, locale };

describe("numbers", () => {
  it("rounds half away from zero", () => {
    expect(fixed(2.5, 0)).toBe("3");
    expect(fixed(-2.5, 0)).toBe("-3");
    expect(fixed(1.005, 2)).toBe("1.00"); // 1.005 is 1.00499… in binary
    expect(fixed(-0.001, 2)).toBe("0.00");
  });
  it("groups thousands", () => {
    expect(fixed(1234567.891, 2, ",")).toBe("1,234,567.89");
    expect(fixed(-999, 0, ",")).toBe("-999");
    expect(fixed(-1000, 0, ".")).toBe("-1.000");
  });
  it("prints automatically with up to two decimals", () => {
    expect(automatic(20.5)).toBe("20.5");
    expect(automatic(3)).toBe("3");
    expect(automatic(100)).toBe("100");
    expect(automatic(0.004)).toBe("0");
    expect(automatic(-1.234)).toBe("-1.23");
  });
});

describe("times", () => {
  it("formats an epoch in the zone", () => {
    expect(formatValue(now, { time: "dddd D MMMM YYYY, HH:mm:ss" }, ctx)).toBe("Sunday 4 October 2026, 15:05:09");
    expect(formatValue(now, { time: "h:mm A [o'clock] ddd MMM" }, ctx)).toBe("3:05 PM o'clock Sun Oct");
  });
  it("reads local ISO times as written", () => {
    expect(formatValue("2026-10-05T07:30", { time: "ddd HH:mm" }, ctx)).toBe("Mon 07:30");
    expect(formatValue("2026-10-05", { time: "dddd" }, ctx)).toBe("Monday");
  });
  it("converts zoned ISO times", () => {
    expect(formatValue("2026-10-04T13:05:09.123Z", { time: "HH:mm" }, ctx)).toBe("15:05");
    expect(formatValue("2026-10-04T10:00:00-02:00", { time: "HH:mm" }, ctx)).toBe("14:00");
  });
  it("counts minutes until a time and drops the past", () => {
    expect(formatValue("2026-10-04T16:05:09", { until: true }, ctx)).toBe("60");
    expect(formatValue("2026-10-04T14:00", { until: true, fallback: "gone" }, ctx)).toBe("gone");
  });
  it("rejects what is not a time", () => {
    expect(readTime("yesterday", berlin, now)).toBeNull();
    expect(readTime("2026-13-01", berlin, now)).toBeNull();
    expect(readTime("2026-02-30", berlin, now)).toBeNull();
  });
});

describe("formats", () => {
  it("applies steps and maps", () => {
    expect(formatValue(55, { steps: { t: [20, 50, 80], o: ["low", "mid", "high", "full"] } }, ctx)).toBe("high");
    expect(formatValue(20, { steps: { t: [20, 50, 80], o: ["low", "mid", "high", "full"] } }, ctx)).toBe("mid");
    expect(formatValue(3, { map: { k: [1, 2, 3], o: ["a", "b", "c"] } }, ctx)).toBe("c");
    expect(formatValue("3", { map: { k: [3], o: ["c"], d: "?" } }, ctx)).toBe("?");
  });
  it("scales before formatting", () => {
    expect(formatValue(1500, { scale: 0.001, num: { d: 1 } }, ctx)).toBe("1.5");
  });
  it("falls back on null", () => {
    expect(formatValue(null, undefined, ctx)).toBe("–");
    expect(formatValue(null, { num: { d: 0 }, fallback: "?" }, ctx)).toBe("?");
    expect(formatValue("x", { num: { d: 0 } }, ctx)).toBe("–");
  });
  it("upper-cases Turkish properly when asked", () => {
    expect(upper("istanbul ığdır şişli", true)).toBe("İSTANBUL IĞDIR ŞİŞLİ");
    expect(upper("iç", false)).toBe("IÇ");
  });
});

describe("wall-clock times", () => {
  const at = (h: number, m: number) => Date.UTC(2026, 9, 4, h - 2, m) / 1000; // Berlin summer time
  it("land on the day within twelve hours of now", () => {
    expect(formatValue("16:00:00", { until: true }, { ...ctx, now: at(15, 30) })).toBe("30");
    expect(formatValue("00:10", { until: true }, { ...ctx, now: at(23, 50) })).toBe("20");
    expect(formatValue("23:50", { time: "ddd HH:mm" }, { ...ctx, now: Date.UTC(2026, 9, 4, 22, 10) / 1000 })).toBe("Sun 23:50");
    expect(formatValue("08:00", { until: true, fallback: "gone" }, { ...ctx, now: at(9, 0) })).toBe("gone");
  });
  it("rejects impossible clocks", () => {
    expect(formatValue("24:00", { time: "HH:mm" }, ctx)).toBe("\u2013");
  });
});

describe("shift", () => {
  const at = Date.UTC(2026, 9, 4, 13, 30) / 1000; // 15:30 in Berlin
  const values = new Map<string, import("./types").Value>([["t.delay", 7], ["t.none", null]]);
  const c = { ...ctx, now: at, values };
  it("moves a timetable time by a delay", () => {
    expect(formatValue("15:40:00", { shift: { v: "t.delay", scale: 60 }, until: true }, c)).toBe("17");
    expect(formatValue("15:40", { shift: { v: "t.delay", scale: 60 }, time: "HH:mm" }, c)).toBe("15:47");
  });
  it("treats a missing delay as none, and a non-time as nothing", () => {
    expect(formatValue("15:40", { shift: { v: "t.none", scale: 60 }, until: true }, c)).toBe("10");
    expect(formatValue(at, { shift: { v: "t.delay", scale: 60 }, time: "HH:mm" }, c)).toBe("15:37");
    expect(formatValue("soon", { shift: { v: "t.delay" }, until: true }, c)).toBe("\u2013");
  });
});

describe("days", () => {
  const late = { ...ctx, now: Date.UTC(2026, 9, 4, 21, 30) / 1000 }; // 23:30 Sunday in Berlin
  it("counts local calendar days", () => {
    expect(formatValue("2026-10-04T23:45:00+02:00", { days: true }, late)).toBe("0");
    expect(formatValue("2026-10-04T22:30:00Z", { days: true }, late)).toBe("1"); // 00:30 Monday in Berlin
    expect(formatValue("2026-10-06", { days: true }, late)).toBe("2");
    expect(formatValue("2026-10-03T12:00", { days: true }, late)).toBe("-1");
    expect(formatValue("00:15", { days: true }, late)).toBe("1");
  });
  it("wins over until", () => {
    expect(formatValue("2026-10-06", { days: true, until: true }, late)).toBe("2");
  });
});

describe("compact numbers", () => {
  it.each([[999, "999"], [1000, "1k"], [74120, "74.1k"], [-1550, "-1.6k"], [2000000, "2M"], [999950, "1000k"], [1234567890, "1.2B"]])("%d → %s", (v, out) => {
    expect(formatValue(v, { num: { d: 0, compact: true } }, ctx)).toBe(out);
  });
});
