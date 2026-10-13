// Names for what the panel's log calls by id: "s0" → "Trains", screen 0 → "Home".
// They come from the project open in the editor, which is what was flashed
// unless the panel's blob CRC says otherwise.

import type { Compiled } from "@/compiler";
import { envOf, widgetTitle } from "@/compiler/widgets";
import type { Project } from "@/project/schema";

export interface ActivityNames {
  readonly sources: ReadonlyMap<string, string>;
  readonly screens: readonly string[];
}

/** Each source named after the widgets that use it; two sources with one name get a number. */
export function activityNames(project: Project, compiled: Compiled | null): ActivityNames {
  if (!compiled) return { sources: new Map(), screens: project.screens.map((s) => s.name) };
  const env = envOf(project);
  const widgets = new Map(project.screens.flatMap((s) => s.widgets).map((w) => [w.id, w]));
  const named = compiled.sources.map((s) => {
    const titles = [...new Set(s.widgetIds.map((id) => widgets.get(id)).filter((w) => w !== undefined).map((w) => widgetTitle(w, env)))];
    return [s.source.id, titles.length > 0 ? titles.join(" · ") : s.source.id] as const;
  });
  const seen = new Map<string, number>();
  const sources = new Map(
    named.map(([id, name]) => {
      const total = named.filter(([, n]) => n === name).length;
      const nth = (seen.get(name) ?? 0) + 1;
      seen.set(name, nth);
      return [id, total > 1 ? `${name} (${nth})` : name];
    }),
  );
  return { sources, screens: compiled.runtime.screens.map((s) => s.name) };
}
