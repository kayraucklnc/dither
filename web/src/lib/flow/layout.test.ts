import { describe, expect, it } from "vitest";

import { layout, NODE_WIDTH, COLUMN_GAP } from "./layout";
import type { Node } from "./tree";

const question = (id: number, yes: number, no: number): Node => ({
  id, kind: "question", label: `q${id}`,
  condition: { kind: "fact", sourceId: "clock", factKey: "time_of_day", operator: "after", value: "08:00" },
  yesNodeId: yes, noNodeId: no, screenId: null, refreshSeconds: null, holdSeconds: 0,
});

const leaf = (id: number): Node => ({
  id, kind: "screen", label: `s${id}`, condition: null,
  yesNodeId: null, noNodeId: null, screenId: id, refreshSeconds: null, holdSeconds: 0,
});

/*
 *  q1 --yes--> s10
 *   |no
 *  q2 --yes--> s20
 *   |no
 *  s30
 */
const nodes = [question(1, 10, 2), leaf(10), question(2, 20, 30), leaf(20), leaf(30)];

describe("laying out the tree", () => {
  const at = layout(nodes, 1);

  it("puts depth on the x axis, so checks march right", () => {
    expect(at.get(1)!.x).toBe(0);
    expect(at.get(10)!.x).toBe(NODE_WIDTH + COLUMN_GAP);
    expect(at.get(2)!.x).toBe(NODE_WIDTH + COLUMN_GAP);
    expect(at.get(30)!.x).toBe((NODE_WIDTH + COLUMN_GAP) * 2);
  });

  it("keeps every yes branch above its no branch, which is the priority order", () => {
    expect(at.get(10)!.y).toBeLessThan(at.get(2)!.y);
    expect(at.get(20)!.y).toBeLessThan(at.get(30)!.y);
  });

  it("centres a check between its two branches", () => {
    const middle = (at.get(20)!.y + at.get(30)!.y) / 2;
    expect(Math.abs(at.get(2)!.y - middle)).toBeLessThan(60);
  });

  it("gives every node a position, including one nothing points at", () => {
    const orphan = [...nodes, leaf(99)];
    expect(layout(orphan, 1).has(99)).toBe(true);
  });

  it("terminates on a cycle rather than recursing forever", () => {
    const cyclic = [question(1, 2, 2), question(2, 1, 1)];
    expect(() => layout(cyclic, 1)).not.toThrow();
  });
});
