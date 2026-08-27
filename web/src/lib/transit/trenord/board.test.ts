import { describe, expect, it } from "vitest";

import { departureFrom, headlineOf, type TrenordSettings } from "./board";

/**
 * One solution, shaped the way Trenord's planner shapes them.
 *
 * Trimmed to the fields that matter, but the nesting is theirs: a solution
 * holds journey legs, each leg holds a train and its whole run, and the stop
 * you board at is found in that run by station code rather than by position.
 */
function solution(over: {
  depTime?: string;
  depIso?: string;
  delay?: number;
  actual?: string;
  estimated?: string;
  platform?: string;
  live?: boolean;
  cancelled?: boolean;
  status?: string;
  change?: number;
} = {}) {
  const stop = {
    station: { station_id: "S01712" },
    dep_date_time: over.depIso ?? "2026-08-27T08:15:00+02:00",
    platform: over.platform ?? "",
    is_actual_platform: Boolean(over.platform),
    actual_data: {
      dep_actual_time: over.actual,
      dep_estimated_time: over.estimated,
    },
  };

  return {
    date: "2026-08-27",
    dep_time: over.depTime ?? "08:15:00",
    arr_time: "08:47:00",
    duration: "00:32",
    change: over.change ?? 0,
    delay: over.delay,
    cancelled: over.cancelled,
    dep_station: { station_id: "S01712", station_ori_name: "MILANO CADORNA" },
    arr_station: { station_ori_name: "SARONNO" },
    journey_list: [
      {
        train: {
          line: "S3",
          train_name: "24015",
          direction: "SARONNO",
          has_live_info: over.live ?? false,
          status: over.status,
        },
        // The stop boarded at is second, so anything relying on position fails.
        pass_list: [{ station: { station_id: "S00001" } }, stop],
      },
    ],
  };
}

const settings: TrenordSettings = {
  origin: "Milano Cadorna",
  destination: "Saronno",
  limit: 5,
  leadTime: 0,
  transfers: 1,
  language: "en",
  hideCancelled: false,
  timezone: "Europe/Rome",
};

/** 07:00 UTC is 09:00 in Rome, which is after the 08:15 train. */
const before = new Date("2026-08-27T05:00:00Z");
const after = new Date("2026-08-27T07:00:00Z");

describe("building one departure", () => {
  it("finds the stop by station code, not by position in the run", () => {
    const one = departureFrom(solution({ platform: "2" }), settings, before)!;
    expect(one.platform).toBe("2");
    expect(one.platform_actual).toBe(true);
  });

  it("carries the line, the train and where it is going", () => {
    const one = departureFrom(solution(), settings, before)!;

    expect(one.line).toBe("S3");
    expect(one.number).toBe("24015");
    expect(one.direction).toBe("SARONNO");
    expect(one.scheduled).toBe("08:15");
  });

  it("prefers a reported delay and moves the expected time with it", () => {
    const one = departureFrom(solution({ delay: 7 }), settings, before)!;

    expect(one.delay).toBe(7);
    expect(one.delayed).toBe(true);
    expect(one.expected).toBe("08:22");
  });

  it("prefers an actual time over adding the delay by hand", () => {
    const one = departureFrom(solution({ delay: 7, actual: "08:19:00" }), settings, before)!;
    expect(one.expected).toBe("08:19");
  });

  it("infers the delay from an estimate that carries no reported delay", () => {
    // Otherwise the board shows a later clock while claiming to be on time.
    const one = departureFrom(solution({ estimated: "08:21:00" }), settings, before)!;

    expect(one.expected).toBe("08:21");
    expect(one.delay).toBe(6);
  });

  it("does not read a train running early as a day-long delay", () => {
    const one = departureFrom(solution({ estimated: "08:13:00" }), settings, before)!;
    expect(one.delay).toBe(0);
  });

  it("drops a train that has already gone", () => {
    // HAFAS likes to include the one that just left. Nobody can catch it.
    expect(departureFrom(solution(), settings, after)).toBeNull();
  });

  it("drops a train you could not reach in time", () => {
    const walking = { ...settings, leadTime: 40 };
    // 05:00 UTC is 07:00 in Rome: the 08:15 is 75 minutes off, so it survives.
    expect(departureFrom(solution(), walking, before)).not.toBeNull();

    // 06:00 UTC is 08:00: only 15 minutes, less than the 40 needed to get there.
    expect(departureFrom(solution(), walking, new Date("2026-08-27T06:00:00Z"))).toBeNull();
  });

  it("counts a cancellation from either place Trenord puts it", () => {
    expect(departureFrom(solution({ cancelled: true }), settings, before)!.cancelled).toBe(true);
    expect(departureFrom(solution({ status: "S" }), settings, before)!.cancelled).toBe(true);
    expect(departureFrom(solution(), settings, before)!.cancelled).toBe(false);
  });

  it("says on time only when the train is actually reporting", () => {
    expect(departureFrom(solution({ live: true }), settings, before)!.status).toBe("ON TIME");
    expect(departureFrom(solution(), settings, before)!.status).toBe("SCHEDULED");
    expect(departureFrom(solution({ delay: 4 }), settings, before)!.status).toBe("DELAYED");
    expect(departureFrom(solution({ cancelled: true }), settings, before)!.status).toBe("CANCELLED");
  });

  it("counts a change, and calls no changes direct", () => {
    expect(departureFrom(solution(), settings, before)!.direct).toBe(true);
    expect(departureFrom(solution({ change: 1 }), settings, before)!.direct).toBe(false);
  });

  it("ignores a solution with no legs at all", () => {
    expect(departureFrom({ journey_list: [] }, settings, before)).toBeNull();
  });

  it("counts tomorrow's train as a day away, in the station's own zone", () => {
    // 21:00 UTC is 23:00 in Rome, so a 00:30 Rome train is tomorrow *there* -
    // and ninety minutes off, which is the number that would come out wrong if
    // the day were counted in the server's zone instead of the station's.
    const one = departureFrom(
      solution({ depTime: "00:30:00", depIso: "2026-08-28T00:30:00+02:00" }),
      settings,
      new Date("2026-08-27T21:00:00Z"),
    )!;

    expect(one.day_offset).toBe(1);
    expect(one.minutes_until).toBe(90);
  });
});

describe("what an alert is called", () => {
  it("keeps a title that says something", () => {
    expect(headlineOf("Reduced service", "Engineering work near Certosa.")).toBe(
      "Reduced service",
    );
  });

  it("looks past the name of the noticeboard to what is actually on it", () => {
    // Trenord titles every bulletin "Bacheca digitale" whatever it says, so a
    // board showing the title shows the name of the noticeboard and never the
    // notice - a permanent warning glyph attached to no information.
    expect(
      headlineOf(
        "Digital notice board",
        "Rail service is suspended on the Milan bypass. Replacement buses are running.",
      ),
    ).toBe("Rail service is suspended on the Milan bypass.");
  });

  it("does the same in the language the board was asked for", () => {
    expect(headlineOf("Bacheca digitale", "Servizio sospeso. Bus sostitutivi.")).toBe(
      "Servizio sospeso.",
    );
  });

  it("cuts a sentence nobody can read off a strip", () => {
    const long = `${"Attention please, ".repeat(20)}.`;
    const said = headlineOf("Digital notice board", long);

    expect(said.length).toBeLessThanOrEqual(140);
    expect(said.endsWith("...")).toBe(true);
  });

  it("falls back to the title when there is no message at all", () => {
    expect(headlineOf("Digital notice board", "")).toBe("Digital notice board");
  });
});
