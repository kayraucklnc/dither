import { Liquid } from "liquidjs";

import type { Notice } from "@/lib/db/schema";
import { evaluate, type Condition, type Context } from "@/lib/flow/conditions";

/**
 * Working out what to say on top of whatever screen is showing.
 *
 * Notices are additive, which is the point: the tree decides *which* screen,
 * and a notice appears on it regardless. A service alert should be readable
 * while you are looking at your calendar without the calendar knowing anything
 * about trains, and without a branch in the tree for every pairing.
 *
 * They land in one place per screen - the first widget whose extension says it
 * has somewhere to put them - so three widgets that all accept notices do not
 * show the same warning three times.
 */

const engine = new Liquid({ strictVariables: false, strictFilters: false });

export interface ActiveNotice {
  id: number;
  icon: string;
  text: string;
  loud: boolean;
}

export async function activeNotices(
  rules: Notice[],
  context: Context,
): Promise<ActiveNotice[]> {
  const active: ActiveNotice[] = [];

  for (const rule of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (!rule.enabled) continue;

    const condition = rule.condition as unknown as Condition;
    if (!evaluate(condition, context).holds) continue;

    // The text may quote the value that triggered it, so it renders against
    // the payload of whatever source the condition reads from.
    const sourceId = condition.kind === "fact" ? condition.sourceId : undefined;
    const payload = sourceId ? context.sources.get(sourceId)?.payload : undefined;

    let text = rule.text;
    if (text.includes("{{") || text.includes("{%")) {
      try {
        text = await engine.parseAndRender(text, (payload as object) ?? {});
      } catch {
        // A broken notice template should not take the screen down with it.
        text = rule.label || "Alert";
      }
    }

    active.push({ id: rule.id, icon: rule.icon, text: text.trim(), loud: rule.loud });
  }

  return active;
}
