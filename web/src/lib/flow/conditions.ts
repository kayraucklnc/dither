import { z } from "zod";

import { compare, describe, readFact, showFact } from "@/lib/facts";
import type { Source } from "./sources";

/**
 * What makes a check answer yes.
 *
 * Most checks are one comparison. When one is not enough, `all` and `any`
 * group several - which is the difference between "add a second check further
 * down the tree" (a different screen for each combination) and "this one screen
 * needs two things to be true at once".
 *
 * Groups nest, but the editor keeps them shallow on purpose: a rule you cannot
 * read back as a sentence is a rule you cannot debug at 7am.
 */

export type LeafCondition = {
  kind: "fact";
  /** "device", "clock", or a trigger's id as a string. */
  sourceId: string;
  factKey: string;
  operator: string;
  value?: unknown;
};

export type Condition =
  | LeafCondition
  | { kind: "all"; conditions: Condition[] }
  | { kind: "any"; conditions: Condition[] };

export type ConditionKind = Condition["kind"];

const leafSchema = z.object({
  kind: z.literal("fact"),
  sourceId: z.string(),
  factKey: z.string(),
  operator: z.string(),
  value: z.unknown().optional(),
});

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    leafSchema,
    z.object({ kind: z.literal("all"), conditions: z.array(conditionSchema) }),
    z.object({ kind: z.literal("any"), conditions: z.array(conditionSchema) }),
  ]),
) as z.ZodType<Condition>;

export const isGroup = (
  condition: Condition,
): condition is { kind: "all" | "any"; conditions: Condition[] } =>
  condition.kind === "all" || condition.kind === "any";

/** Everything a check may need to answer, gathered once per evaluation. */
export interface Context {
  now: Date;
  /** Every source this device can ask about, by id. */
  sources: Map<string, Source>;
}

/** One evaluation, kept so the canvas can show why a check did or did not fire. */
export interface Trace {
  holds: boolean;
  sentence: string;
  /** The value the check actually saw, rendered for a human. */
  actual?: string;
  /** Present for groups: how each member answered. */
  children?: Trace[];
}

export function evaluate(condition: Condition, context: Context): Trace {
  if (isGroup(condition)) {
    const children = condition.conditions.map((member) => evaluate(member, context));

    // An empty "all" holds and an empty "any" does not, the same way the words
    // work and the same way an empty AND/OR behaves in code.
    const holds =
      condition.kind === "all"
        ? children.every((child) => child.holds)
        : children.some((child) => child.holds);

    const joiner = condition.kind === "all" ? " and " : " or ";

    return {
      holds,
      sentence: children.length
        ? children.map((child) => child.sentence).join(joiner)
        : "nothing to check",
      children,
    };
  }

  const source = context.sources.get(condition.sourceId);
  if (!source) return { holds: false, sentence: "a source that no longer exists" };

  const fact = source.facts.find((candidate) => candidate.key === condition.factKey);
  if (!fact) {
    return { holds: false, sentence: `${source.label}: unknown value "${condition.factKey}"` };
  }

  // Read against `context.now`, never straight out of the payload: a countdown
  // in a fetched row stopped counting when it was fetched. See lib/facts.
  const actual = readFact(fact, source.payload, context.now);

  return {
    holds: compare(actual, condition.operator, condition.value),
    sentence: `${source.label}: ${describe(fact, condition.operator, condition.value)}`,
    actual:
      actual === null || actual === undefined
        ? "no value yet"
        : `${showFact(fact, actual)}${fact.unit ? ` ${fact.unit}` : ""}`,
  };
}

/** The one-line form shown on a node in the canvas. */
export function summarise(condition: Condition, context?: Pick<Context, "sources">): string {
  if (isGroup(condition)) {
    if (!condition.conditions.length) return "Nothing to check";

    const joiner = condition.kind === "all" ? " and " : " or ";

    return condition.conditions
      .map((member) => {
        const text = summarise(member, context);
        // Parenthesise a nested group so "a and (b or c)" cannot be misread.
        return isGroup(member) ? `(${text})` : text;
      })
      .join(joiner);
  }

  const source = context?.sources.get(condition.sourceId);
  const fact = source?.facts.find((candidate) => candidate.key === condition.factKey);

  if (!fact || !source) return "A value that is no longer available";
  return `${source.label}: ${describe(fact, condition.operator, condition.value)}`;
}
