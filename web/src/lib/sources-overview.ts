import { db } from "@/lib/db";
import { decisionNodes, devices, notices, triggers } from "@/lib/db/schema";
import { all, find } from "@/lib/extensions/registry";
import { valueAt, type Fact } from "@/lib/facts";
import type { Field } from "@/lib/extensions/manifest";
import { FRESHNESS_FACT } from "@/lib/flow/sources";

/**
 * Every source, with what it currently reads and who leans on it.
 *
 * Sources are shared, so "what breaks if I delete this" spans devices. Saying
 * so is the whole reason this page exists.
 */
export interface SourceOverview {
  id: string;
  label: string;
  extension: string;
  extensionLabel: string;
  settings: Record<string, unknown>;
  fields: Field[];
  capabilitiesFrom?: string;
  facts: Fact[];
  values: Record<string, string>;
  fetchedAt: string | null;
  error?: string;
  usedBy: number;
  usedOn: string[];
}

export interface SourceKindOption {
  extension: string;
  label: string;
  description: string;
  factCount: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function sourcesOverview(): Promise<SourceOverview[]> {
  const rows = await db.select().from(triggers);
  const panels = new Map((await db.select().from(devices)).map((row) => [row.id, row.name]));

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

  for (const node of await db.select().from(decisionNodes)) {
    count(node.condition, panels.get(node.deviceId) ?? "a device");
  }
  for (const notice of await db.select().from(notices)) {
    count(notice.condition, panels.get(notice.deviceId) ?? "a device");
  }

  const now = Date.now();
  const overview: SourceOverview[] = [];

  for (const row of rows) {
    const extension = await find(row.extension);
    const age = row.fetchedAt ? Math.floor((now - row.fetchedAt.getTime()) / 60_000) : null;

    const facts = [...(extension?.manifest.facts ?? []), FRESHNESS_FACT];
    const payload = { ...row.payload, _dither: { minutes_since_update: age } };
    const values: Record<string, string> = {};

    for (const fact of facts) {
      const raw = valueAt(payload, fact.path);

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

    overview.push({
      id: String(row.id),
      label: row.label || extension?.manifest.label || row.extension,
      extension: row.extension,
      extensionLabel: extension?.manifest.label ?? row.extension,
      settings: row.settings,
      fields: extension?.manifest.fields ?? [],
      capabilitiesFrom: extension?.manifest.capabilities_from,
      facts,
      values,
      fetchedAt: row.fetchedAt ? row.fetchedAt.toISOString() : null,
      error: row.error ?? undefined,
      usedBy: uses.get(String(row.id)) ?? 0,
      usedOn: [...(usedOn.get(String(row.id)) ?? [])],
    });
  }

  return overview.sort((a, b) => a.label.localeCompare(b.label));
}

/** Extensions that report something worth deciding on. */
export async function sourceKinds(): Promise<SourceKindOption[]> {
  return (await all())
    .filter((extension) => extension.manifest.facts.length > 0)
    .map((extension) => ({
      extension: extension.name,
      label: extension.manifest.label,
      description: extension.manifest.description.trim(),
      factCount: extension.manifest.facts.length,
    }));
}
