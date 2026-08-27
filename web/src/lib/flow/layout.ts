import type { Node } from "./tree";

/**
 * Where each node sits on the canvas.
 *
 * A decision tree has one obvious shape - checks marching right, branches
 * fanning out - so it is laid out for you. Hand-positioning a tree is busywork
 * that goes stale the moment a check is inserted, and a messy tree is exactly
 * what makes a rule set hard to read.
 *
 * The rule is the classic one for tidy trees: leaves get consecutive slots in
 * the order they are reached, and a check sits at the midpoint of its two
 * branches. That keeps the "yes" branch visibly above the "no" branch all the
 * way down, which is what makes the tree readable as a priority order.
 */
export const NODE_WIDTH = 264;
export const COLUMN_GAP = 150;
export const QUESTION_HEIGHT = 104;
export const SCREEN_HEIGHT = 214;
export const ROW_GAP = 36;

export function layout(nodes: Node[], rootId: number | null): Map<number, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const positions = new Map<number, { x: number; y: number }>();
  const seen = new Set<number>();

  let cursor = 0;

  /** Returns the vertical centre of whatever was placed, so a parent can align to it. */
  const place = (id: number | null, depth: number): number | undefined => {
    if (id === null) return undefined;

    const node = byId.get(id);
    // A node reached twice keeps its first position; a cycle stops here.
    if (!node || seen.has(id)) return positions.get(id) && positions.get(id)!.y;

    seen.add(id);
    const x = depth * (NODE_WIDTH + COLUMN_GAP);

    if (node.kind === "screen") {
      positions.set(id, { x, y: cursor });
      const centre = cursor + SCREEN_HEIGHT / 2;
      cursor += SCREEN_HEIGHT + ROW_GAP;
      return centre;
    }

    const yes = place(node.yesNodeId, depth + 1);
    const no = place(node.noNodeId, depth + 1);

    const centres = [yes, no].filter((value): value is number => value !== undefined);
    const centre = centres.length
      ? centres.reduce((total, value) => total + value, 0) / centres.length
      : cursor + QUESTION_HEIGHT / 2;

    positions.set(id, { x, y: centre - QUESTION_HEIGHT / 2 });

    // A check with no branches at all still needs a slot of its own.
    if (!centres.length) cursor += QUESTION_HEIGHT + ROW_GAP;

    return centre;
  };

  place(rootId, 0);

  // Anything unreachable is parked below, visible rather than lost.
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: 0, y: cursor });
      cursor += (node.kind === "screen" ? SCREEN_HEIGHT : QUESTION_HEIGHT) + ROW_GAP;
    }
  }

  return positions;
}
