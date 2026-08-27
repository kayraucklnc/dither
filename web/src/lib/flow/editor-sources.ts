import { eq } from "drizzle-orm";

import type { EditorSource, SourceKind } from "@/components/flow/condition-editor";
import { db } from "@/lib/db";
import { decisionNodes, notices, triggers, type Device } from "@/lib/db/schema";
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
  const rows = await db.select().from(triggers).where(eq(triggers.deviceId, device.id));
  const byId = new Map(rows.map((row) => [String(row.id), row]));

  // How many checks and notices read from each source, so removing one is an
  // informed choice rather than a surprise on a wall.
  const uses = new Map<string, number>();

  const count = (condition: unknown) => {
    if (!condition || typeof condition !== "object") return;

    const node = condition as { kind?: string; sourceId?: string; conditions?: unknown[] };
    if (node.kind === "fact" && node.sourceId) {
      uses.set(node.sourceId, (uses.get(node.sourceId) ?? 0) + 1);
    }
    node.conditions?.forEach(count);
  };

  for (const node of await db.select().from(decisionNodes).where(eq(decisionNodes.deviceId, device.id))) {
    count(node.condition);
  }
  for (const notice of await db.select().from(notices).where(eq(notices.deviceId, device.id))) {
    count(notice.condition);
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
      settings: trigger?.settings,
      error: source.error,
      usedBy: uses.get(source.id) ?? 0,
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
