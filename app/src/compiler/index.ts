// Project → blob. The one place the editor's model becomes the runtime of
// docs/format.md; the simulator renders exactly what this returns.

import type { AssetLibrary } from "@/assets/library";
import type { Project } from "@/project/schema";
import type { Font } from "@/runtime/assets";
import { encodeBlob } from "@/runtime/blob";
import type { Element, Merge, Rule, Runtime, Screen, Source, SourceValue, Value } from "@/runtime/types";
import { AssetTable } from "./asset-table";
import { ElementDraw, type DrawDeps } from "./draw";
import { drawAlerts } from "./alerts";
import { namedSpecs, resolveKey, type SourceMap } from "./sources";
import { checkToCondition, factCatalog, minutesOf } from "./facts";
import { CELL, FRAME_PADDING, cellsToBox, rotated, type Panel } from "./grid";
import { localeFor } from "./locale";
import { fontCharsets, subsetFont } from "./subset";
import { posixTz } from "./timezone";
import { envOf, extensionFor, settingsOf } from "./widgets";

export interface CompileDeps {
  library: AssetLibrary;
  fonts: ReadonlyMap<string, Font>;
  picture: DrawDeps["picture"];
  /** gzip; injected so tests can skip it. */
  gzip?: (bytes: Uint8Array) => Promise<Uint8Array>;
  boardPanel: (board: string) => Panel;
  /** Trim fonts to the characters the screens can show. On unless a test says otherwise. */
  subsetFonts?: boolean;
}

export interface CompiledSource {
  source: Source;
  widgetIds: string[];
  /** Sample values by full reference, for the simulator before anything is fetched. */
  sample: Map<string, Value>;
}

export interface Compiled {
  blob: Uint8Array;
  runtime: Runtime;
  sources: CompiledSource[];
  /** Each widget's sources, by name ("" for a widget's only one). */
  widgetSources: Map<string, SourceMap>;
  /** For each runtime rule, the project rule it came from; null for the default. */
  ruleIds: (string | null)[];
  problems: { widgetId?: string; message: string }[];
}

const MIN_FETCH_MINUTES = 5;

function sourceKey(s: Pick<Source, "url" | "headers" | "every" | "auth" | "decode">): string {
  return JSON.stringify([s.url, s.headers ?? [], s.every, s.auth ?? null, s.decode ?? null]);
}

function buildSources(project: Project): { sources: CompiledSource[]; ids: Map<string, SourceMap> } {
  const env = envOf(project);
  const byKey = new Map<string, CompiledSource>();
  let next = 0;
  const ids = new Map<string, SourceMap>();
  for (const screen of project.screens) {
    for (const w of screen.widgets) {
      const ext = extensionFor(w.type);
      if (!ext) continue;
      const specs = Object.entries(namedSpecs(ext.source?.(settingsOf(w, env) as never, env)));
      if (specs.length === 0) continue;
      const map: Record<string, string> = {};
      for (const [name, spec] of specs) {
        const values: SourceValue[] = Object.entries(spec.values).map(([key, p]) =>
          typeof p === "string" ? { key, path: p }
          : !("agg" in p) ? { key, path: p.path, count: p.count }
          : p.agg === "buckets" ? { key, path: p.path, agg: p.agg, field: p.field, time: p.time, by: p.by, count: p.count }
          : { key, path: p.path, agg: p.agg, ...(p.field ? { field: p.field } : {}) });
        const base = {
          url: spec.url,
          every: Math.max(MIN_FETCH_MINUTES, spec.every) * 60,
          ...(spec.headers?.length ? { headers: spec.headers } : {}),
          ...(spec.auth ? { auth: spec.auth } : {}),
          ...(spec.decode ? { decode: spec.decode } : {}),
        };
        const key = sourceKey(base);
        let entry = byKey.get(key);
        const clash = entry && values.some((v) => entry!.source.values.some((e) => e.key === v.key && (e.path !== v.path || e.count !== v.count || e.agg !== v.agg || e.field !== v.field || e.time !== v.time || e.by !== v.by)));
        if (!entry || clash) {
          const id = `s${next++}`;
          entry = { source: { id, ...base, values: [] }, widgetIds: [], sample: new Map() };
          byKey.set(clash ? `${key}#${w.id}#${name}` : key, entry);
        }
        for (const v of values) if (!entry.source.values.some((e) => e.key === v.key)) entry.source.values.push(v);
        if (!entry.widgetIds.includes(w.id)) entry.widgetIds.push(w.id);
        map[name] = entry.source.id;
      }
      ids.set(w.id, map);
      const sample = ext.sample?.(settingsOf(w, env) as never, env) ?? {};
      for (const [k, v] of Object.entries(sample)) {
        const ref = resolveKey(k, map);
        const owner = ref && byIdOf(byKey, ref.slice(0, ref.indexOf(".")));
        if (ref && owner) owner.sample.set(ref, v);
      }
    }
  }
  return { sources: [...byKey.values()], ids };
}

/** Each widget's merges, given ids after its sources, and added to its source map. */
function buildMerges(project: Project, ids: Map<string, SourceMap>): Merge[] {
  const env = envOf(project);
  const out: Merge[] = [];
  for (const screen of project.screens) {
    for (const w of screen.widgets) {
      const ext = extensionFor(w.type);
      const map = ids.get(w.id);
      if (!ext?.merges || !map) continue;
      const next: Record<string, string> = { ...map };
      for (const [name, m] of Object.entries(ext.merges(settingsOf(w, env) as never, env))) {
        const from = m.from.map((n) => map[n]).filter((id): id is string => Boolean(id));
        if (from.length === 0) continue;
        const id = `m${out.length}`;
        out.push({ id, ...m, from });
        next[name] = id;
      }
      ids.set(w.id, next);
    }
  }
  return out;
}

function byIdOf(byKey: ReadonlyMap<string, CompiledSource>, id: string): CompiledSource | undefined {
  for (const s of byKey.values()) if (s.source.id === id) return s;
  return undefined;
}

function frameElements(box: { x: number; y: number; w: number; h: number }, frame: string): Element[] {
  if (frame === "outline") return [{ t: "rect", ...box, fill: false, stroke: 2, r: 10 }];
  if (frame === "inverted") return [{ t: "rect", ...box, r: 10 }];
  return [];
}

const isFont = (b: Uint8Array) => b[0] === 0x44 && b[1] === 0x46 && b[2] === 0x4e && b[3] === 0x54; // "DFNT"

export async function compile(project: Project, deps: CompileDeps): Promise<Compiled> {
  const env = envOf(project);
  const panel = rotated(deps.boardPanel(project.board), project.rotation);
  const assets = new AssetTable();
  const problems: Compiled["problems"] = [];
  const { sources, ids } = buildSources(project);
  const merges = buildMerges(project, ids);

  const catalog = factCatalog(project, ids);
  // Alerts sit on top of every screen; drawn once, appended to each.
  const overlay = new ElementDraw({ ...deps, assets }, { box: { x: 0, y: 0, w: panel.width, h: panel.height }, sources: {}, inverted: false });
  drawAlerts(overlay, project.alerts, catalog);

  const screens: Screen[] = project.screens.map((screen) => {
    const elements: Element[] = [];
    for (const w of screen.widgets) {
      const ext = extensionFor(w.type);
      if (!ext) {
        problems.push({ widgetId: w.id, message: `Unknown widget type “${w.type}”` });
        continue;
      }
      const outer = cellsToBox(w.x, w.y, w.w, w.h, panel);
      const pad = w.frame === "none" ? 0 : FRAME_PADDING;
      const box = { x: outer.x + pad, y: outer.y + pad, w: outer.w - 2 * pad, h: outer.h - 2 * pad };
      const draw = new ElementDraw({ ...deps, assets }, { box, sources: ids.get(w.id) ?? {}, inverted: w.frame === "inverted" });
      try {
        ext.draw(draw, settingsOf(w, env) as never, env);
        elements.push(...frameElements(outer, w.frame), ...draw.elements);
      } catch (e) {
        problems.push({ widgetId: w.id, message: e instanceof Error ? e.message : String(e) });
      }
    }
    const refresh = Math.min(...screen.widgets.map((w) => {
      const ext = extensionFor(w.type);
      return ext?.refresh ? ext.refresh(settingsOf(w, env) as never) : Infinity;
    }));
    elements.push(...overlay.elements);
    return { name: screen.name, elements, ...(Number.isFinite(refresh) && refresh * 60 < project.refreshMinutes * 60 ? { refresh: refresh * 60 } : {}) };
  });


  const screenIndex = (id: string) => Math.max(0, project.screens.findIndex((s) => s.id === id));
  const rules: Rule[] = [];
  const ruleIds: (string | null)[] = [];
  for (const r of project.rules) {
    if (!r.enabled || !project.screens.some((s) => s.id === r.screenId)) continue;
    const all = r.checks.map((c) => checkToCondition(c, catalog));
    // An unfinished check makes an "all" rule unfinished: dropping it would
    // make the rule fire more often than what was written.
    if (r.match === "all" && all.some((c) => c === null)) continue;
    const conds = all.filter((c) => c !== null);
    if (conds.length === 0) continue;
    rules.push({ screen: screenIndex(r.screenId), when: conds.length === 1 ? conds[0] : r.match === "any" ? { any: conds } : { all: conds } });
    ruleIds.push(r.id);
  }
  rules.push({ screen: screenIndex(project.defaultScreenId), when: null });
  ruleIds.push(null);

  const from = minutesOf(project.quiet.from);
  const to = minutesOf(project.quiet.to);
  const runtime: Omit<Runtime, "assets"> = {
    v: 1,
    board: project.board,
    width: panel.width,
    height: panel.height,
    rotation: project.rotation,
    wifi: project.wifi.filter((n) => n.ssid.trim() !== "").map((n) => ({ ssid: n.ssid.trim(), pass: n.password })),
    tz: posixTz(project.timezone),
    ntp: "pool.ntp.org",
    locale: localeFor(project.language),
    refresh: project.refreshMinutes * 60,
    ...(project.quiet.enabled && from !== null && to !== null && from !== to ? { quiet: { from, to } } : {}),
    sources: sources.map((s) => s.source),
    ...(merges.length ? { merges } : {}),
    screens,
    rules,
  };

  const projectBytes = deps.gzip ? await deps.gzip(new TextEncoder().encode(JSON.stringify(project))) : undefined;
  const charsets = fontCharsets(screens.flatMap((sc) => sc.elements), runtime.locale);
  const resolved = (await assets.resolve()).map((bytes, i) => {
    const keep = charsets.get(i);
    return deps.subsetFonts !== false && keep && keep !== "all" && isFont(bytes) ? subsetFont(bytes, keep) : bytes;
  });
  const blob = encodeBlob({ runtime, assets: resolved, project: projectBytes });
  return { blob: blob.bytes, runtime: blob.runtime, sources, widgetSources: ids, ruleIds, problems };
}

export { CELL };
