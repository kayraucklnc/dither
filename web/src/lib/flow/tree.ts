import { evaluate, summarise, type Condition, type Context, type Trace } from "./conditions";

/**
 * Walking a device's decision tree.
 *
 * Start at the root and answer questions until you reach a screen. That screen
 * is what the panel shows. The walk is stateless: it reads the world as it is
 * right now and produces an answer, which is what makes "show the weather
 * whenever it rains, wherever you were" a single node near the top instead of
 * an edge out of every other screen.
 *
 * The one piece of memory is `holdSeconds` on a leaf. Without it a value
 * hovering at its threshold flips the display on every wake.
 */

export interface Node {
  id: number;
  kind: "question" | "screen";
  label: string;
  condition: Condition | null;
  yesNodeId: number | null;
  noNodeId: number | null;
  screenId: number | null;
  refreshSeconds: number | null;
  holdSeconds: number;
}

/** One question that was asked on the way down, and what it answered. */
export interface Step {
  nodeId: number;
  question: string;
  answer: boolean;
  /** The value the condition actually saw, for the trace. */
  actual?: string;
  /** Which branch was taken. */
  toNodeId: number | null;
}

export interface Walk {
  /** The leaf reached, or undefined when the tree is broken or empty. */
  leaf?: Node;
  steps: Step[];
  refreshSeconds: number;
  /** True when a hold kept the previous leaf despite the walk choosing another. */
  held: boolean;
  reason: string;
}

export interface Position {
  currentNodeId: number | null;
  nodeEnteredAt: Date | null;
}

const CEILING = 64;

function describeLeaf(leaf: Node | undefined, steps: Step[]): string {
  if (!leaf) return "The tree does not lead to a screen, so there is nothing to show.";

  const taken = steps.filter((step) => step.answer);

  if (!taken.length) {
    return steps.length
      ? `Showing ${leaf.label} because nothing else applied.`
      : `Showing ${leaf.label}.`;
  }

  const last = taken[taken.length - 1];
  return `Showing ${leaf.label} because ${last.question}${last.actual ? ` (${last.actual})` : ""}.`;
}

export function walk(
  nodes: Node[],
  rootId: number | null,
  position: Position,
  context: Context,
  defaultRefreshSeconds: number,
): Walk {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const steps: Step[] = [];

  let current = rootId === null ? undefined : byId.get(rootId);
  let guard = 0;

  // A cycle should be impossible - the editor only ever inserts above - but a
  // hand-edited row must not spin the device's request forever.
  while (current && current.kind === "question" && guard < CEILING) {
    guard += 1;

    const trace: Trace = current.condition
      ? evaluate(current.condition, context)
      : { holds: false, sentence: "no question set" };

    const next = trace.holds ? current.yesNodeId : current.noNodeId;

    steps.push({
      nodeId: current.id,
      question: current.condition ? summarise(current.condition, context) : "no question set",
      answer: trace.holds,
      actual: trace.actual,
      toNodeId: next,
    });

    current = next === null ? undefined : byId.get(next);
  }

  const leaf = current?.kind === "screen" ? current : undefined;

  // Honour a hold on the leaf we are already showing, even if the walk now
  // points somewhere else.
  const showing = position.currentNodeId === null ? undefined : byId.get(position.currentNodeId);

  if (
    showing?.kind === "screen" &&
    showing.holdSeconds > 0 &&
    position.nodeEnteredAt &&
    leaf?.id !== showing.id
  ) {
    const elapsed = (context.now.getTime() - position.nodeEnteredAt.getTime()) / 1000;
    const remaining = showing.holdSeconds - elapsed;

    if (remaining > 0) {
      return {
        leaf: showing,
        steps,
        refreshSeconds: showing.refreshSeconds ?? defaultRefreshSeconds,
        held: true,
        reason:
          `Still showing ${showing.label} for another ${Math.ceil(remaining)}s. ` +
          `Without the hold it would switch to ${leaf?.label ?? "nothing"}.`,
      };
    }
  }

  return {
    leaf,
    steps,
    refreshSeconds: leaf?.refreshSeconds ?? defaultRefreshSeconds,
    held: false,
    reason: describeLeaf(leaf, steps),
  };
}
