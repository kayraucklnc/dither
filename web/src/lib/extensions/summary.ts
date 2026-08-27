import { requiredBy } from "@/lib/connections";
import { all, type Extension } from "@/lib/extensions/registry";
import type { ShapeId } from "@/lib/shapes";

/** What a page needs to know about an extension, without its templates. */
export interface ExtensionSummary {
  name: string;
  label: string;
  description: string;
  kind: "static" | "poll" | "transit" | "connection";
  interval: number;
  unit: string;
  shapes: ShapeId[];
  /** The largest shape it can draw, which is what a card shows. */
  headline: ShapeId;
  settingCount: number;
  factCount: number;
  connection?: { id: string; label: string; mocked: boolean };
  problems: string[];
}

const AREA: Record<string, number> = {
  full: 36, two_thirds_height: 24, half_width: 18, half_height: 18,
  two_thirds_width: 24, quarter: 9, third_height: 12, third_width: 12,
};

export function summarise(extension: Extension): ExtensionSummary {
  const connection = requiredBy(extension.manifest);

  return {
    name: extension.name,
    label: extension.manifest.label,
    description: extension.manifest.description.trim(),
    kind: extension.manifest.kind,
    interval: extension.manifest.interval,
    unit: extension.manifest.unit,
    shapes: extension.shapes,
    // Cards show the biggest design, because a quarter shrunk into a card is
    // unreadable and tells you nothing about the extension.
    headline: [...extension.shapes].sort((a, b) => (AREA[b] ?? 0) - (AREA[a] ?? 0))[0],
    settingCount: extension.manifest.fields.length,
    factCount: extension.manifest.facts.length,
    connection: connection
      ? { id: connection.id, label: connection.label, mocked: connection.mocked }
      : undefined,
    problems: extension.problems,
  };
}

export async function allSummaries(): Promise<ExtensionSummary[]> {
  return (await all()).map(summarise);
}
