import { requiredBy } from "@/lib/connections";
import {
  all,
  headlineSize,
  presetsFor,
  rendersNotices,
  type Extension,
} from "@/lib/extensions/registry";
import { PRESETS, type Size } from "@/lib/shapes";

/** What a page needs to know about an extension, without its templates. */
export interface ExtensionSummary {
  name: string;
  label: string;
  description: string;
  kind: "static" | "poll" | "transit" | "connection";
  interval: number;
  unit: string;
  /** The named sizes it can be drawn at. Only ever for counting and pickers. */
  presets: string[];
  /** How many looks it offers, which is the number worth showing on a card. */
  designCount: number;
  /** The largest size it can draw, which is what a card shows. */
  headline: Size;
  settingCount: number;
  factCount: number;
  /** How many of its named sizes have somewhere to show another extension's alert. */
  noticeShapes: number;
  connection?: { id: string; label: string; mocked: boolean };
  problems: string[];
}

export function summarise(extension: Extension): ExtensionSummary {
  const connection = requiredBy(extension.manifest);

  return {
    name: extension.name,
    label: extension.manifest.label,
    description: extension.manifest.description.trim(),
    kind: extension.manifest.kind,
    interval: extension.manifest.interval,
    unit: extension.manifest.unit,
    presets: presetsFor(extension),
    designCount: extension.designs.length,
    // Cards show the biggest design, because a corner design shrunk into a card
    // is unreadable and tells you nothing about the extension.
    headline: headlineSize(extension),
    settingCount: extension.manifest.fields.length,
    factCount: extension.manifest.facts.length,
    noticeShapes: PRESETS.filter(
      (size) => presetsFor(extension).includes(size.id) && rendersNotices(extension, size),
    ).length,
    connection: connection
      ? { id: connection.id, label: connection.label, mocked: connection.mocked }
      : undefined,
    problems: extension.problems,
  };
}

export async function allSummaries(): Promise<ExtensionSummary[]> {
  return (await all()).map(summarise);
}
