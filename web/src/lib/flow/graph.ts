import type { Node } from "./tree";

/**
 * Editing rules for the canvas.
 *
 * The walk is a tree, but the editor is a graph: nodes can be dropped
 * unattached and wired up afterwards, which is what makes it an editor rather
 * than an outline. These are the two things that keeps honest - what the walk
 * can reach, and which connections would make it loop.
 *
 * The evaluator has a ceiling so a cycle cannot hang a device, but a rule set
 * that silently never reaches a screen is not something to find out about on a
 * wall. Refusing the connection is cheaper than explaining it later.
 */
type Linked = Pick<Node, "id" | "yesNodeId" | "noNodeId">;

export function reachableFrom(nodes: Linked[], rootId: number | null): Set<number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<number>();

  const visit = (id: number | null) => {
    if (id === null || seen.has(id)) return;
    seen.add(id);

    const node = byId.get(id);
    visit(node?.yesNodeId ?? null);
    visit(node?.noNodeId ?? null);
  };

  visit(rootId);
  return seen;
}

/** Whether pointing `from` at `to` would make the walk loop. */
export function wouldCycle(nodes: Linked[], from: number, to: number): boolean {
  if (from === to) return true;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<number>();

  const reaches = (id: number | null): boolean => {
    if (id === null || seen.has(id)) return false;
    if (id === from) return true;
    seen.add(id);

    const node = byId.get(id);
    return reaches(node?.yesNodeId ?? null) || reaches(node?.noNodeId ?? null);
  };

  return reaches(to);
}
