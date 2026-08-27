import { describe, expect, it } from "vitest";

import { board } from "./board";

/**
 * The *generated* board, for operators with no client yet.
 *
 * ATM rather than Trenord on purpose: Trenord has a real client now, and a
 * unit test that reaches out to Milan is a unit test that fails on a train.
 */
const at = new Date("2026-08-27T08:00:00Z");
const base = { country: "it", city: "milan", provider: "atm", origin: "Cadorna" };

type Board = { transit: { origin: string; departures: Record<string, unknown>[] } };

describe("a generated departure board", () => {
  it("reads the settings it was given", async () => {
    // The first version answered with the manifest's sample whatever it was
    // asked, so From and To were decoration on a screen.
    const one = ((await board({ ...base, destination: "Saronno" }, at)) as Board).transit;
    const two = ((await board(
      { ...base, origin: "Milano Centrale", destination: "Bergamo" },
      at,
    )) as Board).transit;

    expect(one.origin).toBe("Cadorna");
    expect(two.origin).toBe("Milano Centrale");
    expect(JSON.stringify(one.departures)).not.toBe(JSON.stringify(two.departures));
  });

  it("shows as many departures as asked for", async () => {
    const three = (await board({ ...base, limit: 3 }, at)) as Board;
    expect(three.transit.departures).toHaveLength(3);
  });

  it("hides departures you could not reach in time", async () => {
    const walk = 25;
    const result = (await board({ ...base, lead_time: walk, limit: 5 }, at)) as Board;

    expect(
      result.transit.departures.every((one) => Number(one.minutes_until) >= walk),
    ).toBe(true);
  });

  it("leaves the platform out for an operator that has none", async () => {
    // ATM is a metro board: no platforms, and the settings form hides the
    // switch for the same reason.
    const metro = (await board(base, at)) as Board;
    expect(metro.transit.departures.every((one) => one.platform === "")).toBe(true);
  });

  it("refuses an operator that does not answer for the city", async () => {
    await expect(board({ ...base, provider: "sbb" }, at)).rejects.toThrow(/sbb/);
  });

  it("refuses to draw a board with nowhere to leave from", async () => {
    await expect(board({ ...base, origin: "" }, at)).rejects.toThrow(/station/i);
  });

  it("renders the same minute the same way twice", async () => {
    expect(JSON.stringify(await board(base, at))).toBe(JSON.stringify(await board(base, at)));
  });
});
