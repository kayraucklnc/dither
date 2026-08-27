/**
 * When two configurations are the same question.
 *
 * A widget draws and a source decides, but "the Cadorna board, five
 * departures" is one question however many things ask it - so this is what
 * tells "watch this too" that it has already been watched, and what stops the
 * same source being filed twice.
 *
 * Compared as sorted keys, never as JSON in whatever order the two sides
 * happen to hold it. Settings make a round trip through Postgres jsonb, which
 * hands an object's keys back in *its* order - shortest first, then bytewise -
 * so a stored question and the one a browser is holding are hardly ever the
 * same string even when they are the same question. Comparing them that way is
 * what let "Also watch this" file another row on every click and never notice
 * it had already done it.
 *
 * Only the top level is sorted, because that is the whole of a settings
 * object: values are strings, numbers, booleans, or a multiselect's list -
 * and a list is sorted before it is stored, because its order is not meant to
 * be a difference either.
 */
export function canonicalSettings(settings: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(settings ?? {}).sort(([a], [b]) => a.localeCompare(b))),
  );
}

/** Whether these two are asking the world for the same thing. */
export function sameQuestion(
  one: { extension: string; settings: Record<string, unknown> | null | undefined },
  other: { extension: string; settings: Record<string, unknown> | null | undefined },
): boolean {
  return (
    one.extension === other.extension &&
    canonicalSettings(one.settings) === canonicalSettings(other.settings)
  );
}
