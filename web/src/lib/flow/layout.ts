import type { Node } from "./tree";

/**
 * Where each node sits on the canvas.
 *
 * A decision tree has one obvious shape - questions marching right, branches
 * fanning down - so it is laid out for you. Hand-positioning a tree is busywork
 * that goes stale the moment a node is inserted, and a messy tree is exactly
 * what makes a rule set hard to read.
 */
export const NODE_WIDTH = 260;
export const COLUMN_GAP = 120;
export const ROW_GAP = 28;
export const QUESTION_HEIGHT = 96;
export const SCREEN_HEIGHT = 210;

export function layout(nodes: Node[], rootId: number | null): Map<number, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const positions = new Map<number, { x: number; y: number }>();
  const seen = new Set<number>();

  // The "yes" branch is drawn above the "no" branch, so reading top to bottom
  // is reading most specific to most general - the order they are asked in.
  let cursor = 0;

  const place = (id: number | null, depth: number): void => {
    if (id === null || seen.has(id)) return;

    const node = byId.get(id);
    if (!node) return;

    seen.add(id);

    if (node.kind === "screen") {
      positions.set(id, { x: depth * (NODE_WIDTH + COLUMN_GAP), y: cursor });
      cursor += SCREEN_HEIGHT + ROW_GAP;
      return;
    }

    const top = cursor;
    place(node.yesNodeId, depth + 1);
    const afterYes = cursor;
    place(node.noNodeId, depth + 1);

    // Centre a question against the branches hanging off it.
    const bottom = cursor === afterYes ? afterYes : cursor;
    positions.set(id, {
      x: depth * (NODE_WIDTH + COLUMN_GAP),
      y: top + (bottom - top - QUESTION_HEIGHT) / 2,
    });
  };

  place(rootId, 0);

  // Anything unreachable is parked below, visible rather than lost.
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: 0, y: cursor });
      cursor += SCREEN_HEIGHT + ROW_GAP;
    }
  }

  return positions;
}
