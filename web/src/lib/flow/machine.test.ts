import { describe, expect, it } from "vitest";

import type { Context } from "./conditions";
import { decide, type State, type Transition } from "./machine";

const facts = [
  { key: "next_meeting_in", label: "Next meeting starts in", type: "duration" as const, path: "next.minutes_until", unit: "min" },
  { key: "next_meeting_location", label: "Next meeting location", type: "text" as const, path: "next.location", unit: "" },
];

const home: State = { id: 1, name: "Home", screenId: 10, refreshSeconds: 900, isInitial: true, minDwellSeconds: 0 };
const commute: State = { id: 2, name: "Commute", screenId: 20, refreshSeconds: 300, isInitial: false, minDwellSeconds: 0 };

function context(payload: unknown, now = new Date("2026-08-27T09:00:00Z")): Context {
  return {
    now,
    device: { percentCharged: 80, usbConnected: false, rssi: -50, updateSource: null },
    widgets: new Map([[7, { payload, facts, label: "Calendar", fetchedAt: now }]]),
  };
}

const meetingWithin = (minutes: number): Transition => ({
  id: 100,
  fromStateId: null,
  toStateId: 2,
  condition: { kind: "fact", widgetId: 7, factKey: "next_meeting_in", operator: "lt", value: minutes },
  priority: 0,
});

describe("the flow machine", () => {
  it("moves to the commute screen when a meeting is close", () => {
    const decision = decide([home, commute], [meetingWithin(30)], { currentStateId: 1, stateEnteredAt: null }, context({ next: { minutes_until: 12 } }), 900);

    expect(decision?.state.name).toBe("Commute");
    expect(decision?.moved).toBe(true);
    expect(decision?.refreshSeconds).toBe(300);
    expect(decision?.reason).toContain("Next meeting starts in is less than 30");
    expect(decision?.reason).toContain("12 min");
  });

  it("stays home when the meeting is still far off, and says what it saw", () => {
    const decision = decide([home, commute], [meetingWithin(30)], { currentStateId: 1, stateEnteredAt: null }, context({ next: { minutes_until: 84 } }), 900);

    expect(decision?.state.name).toBe("Home");
    expect(decision?.steps[0].trace.holds).toBe(false);
    expect(decision?.steps[0].trace.actual).toBe("84 min");
  });

  it("returns home on its own once the meeting has passed, with no edge drawn back", () => {
    const decision = decide([home, commute], [meetingWithin(30)], { currentStateId: 2, stateEnteredAt: new Date("2026-08-27T08:00:00Z") }, context({ next: { minutes_until: 240 } }), 900);

    expect(decision?.state.name).toBe("Home");
    expect(decision?.reason).toContain("returned to Home");
  });

  it("refuses to move while the current state is still holding its dwell", () => {
    const sticky = { ...home, minDwellSeconds: 600 };
    const decision = decide([sticky, commute], [meetingWithin(30)], { currentStateId: 1, stateEnteredAt: new Date("2026-08-27T08:55:00Z") }, context({ next: { minutes_until: 5 } }), 900);

    expect(decision?.state.name).toBe("Home");
    expect(decision?.steps[0].blockedBy).toBe("dwell");
    expect(decision?.reason).toContain("does not flicker");
  });

  it("matches on what a meeting location says, not just that there is one", () => {
    const inMilan: Transition = {
      id: 101,
      fromStateId: null,
      toStateId: 2,
      condition: { kind: "fact", widgetId: 7, factKey: "next_meeting_location", operator: "contains", value: "milano" },
      priority: 0,
    };

    const hit = decide([home, commute], [inMilan], { currentStateId: 1, stateEnteredAt: null }, context({ next: { location: "Milano Centrale, Bin. 5" } }), 900);
    const miss = decide([home, commute], [inMilan], { currentStateId: 1, stateEnteredAt: null }, context({ next: { location: "Zoom" } }), 900);

    expect(hit?.state.name).toBe("Commute");
    expect(miss?.state.name).toBe("Home");
  });

  it("prefers an edge out of this state over a from-anywhere edge of equal priority", () => {
    const anywhere: Transition = { id: 200, fromStateId: null, toStateId: 2, condition: { kind: "always" }, priority: 0 };
    const specific: Transition = { id: 201, fromStateId: 1, toStateId: 1, condition: { kind: "always" }, priority: 0 };

    const decision = decide([home, commute], [anywhere, specific], { currentStateId: 1, stateEnteredAt: null }, context({}), 900);

    expect(decision?.state.name).toBe("Home");
  });

  it("keeps showing the last screen when the data source has gone quiet", () => {
    const decision = decide([home, commute], [meetingWithin(30)], { currentStateId: 1, stateEnteredAt: null }, context({}), 900);

    expect(decision?.state.name).toBe("Home");
    expect(decision?.steps[0].trace.actual).toBe("no value yet");
  });
});
