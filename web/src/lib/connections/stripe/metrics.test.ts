import { describe, expect, it } from "vitest";

import { DAY } from "@/lib/clock";
import {
  afterDiscounts,
  bucketByDay,
  bucketByHour,
  forecastNext,
  monthlyValue,
  runningTotal,
  sumBetween,
  sumSince,
  windowStarts,
  type Entry,
} from "./metrics";

const at = (iso: string, amount: number): Entry => ({ at: new Date(iso), amount });

describe("bucketing a month of takings by local day", () => {
  const now = new Date("2026-08-27T22:30:00Z");

  it("puts a late-evening payment in the local day it belongs to", () => {
    // 22:30 UTC is already the 28th in Rome, and still the 27th in London.
    const entries = [at("2026-08-27T22:15:00Z", 1000)];

    const rome = bucketByDay(entries, "Europe/Rome", "en-GB", 3, now);
    const london = bucketByDay(entries, "Europe/London", "en-GB", 3, now);

    expect(rome[rome.length - 1]).toMatchObject({ key: "2026-08-28", amount: 1000 });
    expect(london[london.length - 1]).toMatchObject({ key: "2026-08-27", amount: 1000 });
  });

  it("keeps the quiet days, because a chart with them dropped lies about the shape", () => {
    const buckets = bucketByDay([at("2026-08-27T10:00:00Z", 500)], "UTC", "en-GB", 5, now);

    expect(buckets).toHaveLength(5);
    expect(buckets.map((bucket) => bucket.amount)).toEqual([0, 0, 0, 0, 500]);
    expect(buckets[0].key).toBe("2026-08-23");
  });

  it("runs oldest first, so today is the last bar", () => {
    const buckets = bucketByDay([], "UTC", "en-GB", 7, now);
    expect(buckets[buckets.length - 1].key).toBe("2026-08-27");
  });

  it("adds refunds in as the negatives they already are", () => {
    const buckets = bucketByDay(
      [at("2026-08-27T09:00:00Z", 5000), at("2026-08-27T11:00:00Z", -2000)],
      "UTC",
      "en-GB",
      1,
      now,
    );

    expect(buckets[0].amount).toBe(3000);
  });
});

describe("the windows", () => {
  const now = new Date("2026-08-27T09:00:00Z");
  const entries = [
    at("2026-08-27T08:00:00Z", 100), // today
    at("2026-08-26T23:00:00Z", 200), // yesterday, and inside the last 24h
    at("2026-08-26T06:00:00Z", 400), // yesterday, outside the last 24h
  ];

  it("tells today apart from the last 24 hours, which is the whole point of having both", () => {
    const starts = windowStarts(now, "UTC");

    expect(sumSince(entries, starts.today)).toBe(100);
    expect(sumSince(entries, starts.last24h)).toBe(300);
  });

  it("closes yesterday at local midnight rather than leaving it rolling", () => {
    const starts = windowStarts(now, "UTC");
    expect(sumBetween(entries, starts.yesterday, starts.today)).toBe(600);
  });
});

describe("normalising a price to a month", () => {
  const price = (
    interval: "day" | "week" | "month" | "year",
    intervalCount: number,
    unitAmount: number,
    quantity = 1,
  ) => monthlyValue({ interval, intervalCount, unitAmount, quantity });

  it("leaves a monthly price alone", () => {
    expect(price("month", 1, 2000)).toBe(2000);
  });

  it("spreads a yearly price over twelve months", () => {
    expect(price("year", 1, 24000)).toBe(2000);
  });

  it("handles a quarterly price, which is the case people forget", () => {
    expect(price("month", 3, 6000)).toBe(2000);
  });

  it("scales weekly and daily prices by an average month", () => {
    expect(price("week", 1, 1000)).toBeCloseTo(4348, 0);
    expect(price("day", 1, 100)).toBeCloseTo(3044, 0);
  });

  it("multiplies by the quantity, so five seats is five seats", () => {
    expect(price("month", 1, 2000, 5)).toBe(10000);
  });

  it("treats a two-yearly price as half a yearly one", () => {
    expect(price("year", 2, 24000)).toBe(1000);
  });
});

describe("discounts", () => {
  it("takes the percentage first, then any flat amount", () => {
    expect(afterDiscounts(10000, [{ percentOff: 50 }])).toBe(5000);
    expect(afterDiscounts(10000, [{ amountOff: 1500 }])).toBe(8500);
    expect(afterDiscounts(10000, [{ percentOff: 50, amountOff: 1000 }])).toBe(4000);
  });

  it("never turns a subscription into negative revenue", () => {
    expect(afterDiscounts(1000, [{ amountOff: 5000 }])).toBe(0);
  });

  it("leaves an undiscounted subscription untouched", () => {
    expect(afterDiscounts(2000, [])).toBe(2000);
  });
});

describe("forecasting the next subscriber", () => {
  const now = new Date("2026-08-27T12:00:00Z");
  const daysAgo = (count: number) => new Date(now.getTime() - count * DAY);

  it("measures the gap from the last signup, which is where its clock started", () => {
    // Thirty signups over thirty days is one a day, and the last was half a
    // day ago - so the next is due in half a day.
    const created = Array.from({ length: 30 }, (_, index) => daysAgo(index + 0.5));
    const forecast = forecastNext(created, 30, now);

    expect(forecast.perWeek).toBe(7);
    expect(forecast.confidence).toBe("steady");
    expect(forecast.expectedAt!.getTime() - now.getTime()).toBeCloseTo(0.5 * DAY, -5);
  });

  it("says how much it is standing on, so a design can print 'roughly'", () => {
    expect(forecastNext([daysAgo(1)], 30, now).confidence).toBe("guess");
    expect(forecastNext([daysAgo(1), daysAgo(5), daysAgo(9)], 30, now).confidence).toBe("rough");
  });

  it("refuses to guess with nothing to go on", () => {
    const forecast = forecastNext([], 30, now);

    expect(forecast.expectedAt).toBeNull();
    expect(forecast.confidence).toBe("none");
    expect(forecast.perWeek).toBe(0);
  });

  it("ignores signups older than the window it claims to measure", () => {
    expect(forecastNext([daysAgo(40), daysAgo(50)], 30, now).sample).toBe(0);
  });

  it("reads a stalled signup rate as due now, not as overdue in the past", () => {
    // Two signups a month ago and nothing since: the gap has long since
    // elapsed, and "expected two weeks ago" is not a forecast.
    const forecast = forecastNext([daysAgo(29), daysAgo(28)], 30, now);
    expect(forecast.expectedAt!.getTime()).toBe(now.getTime());
  });
});

describe("bucketByHour", () => {
  const zone = "Europe/Rome";
  const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 7, 27, hour - 2, minute));

  it("buckets today's takings by local hour", () => {
    const hours = bucketByHour(
      [
        { at: at(9, 10), amount: 1000 },
        { at: at(9, 50), amount: 500 },
        { at: at(14), amount: 2000 },
      ],
      zone,
      at(0),
      at(15),
    );

    expect(hours).toHaveLength(24);
    expect(hours[9].amount).toBe(1500);
    expect(hours[14].amount).toBe(2000);
    expect(hours[10].amount).toBe(0);
  });

  it("marks the hours that have not happened yet", () => {
    const hours = bucketByHour([], zone, at(0), at(15, 30));

    expect(hours[15].ahead).toBe(false);
    expect(hours[16].ahead).toBe(true);
  });

  it("ignores anything before today", () => {
    const hours = bucketByHour([{ at: at(-6), amount: 900 }], zone, at(0), at(12));

    expect(hours.reduce((total, hour) => total + hour.amount, 0)).toBe(0);
  });
});

describe("runningTotal", () => {
  it("carries each day into the next", () => {
    expect(runningTotal([10, 20, 5])).toEqual([10, 30, 35]);
  });

  it("answers an empty series with an empty one", () => {
    expect(runningTotal([])).toEqual([]);
  });
});
