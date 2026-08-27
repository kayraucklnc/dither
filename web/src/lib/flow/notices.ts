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
  level: "info" | "warn" | "urgent";
  /** "screen" for the alert area, "source" to prefer its own extension's widget. */
  placement: string;
  /** The extension the condition reads from, for placement: source. */
  fromExtension?: string;
}

export async function activeNotices(
  rules: Notice[],
  context: Context,
  /** Source id to the extension behind it, so a notice knows what it is about. */
  sourceExtensions: Record<string, string> = {},
  /**
   * Ids to show regardless of their condition, and ids to suppress.
   *
   * Judging the wording of an alert that fires twice a year should not require
   * engineering the weather. Kept as an explicit argument rather than a
   * condition that always holds, because "always" is not actually expressible
   * in a vocabulary where every check compares a real value.
   */
  forced: Record<number, "on" | "off"> = {},
): Promise<ActiveNotice[]> {
  const active: ActiveNotice[] = [];

  for (const rule of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (forced[rule.id] === "off") continue;

    const condition = rule.condition as unknown as Condition;
    const on = forced[rule.id] === "on" || (rule.enabled && evaluate(condition, context).holds);

    if (!on) continue;

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

    active.push({
      id: rule.id,
      icon: rule.icon,
      text: text.trim(),
      level: (rule.level as ActiveNotice["level"]) ?? "warn",
      placement: rule.placement,
      fromExtension: sourceId ? sourceExtensions[sourceId] : undefined,
    });
  }

  return active;
}


/**
 * Where a notice would land, screen by screen.
 *
 * "Enable this and something appears" is not an answer to "appears where?".
 * A notice renders into the first widget, in reading order, whose design has
 * somewhere to put one - so a screen made entirely of designs that ignore
 * notices shows nothing, and that is worth saying out loud rather than leaving
 * to be discovered on a wall.
 */
export interface NoticeHost {
  screenId: number;
  screenName: string;
  /** The widget that would show it, or null when nothing on this screen can. */
  widgetLabel: string | null;
  extensionLabel: string | null;
  /** True when this is the screen the device is showing right now. */
  showing: boolean;
}

export async function noticeHosts(
  deviceId: number,
  showingScreenId: number | null,
): Promise<NoticeHost[]> {
  const { db } = await import("@/lib/db");
  const { decisionNodes, screens, widgets } = await import("@/lib/db/schema");
  const { find } = await import("@/lib/extensions/registry");
  const { rendersNotices } = await import("@/lib/extensions/registry");
  const { sizeOf } = await import("@/lib/shapes");
  const { eq, inArray } = await import("drizzle-orm");

  const nodes = await db.select().from(decisionNodes).where(eq(decisionNodes.deviceId, deviceId));
  const screenIds = [...new Set(nodes.map((node) => node.screenId).filter((id): id is number => id !== null))];

  if (!screenIds.length) return [];

  const rows = await db.select().from(screens).where(inArray(screens.id, screenIds));
  const placed = await db.select().from(widgets).where(inArray(widgets.screenId, screenIds));

  const hosts: NoticeHost[] = [];

  for (const screen of rows) {
    const ordered = placed
      .filter((widget) => widget.screenId === screen.id)
      .sort((a, b) => a.row - b.row || a.column - b.column);

    let host: { widgetLabel: string; extensionLabel: string } | undefined;

    for (const widget of ordered) {
      const extension = await find(widget.extension);
      if (!extension || !rendersNotices(extension, sizeOf(widget), widget.design)) continue;

      host = {
        widgetLabel: widget.label || extension.manifest.label,
        extensionLabel: extension.manifest.label,
      };
      break;
    }

    hosts.push({
      screenId: screen.id,
      screenName: screen.name,
      widgetLabel: host?.widgetLabel ?? null,
      extensionLabel: host?.extensionLabel ?? null,
      showing: screen.id === showingScreenId,
    });
  }

  return hosts.sort((a, b) => Number(b.showing) - Number(a.showing) || a.screenName.localeCompare(b.screenName));
}
