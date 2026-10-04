// Alerts: a banner over whatever is showing — or the whole screen — while
// something is wrong. They sit above the rules: an alert does not pick a
// screen, it interrupts one. The first alert that holds is the one drawn.

import { useState } from "react";
import { ArrowDown, ArrowUp, BatteryLow, CalendarClock, CloudRain, Plus, TrainFront, Trash2, WifiOff } from "lucide-react";
import type { CatalogFact } from "@/compiler/facts";
import { newId } from "@/project/ids";
import type { AlertDef, Check, Project } from "@/project/schema";
import { useProject } from "@/state/project-store";
import { Button, IconButton, Segmented, Toggle } from "../kit";
import { CheckRow, defaultCheck } from "./CheckRow";

const ICONS = ["circle-alert", "info", "bell", "train-front", "umbrella", "cloud-rain", "cloud-lightning", "snowflake", "calendar", "clock", "battery-low", "wifi-off", "thermometer", "wind"];

const setAlert = (p: Project, id: string, fn: (a: AlertDef) => AlertDef): Project => ({ ...p, alerts: p.alerts.map((a) => (a.id === id ? fn(a) : a)) });

interface Preset {
  id: string;
  label: string;
  icon: typeof TrainFront;
  make: (c: CatalogFact[]) => Omit<AlertDef, "id" | "enabled"> | null;
}

const factOf = (c: CatalogFact[], extension: string, key: string) =>
  c.find((f) => "extension" in f && f.extension === extension && f.key === key);

const PRESETS: Preset[] = [
  {
    id: "train", label: "Trouble with my train", icon: TrainFront,
    make: (c) => {
      const f = factOf(c, "trenord", "trouble");
      return f ? { match: "any", checks: [{ fact: f.id, op: "is", value: true }], icon: "train-front", text: "Trouble on your line", value: null, style: "banner" } : null;
    },
  },
  {
    id: "rain", label: "Rain later today", icon: CloudRain,
    make: (c) => {
      const f = factOf(c, "weather", "rain");
      return f ? { match: "any", checks: [{ fact: f.id, op: "ge", value: 60 }], icon: "umbrella", text: "Take an umbrella", value: f.id, style: "banner" } : null;
    },
  },
  {
    id: "meeting", label: "A meeting about to start", icon: CalendarClock,
    make: (c) => {
      const f = factOf(c, "google-calendar", "next");
      return f ? { match: "any", checks: [{ fact: f.id, op: "le", value: 10 }], icon: "calendar", text: "Next meeting soon", value: f.id, style: "takeover" } : null;
    },
  },
  { id: "battery", label: "Battery low", icon: BatteryLow, make: () => ({ match: "any", checks: [{ fact: "battery", op: "lt", value: 15 }], icon: "battery-low", text: "Charge me", value: "battery", style: "banner" }) },
  { id: "offline", label: "Wi-Fi down", icon: WifiOff, make: () => ({ match: "any", checks: [{ fact: "online", op: "is", value: false }], icon: "wifi-off", text: "Offline — showing the last update", value: null, style: "banner" }) },
];

function AlertCard({ alert, index, count, catalog, active }: { alert: AlertDef; index: number; count: number; catalog: CatalogFact[]; active: boolean }) {
  const { update } = useProject();
  const set = (fn: (a: AlertDef) => AlertDef, coalesce?: string) => update((p) => setAlert(p, alert.id, fn), coalesce);
  const move = (d: number) => update((p) => {
    const alerts = [...p.alerts];
    const [a] = alerts.splice(index, 1);
    alerts.splice(index + d, 0, a);
    return { ...p, alerts };
  });
  const valued = catalog.filter((f) => f.type === "number" || f.type === "choice" || f.type === "text");
  return (
    <article className={`rounded-lg border bg-raised p-4 space-y-3 ${active ? "border-accent" : "border-line"} ${alert.enabled ? "" : "opacity-60"}`}>
      <header className="flex flex-wrap items-center gap-2">
        <select aria-label="Icon" value={alert.icon} onChange={(e) => set((a) => ({ ...a, icon: e.target.value }))}
          className="h-8 rounded-md border border-line bg-surface px-2 focus:border-accent focus:outline-none">
          {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <input aria-label="Alert text" value={alert.text} placeholder="What to say" maxLength={80}
          onChange={(e) => set((a) => ({ ...a, text: e.target.value }), `alert-text:${alert.id}`)}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 font-semibold focus:border-accent focus:outline-none" />
        {active && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">Showing now</span>}
        <span className="inline-flex items-center gap-1">
          <Toggle checked={alert.enabled} onChange={(enabled) => set((a) => ({ ...a, enabled }))} label="Alert on" />
          <IconButton label="Move up" disabled={index === 0} onClick={() => move(-1)}><ArrowUp size={15} /></IconButton>
          <IconButton label="Move down" disabled={index === count - 1} onClick={() => move(1)}><ArrowDown size={15} /></IconButton>
          <IconButton label="Delete alert" onClick={() => update((p) => ({ ...p, alerts: p.alerts.filter((a) => a.id !== alert.id) }))}><Trash2 size={15} /></IconButton>
        </span>
      </header>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-muted">Show it when</span>
        {alert.checks.length > 1 ? (
          <select aria-label="Match" value={alert.match} onChange={(e) => set((a) => ({ ...a, match: e.target.value as "all" | "any" }))}
            className="h-8 rounded-md border border-line bg-surface px-2 focus:border-accent focus:outline-none">
            <option value="any">any of these is true</option>
            <option value="all">all of these are true</option>
          </select>
        ) : <span className="text-muted">this is true</span>}
      </div>
      <div className="space-y-1.5">
        {alert.checks.map((c, i) => (
          <CheckRow key={i} check={c} catalog={catalog}
            onChange={(next: Check) => set((a) => ({ ...a, checks: a.checks.map((x, j) => (j === i ? next : x)) }), `alert-check:${alert.id}:${i}`)}
            onRemove={() => set((a) => ({ ...a, checks: a.checks.filter((_, j) => j !== i) }))} />
        ))}
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => set((a) => ({ ...a, checks: [...a.checks, defaultCheck(catalog[0])] }))}>
          Add a check
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[13px]">
        <label className="inline-flex items-center gap-2">
          <span className="text-muted">Also show</span>
          <select value={alert.value ?? ""} onChange={(e) => set((a) => ({ ...a, value: e.target.value || null }))}
            className="h-8 max-w-[220px] rounded-md border border-line bg-surface px-2 focus:border-accent focus:outline-none">
            <option value="">nothing else</option>
            {valued.map((f) => <option key={f.id} value={f.id}>{f.group}: {f.label}</option>)}
          </select>
        </label>
        <Segmented label="Style" value={alert.style} onChange={(style) => set((a) => ({ ...a, style }))}
          options={[{ value: "banner", label: "Banner" }, { value: "takeover", label: "Whole screen" }]} />
      </div>
    </article>
  );
}

export function AlertsSection({ catalog, activeId }: { catalog: CatalogFact[]; activeId: string | null }) {
  const { project, update } = useProject();
  const [menu, setMenu] = useState(false);
  const add = (made: Omit<AlertDef, "id" | "enabled"> | null) => {
    const base = made ?? { match: "any" as const, checks: [], icon: "circle-alert", text: "", value: null, style: "banner" as const };
    update((p) => ({ ...p, alerts: [...p.alerts, { id: newId("a"), enabled: true, ...base }] }));
    setMenu(false);
  };
  return (
    <section className="space-y-4 pt-4">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight">Alerts</h2>
        <p className="text-muted mt-1 max-w-[62ch]">Shown on top of whatever screen is up, while something needs your attention. When several apply, the highest one wins.</p>
      </div>
      {project.alerts.map((a, i) => (
        <AlertCard key={a.id} alert={a} index={i} count={project.alerts.length} catalog={catalog} active={activeId === a.id} />
      ))}
      <div className="relative">
        <Button icon={<Plus size={15} />} onClick={() => setMenu(!menu)} aria-expanded={menu}>Add an alert</Button>
        {menu && (
          <div className="absolute z-10 mt-1.5 w-72 rounded-lg border border-line bg-raised p-1 shadow-lg">
            {PRESETS.map((p) => {
              const made = p.make(catalog);
              return (
                <button key={p.id} type="button" disabled={!made} onClick={() => add(made)}
                  title={made ? undefined : "Add the widget this needs first"}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-transparent">
                  <p.icon size={15} className="text-accent" /> {p.label}
                </button>
              );
            })}
            <button type="button" onClick={() => add(null)} className="mt-1 flex w-full items-center gap-2.5 rounded-md border-t border-line px-2.5 py-2 text-left hover:bg-accent-soft">
              <Plus size={15} className="text-muted" /> Start from nothing
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
