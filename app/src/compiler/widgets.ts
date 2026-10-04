// Small lookups shared by the compiler and the editor.

import type { Env, Extension } from "@/extensions/api";
import { EXTENSIONS } from "@/extensions";
import type { Project, Widget } from "@/project/schema";

export function envOf(project: Project): Env {
  return { units: project.units, place: project.place, language: project.language, timezone: project.timezone, accounts: project.accounts };
}

export function extensionFor(type: string): Extension | undefined {
  return EXTENSIONS.find((e) => e.id === type) as Extension | undefined;
}

/** A widget's settings with its extension's defaults filled in. */
export function settingsOf(w: Widget, env: Env): Record<string, unknown> {
  const ext = extensionFor(w.type);
  return ext ? { ...ext.defaults(env), ...w.settings } : w.settings;
}

export function widgetTitle(w: Widget, env: Env): string {
  const ext = extensionFor(w.type);
  if (!ext) return "Unknown widget";
  return ext.title?.(settingsOf(w, env), env) ?? ext.name;
}

/** The accounts a widget type needs that this project has not linked. */
export function missingAccounts(type: string, env: Env): string[] {
  return (extensionFor(type)?.requires ?? []).filter((k) => {
    const a = env.accounts[k];
    return Array.isArray(a) ? a.length === 0 : !a;
  });
}
