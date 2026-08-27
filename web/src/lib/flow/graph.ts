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

type Removable = Linked & Pick<Node, "kind">;

/**
 * Take nodes out of the editor's graph.
 *
 * A check is *spliced*: its "no" branch takes its place, and its "yes" branch
 * goes with it, because a question's yes side only exists to answer that
 * question. A screen is simply unhooked. Either way nothing is left pointing at
 * an id that is gone.
 *
 * It works on a list rather than on state so that every route to a deletion -
 * the menu, the button, the Backspace key - removes the same things. React Flow
 * deleting a node from its own copy of the canvas is not a deletion at all: the
 * next refresh derives it straight back.
 */
export function removeNodes<T extends Removable>(
  nodes: T[],
  rootId: number | null,
  ids: number[],
): { nodes: T[]; rootId: number | null } {
  let list = nodes;
  let root = rootId;

  for (const id of ids) {
    const going = list.find((node) => node.id === id);
    if (!going) continue;

    const survivor = going.kind === "question" ? going.noNodeId : null;

    const doomed = new Set<number>([id]);
    const collect = (from: number | null) => {
      if (from === null || doomed.has(from) || from === survivor) return;
      doomed.add(from);
      const node = list.find((candidate) => candidate.id === from);
      collect(node?.yesNodeId ?? null);
      collect(node?.noNodeId ?? null);
    };
    if (going.kind === "question") collect(going.yesNodeId);

    const relink = (target: number | null) =>
      target === null || !doomed.has(target) ? target : target === id ? survivor : null;

    list = list
      .filter((node) => !doomed.has(node.id))
      .map((node) => ({ ...node, yesNodeId: relink(node.yesNodeId), noNodeId: relink(node.noNodeId) }));

    root = relink(root);
  }

  return { nodes: list, rootId: root };
}
