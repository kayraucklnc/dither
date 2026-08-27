import { describe, expect, it } from "vitest";

import { reachableFrom, wouldCycle } from "./graph";

const node = (id: number, yes: number | null = null, no: number | null = null) => ({
  id,
  yesNodeId: yes,
  noNodeId: no,
});

/*
 *  1 --yes--> 2
 *   |no
 *   3 --yes--> 4
 *      |no
 *      5
 *  9 is on the canvas with nothing pointing at it.
 */
const nodes = [node(1, 2, 3), node(2), node(3, 4, 5), node(4), node(5), node(9)];

describe("what the walk can reach", () => {
  it("follows both branches", () => {
    expect([...reachableFrom(nodes, 1)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("leaves a node nothing points at out", () => {
    expect(reachableFrom(nodes, 1).has(9)).toBe(false);
  });

  it("reaches nothing without a root", () => {
    expect(reachableFrom(nodes, null).size).toBe(0);
  });

  it("terminates on a cycle rather than recursing forever", () => {
    expect(() => reachableFrom([node(1, 2), node(2, 1)], 1)).not.toThrow();
  });
});

describe("connections that would loop", () => {
  it("refuses a node pointing at itself", () => {
    expect(wouldCycle(nodes, 3, 3)).toBe(true);
  });

  it("refuses a branch that leads back to where it starts", () => {
    // 1 leads to 3, so pointing 3 back at 1 closes the loop.
    expect(wouldCycle(nodes, 3, 1)).toBe(true);
    // 3 already leads to 5, so pointing 5 at 3 closes a shorter one.
    expect(wouldCycle(nodes, 5, 3)).toBe(true);
    // 2 is a leaf on the other branch; hanging it under 3 loops nothing.
    expect(wouldCycle(nodes, 2, 3)).toBe(false);
  });

  it("refuses a longer way round", () => {
    // 4 hangs off 3 which hangs off 1: pointing 4 at 1 loops through both.
    expect(wouldCycle(nodes, 4, 1)).toBe(true);
  });

  it("allows a node to be pointed at from two places", () => {
    // Both branches of 3 reaching 2 is a diamond, not a loop.
    expect(wouldCycle(nodes, 3, 2)).toBe(false);
  });

  it("allows wiring up a loose node", () => {
    expect(wouldCycle(nodes, 5, 9)).toBe(false);
    expect(wouldCycle(nodes, 9, 1)).toBe(false);
  });
});
