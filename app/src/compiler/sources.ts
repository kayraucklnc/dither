// How a widget's own keys become runtime references. A widget may read from
// one source (keys like "temp") or several named ones ("work/t0"); anything
// with a dot ("clock.minutes") is already a full reference.

import type { SourceSpec } from "@/extensions/api";

/** A widget's sources: name → runtime source id. The unnamed one is "". */
export type SourceMap = Readonly<Record<string, string>>;

export function resolveKey(key: string, sources: SourceMap): string | null {
  if (key.includes(".")) return key;
  const slash = key.indexOf("/");
  const name = slash >= 0 ? key.slice(0, slash) : "";
  const id = sources[name];
  return id ? `${id}.${slash >= 0 ? key.slice(slash + 1) : key}` : null;
}

/** An extension's `source` result as named specs; a single spec is named "". */
export function namedSpecs(result: SourceSpec | Record<string, SourceSpec> | null | undefined): Record<string, SourceSpec> {
  if (!result) return {};
  if (typeof (result as SourceSpec).url === "string") return { "": result as SourceSpec };
  return result as Record<string, SourceSpec>;
}
