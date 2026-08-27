import { eq } from "drizzle-orm";

import type { EditorSource, SourceKind } from "@/components/flow/condition-editor";
import { db } from "@/lib/db";
import { decisionNodes, devices, notices, triggers, type Device } from "@/lib/db/schema";
import { all, find } from "@/lib/extensions/registry";
import { valueAt } from "@/lib/facts";
import { sourcesFor } from "@/lib/flow/context";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The sources as the check editor needs them: facts, what each currently reads,
 * and - for triggers - the settings form so a station or a city can be changed
 * without leaving the check you are building.
 */
export async function editorSources(device: Device, now = new Date()): Promise<EditorSource[]> {
  const sources = await sourcesFor(device, now);
  const rows = await db.select().from(triggers);
  const byId = new Map(rows.map((row) => [String(row.id), row]));

  /*
   * How many checks and notices read from each source, across every device -
   * they are shared now, so deleting one can quietly break a panel in another
   * room. The count is what makes that an informed choice.
   */
  const uses = new Map<string, number>();
  const usedOn = new Map<string, Set<string>>();

  const count = (condition: unknown, on: string) => {
    if (!condition || typeof condition !== "object") return;

    const node = condition as { kind?: string; sourceId?: string; conditions?: unknown[] };
    if (node.kind === "fact" && node.sourceId) {
      uses.set(node.sourceId, (uses.get(node.sourceId) ?? 0) + 1);
      usedOn.set(node.sourceId, (usedOn.get(node.sourceId) ?? new Set()).add(on));
    }
    node.conditions?.forEach((child) => count(child, on));
  };

  const panels = new Map((await db.select().from(devices)).map((row) => [row.id, row.name]));

  for (const node of await db.select().from(decisionNodes)) {
    count(node.condition, panels.get(node.deviceId) ?? "a device");
  }
  for (const notice of await db.select().from(notices)) {
    count(notice.condition, panels.get(notice.deviceId) ?? "a device");
  }

  const result: EditorSource[] = [];

  for (const source of sources) {
    const trigger = byId.get(source.id);
    const extension = trigger ? await find(trigger.extension) : undefined;

    const values: Record<string, string> = {};
    for (const fact of source.facts) {
      const raw = valueAt(source.payload, fact.path);

      values[fact.key] =
        raw === null || raw === undefined
          ? "—"
          : fact.type === "boolean"
            ? raw
              ? "yes"
              : "no"
            : fact.type === "weekday"
              ? (DAYS[Number(raw)] ?? String(raw))
              : String(raw);
    }

    result.push({
      id: source.id,
      label: source.label,
      group: source.group,
      extension: source.extension,
      extensionLabel: extension?.manifest.label,
      facts: source.facts,
      values,
      fields: extension?.manifest.fields,
      capabilitiesFrom: extension?.manifest.capabilities_from,
      settings: trigger?.settings,
      error: source.error,
      usedBy: uses.get(source.id) ?? 0,
      usedOn: [...(usedOn.get(source.id) ?? [])],
    });
  }

  return result;
}

/** Extensions that report something worth deciding on, offered as new sources. */
export async function sourceKinds(): Promise<SourceKind[]> {
  return (await all())
    .filter((extension) => extension.manifest.facts.length > 0)
    .map((extension) => ({
      extension: extension.name,
      label: extension.manifest.label,
      description: `${extension.manifest.facts.length} value${extension.manifest.facts.length === 1 ? "" : "s"} to decide on`,
    }));
}
