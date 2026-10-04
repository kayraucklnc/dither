// Rules: which screen, when. Checked from the top each time the panel wakes;
// the first that matches wins, and the default screen catches the rest.

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BatteryLow, CloudRain, Moon, Plus, Sofa, Trash2, WifiOff } from "lucide-react";
import type { Compiled } from "@/compiler";
import { activeAlert } from "@/compiler/alerts";
import { factCatalog, type CatalogFact } from "@/compiler/facts";
import { newId } from "@/project/ids";
import type { Check, Project, RuleDef } from "@/project/schema";
import { chooseScreen } from "@/runtime/conditions";
import { formatContext } from "@/runtime/render";
import type { Value } from "@/runtime/types";
import { useProject } from "@/state/project-store";
import { Button, IconButton, Toggle } from "../kit";
import { AlertsSection } from "./AlertsSection";
import { CheckRow, defaultCheck } from "./CheckRow";
import { ScreenPreview } from "../Preview";
import { SimulatePanel, type SimState } from "./SimulatePanel";

const setRule = (p: Project, id: string, fn: (r: RuleDef) => RuleDef): Project => ({ ...p, rules: p.rules.map((r) => (r.id === id ? fn(r) : r)) });

function RuleCard({ rule, index, count, catalog, matching }: {
  rule: RuleDef; index: number; count: number; catalog: CatalogFact[]; matching: boolean;
}) {
  const { project, update } = useProject();
  const set = (fn: (r: RuleDef) => RuleDef, coalesce?: string) => update((p) => setRule(p, rule.id, fn), coalesce);
  const move = (d: number) => update((p) => {
    const rules = [...p.rules];
    const [r] = rules.splice(index, 1);
    rules.splice(index + d, 0, r);
    return { ...p, rules };
  });
  return (
    <article className={`rounded-lg border bg-raised p-4 space-y-3 ${matching ? "border-accent" : "border-line"} ${rule.enabled ? "" : "opacity-60"}`}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-muted">Show</span>
        <select aria-label="Screen" value={rule.screenId} onChange={(e) => set((r) => ({ ...r, screenId: e.target.value }))}
          className="h-8 rounded-md border border-line bg-surface px-2 font-semibold focus:border-accent focus:outline-none">
          {project.screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-muted">when</span>
        {rule.checks.length > 1 ? (
          <select aria-label="Match" value={rule.match} onChange={(e) => set((r) => ({ ...r, match: e.target.value as "all" | "any" }))}
            className="h-8 rounded-md border border-line bg-surface px-2 focus:border-accent focus:outline-none">
            <option value="all">all of these are true</option>
            <option value="any">any of these is true</option>
          </select>
        ) : <span className="text-muted">this is true</span>}
        {matching && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">Showing now</span>}
        <span className="ml-auto inline-flex items-center gap-1">
          <Toggle checked={rule.enabled} onChange={(enabled) => set((r) => ({ ...r, enabled }))} label="Rule on" />
          <IconButton label="Move up" disabled={index === 0} onClick={() => move(-1)}><ArrowUp size={15} /></IconButton>
          <IconButton label="Move down" disabled={index === count - 1} onClick={() => move(1)}><ArrowDown size={15} /></IconButton>
          <IconButton label="Delete rule" onClick={() => update((p) => ({ ...p, rules: p.rules.filter((r) => r.id !== rule.id) }))}><Trash2 size={15} /></IconButton>
        </span>
      </header>
      <div className="space-y-1.5">
        {rule.checks.map((c, i) => (
          <CheckRow key={i} check={c} catalog={catalog}
            onChange={(next) => set((r) => ({ ...r, checks: r.checks.map((x, j) => (j === i ? next : x)) }), `check:${rule.id}:${i}`)}
            onRemove={() => set((r) => ({ ...r, checks: r.checks.filter((_, j) => j !== i) }))} />
        ))}
        {rule.checks.length === 0 && <p className="text-[13px] text-muted">Add something to check — until then this rule never applies.</p>}
      </div>
      <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => set((r) => ({ ...r, checks: [...r.checks, defaultCheck(catalog[0])] }))}>
        Add a check
      </Button>
    </article>
  );
}

interface Preset {
  id: string;
  label: string;
  icon: typeof Moon;
  checks: (catalog: CatalogFact[]) => Check[] | null;
}

const PRESETS: Preset[] = [
  { id: "night", label: "At night", icon: Moon, checks: () => [{ fact: "time", op: "between", value: { from: "22:00", to: "07:00" } }] },
  { id: "weekend", label: "On the weekend", icon: Sofa, checks: () => [{ fact: "weekday", op: "in", value: ["weekend"] }] },
  {
    id: "rain", label: "When it rains", icon: CloudRain,
    checks: (c) => {
      const f = c.find((x) => x.id.endsWith(":condition"));
      return f ? [{ fact: f.id, op: "in", value: ["wet"] }] : null;
    },
  },
  { id: "battery", label: "When the battery is low", icon: BatteryLow, checks: () => [{ fact: "battery", op: "lt", value: 15 }] },
  { id: "offline", label: "When Wi-Fi is down", icon: WifiOff, checks: () => [{ fact: "online", op: "is", value: false }] },
];

export function RulesView({ compiled, values, now, sim, onSim }: {
  compiled: Compiled | null; values: ReadonlyMap<string, Value>; now: number; sim: SimState; onSim: (s: SimState) => void;
}) {
  const { project, update } = useProject();
  // Facts point at the compiled sources, so the simulation's values line up.
  const sourceIds = compiled?.widgetSources;
  const catalog = useMemo(() => factCatalog(project, sourceIds), [project, sourceIds]);
  const alertNow = compiled ? activeAlert(project.alerts, catalog, values, formatContext(compiled.runtime, now, values)) : null;
  const [menu, setMenu] = useState(false);
  const choice = compiled ? chooseScreen(compiled.runtime.rules, values, formatContext(compiled.runtime, now, values)) : null;
  const matchingId = choice && choice.rule !== null ? (compiled?.ruleIds[choice.rule] ?? null) : null;

  const add = (preset?: Preset) => {
    const checks = preset ? preset.checks(catalog) : [];
    const screenId = project.screens.find((s) => s.id !== project.defaultScreenId)?.id ?? project.screens[0].id;
    update((p) => ({ ...p, rules: [...p.rules, { id: newId("r"), screenId, match: "all", enabled: true, checks: checks ?? [] }] }));
    setMenu(false);
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8 p-8 max-w-[1240px]">
      <section className="space-y-4 min-w-0">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Rules</h1>
          <p className="text-muted mt-1 max-w-[62ch]">Each time it wakes, the panel reads these from the top and shows the screen of the first rule that is true.</p>
        </div>
        {project.rules.map((r, i) => (
          <RuleCard key={r.id} rule={r} index={i} count={project.rules.length} catalog={catalog} matching={matchingId === r.id} />
        ))}
        <article className={`rounded-lg border border-dashed bg-surface p-4 flex flex-wrap items-center gap-2 ${choice && !matchingId ? "border-accent" : "border-line"}`}>
          <span className="text-muted">Otherwise show</span>
          <select aria-label="Default screen" value={project.defaultScreenId} onChange={(e) => update((p) => ({ ...p, defaultScreenId: e.target.value }))}
            className="h-8 rounded-md border border-line bg-raised px-2 font-semibold focus:border-accent focus:outline-none">
            {project.screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {choice && !matchingId && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">Showing now</span>}
        </article>
        <div className="relative">
          <Button icon={<Plus size={15} />} onClick={() => setMenu(!menu)} aria-expanded={menu}>Add a rule</Button>
          {menu && (
            <div className="absolute z-10 mt-1.5 w-64 rounded-lg border border-line bg-raised p-1 shadow-lg">
              {PRESETS.map((p) => {
                const ok = p.checks(catalog) !== null;
                return (
                  <button key={p.id} type="button" disabled={!ok} onClick={() => add(p)}
                    title={ok ? undefined : "Add a weather widget first"}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-transparent">
                    <p.icon size={15} className="text-accent" /> {p.label}
                  </button>
                );
              })}
              <button type="button" onClick={() => add()} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent-soft border-t border-line mt-1">
                <Plus size={15} className="text-muted" /> Start from nothing
              </button>
            </div>
          )}
        </div>
        <AlertsSection catalog={catalog} activeId={alertNow} />
        {project.screens.length < 2 && (
          <p className="text-[13px] text-muted">Rules choose between screens, and this panel has one. Add another screen on the left to give a rule somewhere to go.</p>
        )}
      </section>
      <aside className="space-y-4">
        <SimulatePanel sim={sim} onSim={onSim} catalog={catalog} values={values} />
        {compiled && choice && (
          <div className="space-y-2">
            <p className="text-[13px] text-muted">The panel would show <strong className="text-ink">{compiled.runtime.screens[choice.screen]?.name}</strong>.</p>
            <div className="rounded-lg bg-bezel p-2">
              <ScreenPreview compiled={compiled} screen={choice.screen} values={values} now={now} className="block w-full bg-paper" />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
