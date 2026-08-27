import { describe, expect, it } from "vitest";

import { evaluate, summarise, type Condition, type Context } from "./conditions";

const facts = [
  { key: "rain_chance", label: "Chance of rain", type: "number" as const, path: "w.rain", unit: "%" },
  { key: "next_meeting_in", label: "Next meeting starts in", type: "duration" as const, path: "c.minutes", unit: "min" },
  { key: "location", label: "Next meeting location", type: "text" as const, path: "c.location", unit: "" },
];

function context(payload: Record<string, unknown>, now = new Date("2026-08-27T09:00:00Z")): Context {
  return {
    now,
    sources: new Map([
      ["s", { id: "s", label: "Sources", group: "trigger" as const, facts, payload, fetchedAt: now }],
    ]),
  };
}

const rainOver = (percent: number): Condition => ({
  kind: "fact", sourceId: "s", factKey: "rain_chance", operator: "gt", value: percent,
});
const meetingWithin = (minutes: number): Condition => ({
  kind: "fact", sourceId: "s", factKey: "next_meeting_in", operator: "lt", value: minutes,
});
const locationHas = (text: string): Condition => ({
  kind: "fact", sourceId: "s", factKey: "location", operator: "contains", value: text,
});

describe("all of", () => {
  const both: Condition = { kind: "all", conditions: [meetingWithin(30), locationHas("milano")] };

  it("holds only when every member holds", () => {
    expect(evaluate(both, context({ c: { minutes: 12, location: "Milano Centrale" } })).holds).toBe(true);
    expect(evaluate(both, context({ c: { minutes: 12, location: "Zoom" } })).holds).toBe(false);
    expect(evaluate(both, context({ c: { minutes: 240, location: "Milano Centrale" } })).holds).toBe(false);
  });

  it("reads back as a sentence joined by and", () => {
    expect(summarise(both, { sources: context({}).sources })).toBe(
      "Sources: Next meeting starts in is less than 30 and Sources: Next meeting location contains milano",
    );
  });

  it("reports how each member answered, so a false group can be taken apart", () => {
    const trace = evaluate(both, context({ c: { minutes: 12, location: "Zoom" } }));

    expect(trace.children?.map((child) => child.holds)).toEqual([true, false]);
    expect(trace.children?.[1].actual).toBe("Zoom");
  });

  it("holds when it is empty, the way an empty AND does", () => {
    expect(evaluate({ kind: "all", conditions: [] }, context({})).holds).toBe(true);
  });
});

describe("any of", () => {
  const either: Condition = { kind: "any", conditions: [rainOver(60), meetingWithin(15)] };

  it("holds when one member holds", () => {
    expect(evaluate(either, context({ w: { rain: 80 }, c: { minutes: 240 } })).holds).toBe(true);
    expect(evaluate(either, context({ w: { rain: 5 }, c: { minutes: 6 } })).holds).toBe(true);
    expect(evaluate(either, context({ w: { rain: 5 }, c: { minutes: 240 } })).holds).toBe(false);
  });

  it("does not hold when it is empty, the way an empty OR does not", () => {
    expect(evaluate({ kind: "any", conditions: [] }, context({})).holds).toBe(false);
  });
});

describe("nesting", () => {
  // "raining, or (a meeting soon that is somewhere I have to travel to)"
  const nested: Condition = {
    kind: "any",
    conditions: [rainOver(60), { kind: "all", conditions: [meetingWithin(30), locationHas("milano")] }],
  };

  it("evaluates the inner group before the outer one", () => {
    expect(evaluate(nested, context({ w: { rain: 5 }, c: { minutes: 12, location: "Milano" } })).holds).toBe(true);
    expect(evaluate(nested, context({ w: { rain: 5 }, c: { minutes: 12, location: "Zoom" } })).holds).toBe(false);
    expect(evaluate(nested, context({ w: { rain: 90 }, c: { minutes: 12, location: "Zoom" } })).holds).toBe(true);
  });

  it("parenthesises the nested group so the sentence cannot be misread", () => {
    expect(summarise(nested, { sources: context({}).sources })).toBe(
      "Sources: Chance of rain is more than 60 or " +
        "(Sources: Next meeting starts in is less than 30 and " +
        "Sources: Next meeting location contains milano)",
    );
  });
});

describe("somewhere to be within the hour", () => {
  /*
   * The rule off a real panel: a meeting starting soon, that is not a video
   * call, that has a place to go. It was answering yes on a day with nothing
   * in it, because the calendar payload carries the countdown the *provider*
   * worked out and a stored number does not tick. See `until` in lib/facts.
   */
  const calendarFacts = [
    {
      key: "next_meeting_in",
      label: "Next meeting starts in",
      type: "duration" as const,
      path: "calendar.next.minutes_until",
      until: "calendar.next.at_epoch",
      unit: "minutes",
    },
    {
      key: "next_meeting_is_remote",
      label: "Next meeting is a video call",
      type: "boolean" as const,
      path: "calendar.next.remote",
      unit: "",
    },
    {
      key: "next_meeting_location",
      label: "Next meeting location",
      type: "text" as const,
      path: "calendar.next.location",
      unit: "",
    },
  ];

  const leavingNow: Condition = {
    kind: "all",
    conditions: [
      { kind: "fact", sourceId: "day", factKey: "next_meeting_in", operator: "lt", value: 60 },
      { kind: "fact", sourceId: "day", factKey: "next_meeting_is_remote", operator: "is_false" },
      { kind: "fact", sourceId: "day", factKey: "next_meeting_location", operator: "present" },
    ],
  };

  /** One fetch at 09:00, which found a meeting in Sala 4 at 09:30. */
  const fetched = {
    calendar: {
      next: {
        minutes_until: 30,
        at_epoch: Date.parse("2026-08-27T09:30:00Z") / 1000,
        remote: false,
        location: "Sala 4",
      },
    },
  };

  const at = (moment: string, payload: Record<string, unknown> = fetched): Context => {
    const now = new Date(moment);

    return {
      now,
      sources: new Map([
        [
          "day",
          { id: "day", label: "My day", group: "trigger" as const, facts: calendarFacts, payload, fetchedAt: new Date("2026-08-27T09:00:00Z") },
        ],
      ]),
    };
  };

  it("holds while the meeting really is within the hour", () => {
    expect(evaluate(leavingNow, at("2026-08-27T09:05:00Z")).holds).toBe(true);
  });

  it("stops holding once the meeting has started, whatever the payload still says", () => {
    expect(evaluate(leavingNow, at("2026-08-27T09:35:00Z")).holds).toBe(false);
    expect(evaluate(leavingNow, at("2026-08-27T18:00:00Z")).holds).toBe(false);
    expect(evaluate(leavingNow, at("2026-08-28T09:05:00Z")).holds).toBe(false);
  });

  it("does not hold on a day with nothing in it", () => {
    expect(evaluate(leavingNow, at("2026-08-27T09:05:00Z", { calendar: { next: null } })).holds).toBe(
      false,
    );
  });

  it("says what it saw, so the canvas and the panel agree on the number", () => {
    const trace = evaluate(leavingNow, at("2026-08-27T09:20:00Z"));

    expect(trace.children?.[0].actual).toBe("10 minutes");
    expect(evaluate(leavingNow, at("2026-08-27T09:35:00Z")).children?.[0].actual).toBe(
      "no value yet",
    );
  });
});
