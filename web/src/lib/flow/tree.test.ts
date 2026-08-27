import { describe, expect, it } from "vitest";

import type { Context } from "./conditions";
import { walk, type Node } from "./tree";

const facts = {
  weather: [
    { key: "rain_chance", label: "Chance of rain", type: "number" as const, path: "source_1.rain", unit: "%" },
  ],
  calendar: [
    { key: "next_meeting_in", label: "Next meeting starts in", type: "duration" as const, path: "next.minutes", unit: "min" },
    { key: "next_meeting_location", label: "Next meeting location", type: "text" as const, path: "next.location", unit: "" },
  ],
};

function context(rain: number | undefined, meeting: Record<string, unknown>, now = new Date("2026-08-27T09:00:00Z")): Context {
  return {
    now,
    device: { percentCharged: 80, usbConnected: false, rssi: -50, updateSource: null },
    widgets: new Map([
      [1, { payload: rain === undefined ? {} : { source_1: { rain } }, facts: facts.weather, label: "Weather", fetchedAt: now }],
      [2, { payload: { next: meeting }, facts: facts.calendar, label: "Calendar", fetchedAt: now }],
    ]),
  };
}

/*
 *  Is it raining?  --yes-->  Weather
 *        |no
 *  Meeting soon?   --yes-->  Commute
 *        |no
 *      Home
 */
const nodes: Node[] = [
  {
    id: 10, kind: "question", label: "Is it raining?",
    condition: { kind: "fact", widgetId: 1, factKey: "rain_chance", operator: "gt", value: 60 },
    yesNodeId: 11, noNodeId: 20, screenId: null, refreshSeconds: null, holdSeconds: 0,
  },
  { id: 11, kind: "screen", label: "Weather", condition: null, yesNodeId: null, noNodeId: null, screenId: 100, refreshSeconds: 600, holdSeconds: 1200 },
  {
    id: 20, kind: "question", label: "Meeting soon?",
    condition: { kind: "fact", widgetId: 2, factKey: "next_meeting_in", operator: "lt", value: 30 },
    yesNodeId: 21, noNodeId: 30, screenId: null, refreshSeconds: null, holdSeconds: 0,
  },
  { id: 21, kind: "screen", label: "Commute", condition: null, yesNodeId: null, noNodeId: null, screenId: 200, refreshSeconds: 300, holdSeconds: 0 },
  { id: 30, kind: "screen", label: "Home", condition: null, yesNodeId: null, noNodeId: null, screenId: 300, refreshSeconds: 900, holdSeconds: 0 },
];

const nowhere = { currentNodeId: null, nodeEnteredAt: null };

describe("walking the decision tree", () => {
  it("shows the weather when it rains, whatever else is true", () => {
    const result = walk(nodes, 10, nowhere, context(80, { minutes: 5, location: "Milano" }), 900);

    expect(result.leaf?.label).toBe("Weather");
    expect(result.refreshSeconds).toBe(600);
    expect(result.reason).toContain("Chance of rain is more than 60");
    expect(result.reason).toContain("80 %");
  });

  it("falls through to the meeting question when it is dry", () => {
    const result = walk(nodes, 10, nowhere, context(10, { minutes: 12 }), 900);

    expect(result.leaf?.label).toBe("Commute");
    expect(result.steps.map((step) => step.answer)).toEqual([false, true]);
  });

  it("lands on home when nothing applies, and says so", () => {
    const result = walk(nodes, 10, nowhere, context(10, { minutes: 240 }), 900);

    expect(result.leaf?.label).toBe("Home");
    expect(result.reason).toContain("nothing else applied");
  });

  /* This is the case a state machine needs a return stack for. */
  it("goes back where it belongs on its own once the rain stops", () => {
    const raining = walk(nodes, 10, nowhere, context(80, { minutes: 12 }), 900);
    expect(raining.leaf?.label).toBe("Weather");

    const cleared = walk(
      nodes,
      10,
      { currentNodeId: 11, nodeEnteredAt: new Date("2026-08-27T08:00:00Z") },
      context(5, { minutes: 12 }),
      900,
    );

    // No edge back was ever drawn; the tree simply re-answered the questions.
    expect(cleared.leaf?.label).toBe("Commute");
  });

  it("holds a screen for its minimum before letting the answer change it", () => {
    const result = walk(
      nodes,
      10,
      { currentNodeId: 11, nodeEnteredAt: new Date("2026-08-27T08:55:00Z") },
      context(5, { minutes: 240 }),
      900,
    );

    expect(result.leaf?.label).toBe("Weather");
    expect(result.held).toBe(true);
    expect(result.reason).toContain("Without the hold it would switch to Home");
  });

  it("keeps showing the last screen when a data source has gone quiet", () => {
    const result = walk(nodes, 10, nowhere, context(undefined, {}), 900);

    expect(result.leaf?.label).toBe("Home");
    expect(result.steps[0].answer).toBe(false);
    expect(result.steps[0].actual).toBe("no value yet");
  });

  it("refuses to loop forever on a hand-edited cycle", () => {
    const cyclic: Node[] = [
      { id: 1, kind: "question", label: "a", condition: { kind: "always" }, yesNodeId: 2, noNodeId: 2, screenId: null, refreshSeconds: null, holdSeconds: 0 },
      { id: 2, kind: "question", label: "b", condition: { kind: "always" }, yesNodeId: 1, noNodeId: 1, screenId: null, refreshSeconds: null, holdSeconds: 0 },
    ];

    const result = walk(cyclic, 1, nowhere, context(0, {}), 900);

    expect(result.leaf).toBeUndefined();
    expect(result.refreshSeconds).toBe(900);
  });
});
