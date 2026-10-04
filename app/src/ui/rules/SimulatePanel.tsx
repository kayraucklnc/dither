// "What if": pretend it is another time, the battery is low, a value is
// different — and see which screen the rules would pick.

import type { CatalogFact } from "@/compiler/facts";
import type { Value } from "@/runtime/types";
import { Button, NumberInput, Segmented } from "../kit";

export interface SimState {
  /** Minutes since midnight, or null for now. */
  minutes: number | null;
  weekday: number | null;
  battery: number | null;
  online: boolean | null;
  /** Fact reference → pretend value. */
  values: Record<string, Value>;
}

export const NO_SIM: SimState = { minutes: null, weekday: null, battery: null, online: null, values: {} };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function SimulatePanel({ sim, onSim, catalog, values }: {
  sim: SimState; onSim: (s: SimState) => void; catalog: CatalogFact[]; values: ReadonlyMap<string, Value>;
}) {
  const minutes = sim.minutes ?? Number(values.get("clock.minutes") ?? 0);
  const weekday = sim.weekday ?? Number(values.get("clock.weekday") ?? 0);
  const pretend = (sim.minutes !== null || sim.weekday !== null || sim.battery !== null || sim.online !== null || Object.keys(sim.values).length > 0);
  const numeric = catalog.filter((f) => f.type === "number" && !f.ref.startsWith("device."));
  return (
    <div className="rounded-lg border border-line bg-raised p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Try it</h2>
        {pretend && <Button size="sm" variant="ghost" onClick={() => onSim({ minutes: null, weekday: null, battery: null, online: null, values: {} })}>Back to now</Button>}
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-[13px]"><span>Time</span><span className="font-medium tabular-nums">{hhmm(minutes)}</span></div>
        <input type="range" min={0} max={1439} step={5} value={minutes} aria-label="Pretend time"
          onChange={(e) => onSim({ ...sim, minutes: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
      </div>
      <div className="flex flex-wrap gap-1">
        {DAYS.map((d, i) => (
          <button key={d} type="button" aria-pressed={weekday === i} onClick={() => onSim({ ...sim, weekday: i })}
            className={`h-7 w-10 rounded text-[12px] font-medium ${weekday === i ? "bg-ink text-raised" : "bg-surface text-muted hover:text-ink"}`}>{d}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <label className="space-y-1">
          <span>Battery</span>
          <NumberInput value={sim.battery ?? Number(values.get("device.battery") ?? 80)} min={0} max={100} unit="%" onChange={(battery) => onSim({ ...sim, battery })} />
        </label>
        <div className="space-y-1">
          <span>Wi-Fi</span>
          <div>
            <Segmented label="Wi-Fi" value={(sim.online ?? values.get("device.online") ?? true) ? "on" : "off"}
              onChange={(v) => onSim({ ...sim, online: v === "on" })} options={[{ value: "on", label: "Up" }, { value: "off", label: "Down" }]} />
          </div>
        </div>
      </div>
      {numeric.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          {numeric.map((f) => {
            const v = sim.values[f.ref] ?? values.get(f.ref);
            return (
              <label key={f.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate" title={`${f.group}: ${f.label}`}>{f.label}</span>
                <span className="w-28 shrink-0">
                  <NumberInput value={typeof v === "number" ? Math.round(v * 10) / 10 : 0} unit={f.type === "number" ? f.unit : undefined}
                    onChange={(x) => onSim({ ...sim, values: { ...sim.values, [f.ref]: x } })} />
                </span>
              </label>
            );
          })}
        </div>
      )}
      {catalog.filter((f) => f.type === "choice" && f.id.includes(":")).map((f) => f.type === "choice" && (
        <div key={f.id} className="space-y-1.5 text-[13px]">
          <span>{f.label}</span>
          <div className="flex flex-wrap gap-1">
            {f.choices.slice(0, 8).map((c) => {
              const on = c.match.includes(sim.values[f.ref] as number) || (sim.values[f.ref] === undefined && c.match.includes(values.get(f.ref) as number));
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => onSim({ ...sim, values: { ...sim.values, [f.ref]: c.match[0] } })}
                  className={`h-7 rounded-full border px-2.5 text-[12px] ${on ? "border-accent bg-accent-soft" : "border-line text-muted hover:text-ink"}`}>{c.label}</button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
