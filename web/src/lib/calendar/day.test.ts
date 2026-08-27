import { describe, expect, it } from "vitest";

import {
  assignLanes,
  busyMinutes,
  conflicting,
  dayShape,
  gapsAfter,
  ribbonWindow,
  type Meeting,
} from "./day";

/** A Thursday in Milan, where the offset is +2 and nothing awkward happens. */
const ZONE = "Europe/Rome";
const on = (hour: number, minute = 0) => new Date(Date.UTC(2026, 7, 27, hour - 2, minute));

let counter = 0;

function meeting(from: Date, to: Date, overrides: Partial<Meeting> = {}): Meeting {
  counter += 1;
  return {
    id: `m${counter}`,
    title: "Something",
    startsAt: from,
    endsAt: to,
    location: "",
    remote: false,
    response: "accepted",
    allDay: false,
    ...overrides,
  };
}

describe("conflicting", () => {
  it("finds both halves of a double booking", () => {
    const one = meeting(on(10), on(11));
    const other = meeting(on(10, 30), on(11, 30));
    const apart = meeting(on(14), on(15));

    const clashing = conflicting([one, other, apart]);

    expect([...clashing].sort()).toEqual([one.id, other.id].sort());
  });

  it("does not let an all-day event double-book the day inside it", () => {
    const off = meeting(on(0), on(24), { allDay: true, title: "Leave" });
    const standup = meeting(on(9, 30), on(9, 45));

    expect(conflicting([off, standup]).size).toBe(0);
  });

  it("does not clash two meetings that merely touch", () => {
    expect(conflicting([meeting(on(10), on(11)), meeting(on(11), on(12))]).size).toBe(0);
  });
});

describe("busyMinutes", () => {
  it("counts overlapping meetings once, not twice", () => {
    // Ten to eleven and half past ten to half past eleven is ninety minutes of
    // a day, not one hundred and twenty. Summing them is how a dashboard ends
    // up claiming a day is 140% booked.
    const busy = busyMinutes(
      [meeting(on(10), on(11)), meeting(on(10, 30), on(11, 30))],
      on(0),
      on(24),
    );

    expect(busy).toBe(90);
  });

  it("clips to the window it was asked about", () => {
    expect(busyMinutes([meeting(on(8), on(12))], on(9), on(10))).toBe(60);
  });

  it("leaves out what you declined, and what lasts all day", () => {
    expect(
      busyMinutes(
        [
          meeting(on(10), on(11), { response: "declined" }),
          meeting(on(0), on(24), { allDay: true }),
        ],
        on(0),
        on(24),
      ),
    ).toBe(0);
  });
});

describe("gapsAfter", () => {
  it("finds the holes between what is left of the day", () => {
    const gaps = gapsAfter(
      [meeting(on(10), on(11)), meeting(on(14), on(15))],
      on(9),
      on(18),
      ZONE,
    );

    expect(gaps.map((gap) => [gap.from, gap.to, gap.minutes])).toEqual([
      ["09:00", "10:00", 60],
      ["11:00", "14:00", 180],
      ["15:00", "18:00", 180],
    ]);
  });

  it("does not call the walk between two rooms a gap", () => {
    const gaps = gapsAfter(
      [meeting(on(10), on(11)), meeting(on(11, 5), on(12))],
      on(10),
      on(12),
      ZONE,
    );

    expect(gaps).toEqual([]);
  });

  it("does not report a gap inside a meeting that swallows another", () => {
    const gaps = gapsAfter(
      [meeting(on(9), on(13)), meeting(on(10), on(11))],
      on(9),
      on(13),
      ZONE,
    );

    expect(gaps).toEqual([]);
  });
});

describe("ribbonWindow", () => {
  const card = (start: number, end: number) =>
    ({ start_minutes: start, end_minutes: end }) as never;

  it("stretches to hold a meeting outside the working day", () => {
    const window = ribbonWindow([card(6 * 60 + 40, 7 * 60 + 30)], 9 * 60, 18 * 60, 10 * 60);

    expect(window.open).toBe(6 * 60);
    expect(window.close).toBe(18 * 60);
  });

  it("always contains the time it is now", () => {
    const window = ribbonWindow([], 9 * 60, 18 * 60, 21 * 60 + 10);

    expect(window.close).toBe(22 * 60);
    expect(window.now_percent).toBeLessThanOrEqual(100);
  });
});

describe("dayShape", () => {
  const shape = (meetings: Meeting[], now = on(10, 15)) =>
    dayShape(meetings, now, { timezone: ZONE, locale: "en-GB", openMinute: 9 * 60, closeMinute: 18 * 60 });

  it("knows when you are in something, and what is after it", () => {
    const answer = shape([
      meeting(on(10), on(11), { title: "Design review" }),
      meeting(on(11, 30), on(12), { title: "Standup" }),
      meeting(on(15), on(15, 30), { title: "One to one" }),
    ]) as Record<string, { title?: string; in_meeting?: boolean }>;

    expect(answer.now.in_meeting).toBe(true);
    expect(answer.current?.title).toBe("Design review");
    expect(answer.next?.title).toBe("Standup");
    expect(answer.after?.title).toBe("One to one");
  });

  it("counts what is done and what is left", () => {
    const answer = shape([
      meeting(on(8), on(8, 30)),
      meeting(on(9), on(9, 30)),
      meeting(on(14), on(15)),
    ]) as Record<string, Record<string, number>>;

    expect(answer.today.total).toBe(3);
    expect(answer.today.done).toBe(2);
    expect(answer.today.remaining).toBe(1);
  });

  it("measures how full the day is against the working day, not the clock", () => {
    // Nine to six is nine hours; three of them booked is a third.
    const answer = shape([meeting(on(9), on(12))]) as Record<string, Record<string, number>>;

    expect(answer.today.load_percent).toBe(33);
    expect(answer.today.busy_text).toBe("3h");
  });

  it("says the day is empty when nothing is on it", () => {
    const answer = shape([]) as Record<string, unknown>;

    expect(answer.empty).toBe(true);
    expect(answer.next).toBe(null);
  });

  it("carries each meeting three ways, because designs need three", () => {
    const answer = shape([meeting(on(14), on(15), { title: "Later" })]) as Record<string, Record<string, unknown>[]>;
    const [card] = answer.events;

    expect(card.start).toBe("14:00");
    expect(card.start_minutes).toBe(14 * 60);
    expect(card.at_epoch).toBe(Math.floor(on(14).getTime() / 1000));
    expect(card.minutes_until).toBe(225);
  });

  it("keeps tomorrow separate from today", () => {
    const answer = shape([
      meeting(on(14), on(15), { title: "Today" }),
      meeting(new Date(on(9).getTime() + 24 * 3600_000), new Date(on(10).getTime() + 24 * 3600_000), {
        title: "Tomorrow",
      }),
    ]) as Record<string, Record<string, unknown>>;

    expect((answer.today as Record<string, number>).total).toBe(1);
    expect(answer.tomorrow.count).toBe(1);
    expect((answer.tomorrow.first as { title: string }).title).toBe("Tomorrow");
  });
});

describe("assignLanes", () => {
  const card = (id: string, from: number, to: number) =>
    ({ id, at_epoch: from, ends_epoch: to, lane: 0, lanes: 1 }) as never as import("./day").Card;

  it("puts two things at once side by side", () => {
    const laid = assignLanes([card("a", 0, 60), card("b", 30, 90)]);

    expect(laid.map((one) => [one.id, one.lane, one.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
    ]);
  });

  it("starts again at the left once the run is over", () => {
    const laid = assignLanes([card("a", 0, 60), card("b", 30, 90), card("c", 120, 180)]);

    expect(laid.find((one) => one.id === "c")).toMatchObject({ lane: 0, lanes: 1 });
  });

  it("reuses a column that has been freed inside a run", () => {
    // a runs long; b and c fit one after the other beside it, and both belong
    // in the same column rather than in a third.
    const laid = assignLanes([card("a", 0, 240), card("b", 30, 60), card("c", 90, 120)]);

    expect(laid.map((one) => one.lane)).toEqual([0, 1, 1]);
    expect(laid.every((one) => one.lanes === 2)).toBe(true);
  });
});
