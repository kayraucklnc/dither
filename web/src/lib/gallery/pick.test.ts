import { describe, expect, it } from "vitest";

import { holdSeconds, slotOf, turnOf } from "./pick";

/**
 * The rotation is the one part of the gallery worth testing hard, because the
 * failure it is designed against is invisible: a pick that varies between two
 * fetches inside one hold does not look wrong on screen at all. It just hands
 * the device a new file every time it wakes, and the only symptom is a battery
 * that goes flat a month early.
 */

const items = ["a", "b", "c", "d", "e"];
const at = (iso: string) => new Date(iso);

describe("holdSeconds", () => {
  it("reads the named holds, and falls back to an hour", () => {
    expect(holdSeconds("never")).toBe(0);
    expect(holdSeconds("quarter")).toBe(900);
    expect(holdSeconds("day")).toBe(86_400);
    expect(holdSeconds(undefined)).toBe(3600);
    expect(holdSeconds("fortnightly")).toBe(3600);
  });
});

describe("slotOf", () => {
  it("does not move at all when nothing rotates", () => {
    expect(slotOf(at("2026-01-01T00:00:00Z"), 0, "UTC")).toBe(0);
    expect(slotOf(at("2031-06-14T09:30:00Z"), 0, "UTC")).toBe(0);
  });

  it("counts equal blocks from the epoch, below a day", () => {
    const early = slotOf(at("2026-08-27T09:00:00Z"), 3600, "UTC");

    expect(slotOf(at("2026-08-27T09:59:59Z"), 3600, "UTC")).toBe(early);
    expect(slotOf(at("2026-08-27T10:00:00Z"), 3600, "UTC")).toBe(early + 1);
  });

  it("counts a day by local midnights, not by dividing", () => {
    // 00:30 in Rome is 22:30 the previous day in UTC. A day counted by
    // division would put these two in different slots and change the picture
    // in the middle of the night.
    const before = slotOf(at("2026-08-26T23:00:00Z"), 86_400, "Europe/Rome");
    const after = slotOf(at("2026-08-27T09:00:00Z"), 86_400, "Europe/Rome");

    expect(before).toBe(after);
  });

  it("still turns over exactly once across a clocks change", () => {
    // Rome moves to summer time at 02:00 on 29 March 2026, so that local day
    // is 23 hours long. Divided arithmetic drifts an hour and eventually
    // rolls the picture over at 23:00.
    const saturday = slotOf(at("2026-03-28T12:00:00Z"), 86_400, "Europe/Rome");
    const sunday = slotOf(at("2026-03-29T12:00:00Z"), 86_400, "Europe/Rome");
    const monday = slotOf(at("2026-03-30T12:00:00Z"), 86_400, "Europe/Rome");

    expect(sunday).toBe(saturday + 1);
    expect(monday).toBe(sunday + 1);
  });
});

describe("turnOf", () => {
  const rotation = { order: "shuffle", hold: 3600, seed: "pins" };

  it("has nothing to say about an empty collection", () => {
    expect(turnOf([], at("2026-08-27T09:00:00Z"), rotation, "UTC")).toBeUndefined();
  });

  it("gives the same answer everywhere inside one hold", () => {
    const first = turnOf(items, at("2026-08-27T09:00:00Z"), rotation, "UTC");
    const later = turnOf(items, at("2026-08-27T09:04:59Z"), rotation, "UTC");
    const last = turnOf(items, at("2026-08-27T09:59:59Z"), rotation, "UTC");

    // This is the whole point: five minutes apart is five refetches, and all
    // five have to produce a payload that hashes the same.
    expect(later).toEqual(first);
    expect(last).toEqual(first);
  });

  it("moves on when the hold does", () => {
    const before = turnOf(items, at("2026-08-27T09:30:00Z"), rotation, "UTC")!;
    const after = turnOf(items, at("2026-08-27T10:30:00Z"), rotation, "UTC")!;

    expect(after.now).not.toBe(before.now);
    expect(after.now).toBe(before.next);
  });

  it("shows every picture once before showing any of them twice", () => {
    const seen = new Set<string>();

    for (let hour = 0; hour < items.length; hour += 1) {
      const turn = turnOf(items, new Date(hour * 3_600_000), rotation, "UTC")!;
      seen.add(turn.now);
    }

    expect([...seen].sort()).toEqual(items);
  });

  it("shuffles into a different order on the next time round", () => {
    const order = (cycle: number) =>
      items.map(
        (_, step) => turnOf(items, new Date((cycle * items.length + step) * 3_600_000), rotation, "UTC")!.now,
      );

    expect(order(1)).not.toEqual(order(0));
    expect([...order(1)].sort()).toEqual(items);
  });

  it("walks the filing order when asked to", () => {
    const inTurn = { ...rotation, order: "sequence" };
    const walked = items.map(
      (_, hour) => turnOf(items, new Date(hour * 3_600_000), inTurn, "UTC")!.now,
    );

    expect(walked).toEqual(items);
  });

  it("keeps two collections of the same size out of step", () => {
    const here = turnOf(items, at("2026-08-27T09:00:00Z"), rotation, "UTC")!;
    const there = turnOf(items, at("2026-08-27T09:00:00Z"), { ...rotation, seed: "holidays" }, "UTC")!;

    // Not a guarantee for every seed, but these two must differ or two gallery
    // widgets on one screen turn over together like a departure board.
    expect(there.now).not.toBe(here.now);
  });

  it("copes with a collection of one", () => {
    const turn = turnOf(["only"], at("2026-08-27T09:00:00Z"), rotation, "UTC")!;

    expect(turn.now).toBe("only");
    expect(turn.next).toBe("only");
    expect(turn.position).toBe(1);
  });
});
