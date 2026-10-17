import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { compile, type CompileDeps } from "@/compiler";
import { localeFor } from "@/compiler/locale";
import { posixTz } from "@/compiler/timezone";
import { createProject } from "@/project/starters";
import { evaluate } from "@/runtime/conditions";
import { formatValue, type FormatContext } from "@/runtime/format";
import { parseZone } from "@/runtime/tz";
import type { Values } from "@/runtime/types";
import type { Env } from "../api";
import moon, { bucketOf, daily, litOf, moonDays, nameOf, nextDate, stretches } from "./index";
import { phaseAt, phaseInstant, phasesBetween } from "./ephemeris";

const ZONE = "Europe/Rome";
const BUILT = Date.UTC(2026, 9, 16, 12) / 1000;
const env = { units: "metric", place: { name: "Milan", latitude: 45.46, longitude: 9.19 }, language: "en", timezone: ZONE, accounts: {}, now: BUILT } as unknown as Env;
const days = moonDays(BUILT, ZONE);
const zone = parseZone(posixTz(ZONE));
const locale = localeFor("en");
const ctx = (now: number): FormatContext => ({ now, zone, locale });
const clock = (now: number | null) => new Map([["clock.epoch", now]]) as Values;
/** 19:00 UTC, 21:00 in Rome in October. */
const evening = (month: number, day: number) => Date.UTC(2026, month - 1, day, 19) / 1000;

describe("moon ephemeris", () => {
  it("matches Meeus's worked example to the second", () => {
    // Example 49.a: the new moon of February 1977, JDE 2443192.65118; ΔT is put back.
    const jde = phaseInstant(-283, 0) / 86400 + 2440587.5 + (69 + 0.5 * (1977.1 - 2025)) / 86400;
    expect(Math.abs(jde - 2443192.65118) * 86400).toBeLessThan(2);
  });

  it("finds this autumn's phases within two minutes of the published times", () => {
    const phases = phasesBetween(Date.UTC(2026, 9, 20) / 1000, Date.UTC(2026, 10, 10) / 1000);
    const full = phases.find((p) => p.quarter === 2)!;
    const next = phases.find((p) => p.quarter === 0)!;
    expect(Math.abs(full.at - Date.UTC(2026, 9, 26, 4, 12) / 1000)).toBeLessThan(120);
    expect(Math.abs(next.at - Date.UTC(2026, 10, 9, 7, 2) / 1000)).toBeLessThan(120);
  });

  it("lights the whole disc at full moon and none of it at new", () => {
    expect(phaseAt(Date.UTC(2026, 9, 26, 4, 12) / 1000).lit).toBeGreaterThan(0.99);
    expect(phaseAt(Date.UTC(2026, 10, 9, 7, 2) / 1000).lit).toBeLessThan(0.01);
    const quarter = phaseAt(Date.UTC(2026, 9, 18, 16, 13) / 1000);
    expect(quarter.angle).toBeCloseTo(90, 0);
  });
});

describe("moon days", () => {
  it("covers three years of local days, one after another, from yesterday", () => {
    expect(days[1].start).toBe(Date.UTC(2026, 9, 15, 22) / 1000); // midnight in Rome, summer time
    for (let i = 1; i < days.length; i++) expect(days[i].start).toBe(days[i - 1].end);
    expect(days.at(-1)!.end - days[0].start).toBeGreaterThan(3 * 365 * 86400);
    // Clocks go back on 25 October: that day is 25 hours long.
    const back = days.find((d) => d.start === Date.UTC(2026, 9, 24, 22) / 1000)!;
    expect(back.end - back.start).toBe(25 * 3600);
  });

  it("puts every phase on its own day, with its exact picture", () => {
    const events = days.filter((d) => d.event);
    expect(events.length).toBeGreaterThan(3 * 49);
    for (const d of events) expect(bucketOf(d)).toBe(d.event!.quarter * 6);
  });

  it("names the days between the phases, and agrees with how much is lit", () => {
    const at = (month: number, day: number) => days.find((d) => d.start <= evening(month, day) && evening(month, day) < d.end)!;
    expect(nameOf(at(10, 16))).toBe("Waxing crescent");
    expect(nameOf(at(10, 18))).toBe("First quarter");
    expect(nameOf(at(10, 22))).toBe("Waxing gibbous");
    expect(nameOf(at(10, 26))).toBe("Full moon");
    expect(litOf(at(10, 26))).toBe("100");
    expect(litOf(at(10, 25))).toBe("99"); // not yet full, whatever the rounding says
    expect(nameOf(at(10, 30))).toBe("Waning gibbous");
    expect(nameOf(at(11, 9))).toBe("New moon");
    expect(litOf(at(11, 9))).toBe("0");
  });
});

describe("moon tables on the panel", () => {
  const name = daily(days, days[1], nameOf, "");

  it("change only at local midnights, in order", () => {
    const { t } = name.steps!;
    const midnights = new Set(days.map((d) => d.end));
    for (let i = 0; i < t.length; i++) {
      expect(midnights.has(t[i])).toBe(true);
      if (i) expect(t[i]).toBeGreaterThan(t[i - 1]);
    }
  });

  it("read today's name off the clock, and fall back to the day it was built", () => {
    expect(formatValue(evening(10, 26), name, ctx(evening(10, 26)))).toBe("Full moon");
    expect(formatValue(evening(10, 27), name, ctx(evening(10, 27)))).toBe("Waning gibbous");
    expect(formatValue(null, name, ctx(0))).toBe("Waxing crescent");
    // Past the last day: nothing.
    const after = days.at(-1)!.end + 3600;
    expect(formatValue(after, name, ctx(after))).toBe("");
  });

  it("write the next full moon's date in the panel's language", () => {
    const f = nextDate(days, 2, ZONE);
    expect(formatValue(evening(10, 16), f, ctx(evening(10, 16)))).toBe("Mon 26 Oct");
    expect(formatValue(evening(10, 26), f, ctx(evening(10, 26)))).toBe("Mon 26 Oct");
    expect(formatValue(evening(10, 27), f, ctx(evening(10, 27)))).toBe("Tue 24 Nov");
  });

  it("show exactly one countdown at a time, and today's while the clock is unknown", () => {
    const full = stretches(days, 2, BUILT, ZONE);
    const counts = new Set(days.slice(0, -40).map((d) => {
      const now = d.start + 12 * 3600;
      return full.filter((s) => evaluate(s.when, clock(now), ctx(now))).length;
    }));
    expect([...counts]).toEqual([1]);
    const unknown = full.filter((s) => evaluate(s.when, clock(null), ctx(0)));
    expect(unknown.map((s) => s.date)).toEqual(["2026-10-26"]);
  });

  it("tell rules when it is full moon today", () => {
    const flag = moon.facts!(moon.defaults(env), env).find((f) => f.key === "full")!;
    if (flag.type !== "flag") throw new Error("not a flag");
    expect(evaluate(flag.test, clock(evening(10, 26)), ctx(evening(10, 26)))).toBe(true);
    expect(evaluate(flag.test, clock(evening(10, 25)), ctx(evening(10, 25)))).toBe(false);
  });
});

describe("moon widget", () => {
  let deps: CompileDeps;
  beforeAll(async () => {
    deps = { library: nodeLibrary, fonts: await loadFonts(), picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }), now: BUILT };
  });

  it("fits every size from the smallest up, and keeps the blob small", async () => {
    for (const [w, h] of [[3, 3], [5, 7], [10, 5], [10, 7], [20, 12]]) {
      const project = createProject({ starter: "blank", timezone: ZONE, language: "en", units: "metric", place: env.place });
      project.screens[0].widgets = [{ id: "m", type: "moon", x: 0, y: 0, w, h, frame: "none", settings: {} }];
      const c = await compile(project, deps);
      expect(c.problems).toEqual([]);
      expect(c.blob.length).toBeLessThan(260_000);
    }
  });
});
