import { describe, expect, it } from "vitest";

import { board } from "./board";

const at = new Date("2026-08-27T08:00:00Z");
const base = { country: "it", city: "milan", provider: "trenord", origin: "Milano Cadorna" };

describe("the departure board", () => {
  it("reads the settings it was given", async () => {
    // The previous version answered with the manifest's sample whatever it was
    // asked, so From and To were decoration on a screen.
    const cadorna = (await board({ ...base, destination: "Saronno" }, at)) as never;
    const centrale = (await board(
      { ...base, origin: "Milano Centrale", destination: "Bergamo" },
      at,
    )) as never;

    const one = (cadorna as { transit: { origin: string; departures: unknown[] } }).transit;
    const two = (centrale as { transit: { origin: string; departures: unknown[] } }).transit;

    expect(one.origin).toBe("Milano Cadorna");
    expect(two.origin).toBe("Milano Centrale");
    expect(JSON.stringify(one.departures)).not.toBe(JSON.stringify(two.departures));
  });

  it("shows as many departures as asked for", async () => {
    const three = await board({ ...base, limit: 3 }, at);
    expect((three as { transit: { departures: unknown[] } }).transit.departures).toHaveLength(3);
  });

  it("hides departures you could not reach in time", async () => {
    const walk = 25;
    const result = await board({ ...base, lead_time: walk, limit: 5 }, at);
    const departures = (result as { transit: { departures: { minutes_until: number }[] } }).transit
      .departures;

    expect(departures.every((departure) => departure.minutes_until >= walk)).toBe(true);
  });

  it("leaves the platform out for an operator that has none", async () => {
    // ATM is a metro board: no platforms, and the settings form hides the
    // switch for the same reason.
    const metro = await board({ ...base, provider: "atm" }, at);
    const departures = (metro as { transit: { departures: { platform: string }[] } }).transit
      .departures;

    expect(departures.every((departure) => departure.platform === "")).toBe(true);
  });

  it("refuses an operator that does not answer for the city", async () => {
    await expect(board({ ...base, provider: "sbb" }, at)).rejects.toThrow(/sbb/);
  });

  it("refuses to draw a board with nowhere to leave from", async () => {
    await expect(board({ ...base, origin: "" }, at)).rejects.toThrow(/station/i);
  });

  it("renders the same minute the same way twice", async () => {
    const once = await board(base, at);
    const twice = await board(base, at);

    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});
