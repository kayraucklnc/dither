// The panel itself: where it hangs, which Wi-Fi, how often it wakes.

import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { gridOf, rotated } from "@/compiler/grid";
import { LANGUAGES } from "@/compiler/locale";
import { extensionFor } from "@/compiler/widgets";
import { boardPanel } from "@/state/compile";
import { clampWidget } from "../editor/placement";
import { listBoards } from "@/device";
import type { Project, Wifi } from "@/project/schema";
import { useProject } from "@/state/project-store";
import { Button, Field, IconButton, Note, Segmented, Select, TextInput, Toggle } from "../kit";
import { PlaceSearch } from "../fields/PlaceSearch";
import { Accounts } from "./Accounts";

function Section({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-x-8 gap-y-3 border-t border-line py-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-[13px] text-muted mt-1">{description}</p>}
      </div>
      <div className="space-y-4 max-w-[520px]">{children}</div>
    </section>
  );
}

function WifiRow({ net, onChange, onRemove, removable }: { net: Wifi; onChange: (n: Wifi) => void; onRemove: () => void; removable: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2 items-start">
      <div className="grid grid-cols-2 gap-2 flex-1">
        <TextInput value={net.ssid} onChange={(ssid) => onChange({ ...net, ssid })} onBlur={() => net.ssid !== net.ssid.trim() && onChange({ ...net, ssid: net.ssid.trim() })} placeholder="Network name" />
        <div className="relative">
          <TextInput type={show ? "text" : "password"} value={net.password} onChange={(password) => onChange({ ...net, password })} placeholder="Password" />
          <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      {removable && <IconButton label="Remove network" onClick={onRemove}><Trash2 size={15} /></IconButton>}
    </div>
  );
}

/** Keep every widget on the grid of the project's display and rotation, after either changes. */
function fitToPanel(p: Project): Project {
  const grid = gridOf(rotated(boardPanel(p.board), p.rotation));
  return {
    ...p,
    screens: p.screens.map((s) => ({
      ...s,
      widgets: s.widgets.map((w) => clampWidget(w, grid, extensionFor(w.type)?.size.min ?? [1, 1])),
    })),
  };
}

let rowSeq = 0;
const rowKey = () => `wifi-${rowSeq++}`;

/** Stable React keys for the Wi-Fi rows, which have no ids of their own. */
function useRowKeys(count: number): [string[], (index: number) => void] {
  const [keys, setKeys] = useState(() => Array.from({ length: count }, rowKey));
  // Undo, redo or a new project can change the count behind our back.
  if (keys.length !== count) {
    setKeys(keys.length > count ? keys.slice(0, count) : [...keys, ...Array.from({ length: count - keys.length }, rowKey)]);
  }
  return [keys, (index) => setKeys((k) => k.filter((_, j) => j !== index))];
}

const REFRESH = [5, 10, 15, 30, 60, 120].map((m) => ({ value: String(m), label: m < 60 ? `Every ${m} minutes` : m === 60 ? "Every hour" : "Every 2 hours" }));

export function PanelSettings() {
  const { project, update } = useProject();
  const set = <K extends keyof Project>(key: K, value: Project[K], coalesce?: string) => update((p) => ({ ...p, [key]: value }), coalesce);
  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [project.timezone];
    return (all.includes(project.timezone) ? all : [project.timezone, ...all]).map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
  }, [project.timezone]);
  const noWifi = !project.wifi.some((n) => n.ssid.trim());
  const [rowKeys, forgetRow] = useRowKeys(project.wifi.length);

  return (
    <div className="p-8 max-w-[960px]">
      <h1 className="text-[22px] font-semibold tracking-tight mb-6">Panel</h1>

      <Section title="Wi-Fi" description="The panel tries these in order. 2.4 GHz only.">
        {noWifi && <Note tone="warn">Without Wi-Fi the panel cannot fetch the weather or set its clock.</Note>}
        {project.wifi.map((n, i) => (
          <WifiRow key={rowKeys[i] ?? i} net={n} removable={project.wifi.length > 1}
            onChange={(next) => set("wifi", project.wifi.map((x, j) => (j === i ? next : x)), `wifi:${i}`)}
            onRemove={() => {
              forgetRow(i);
              set("wifi", project.wifi.filter((_, j) => j !== i));
            }} />
        ))}
        {project.wifi.length < 4 && (
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => set("wifi", [...project.wifi, { ssid: "", password: "" }])}>Add another network</Button>
        )}
      </Section>

      <Section title="Accounts" description="Linked once and shared by every widget. Widgets that need an account unlock when it is linked.">
        <Accounts />
      </Section>

      <Section title="Place and time" description="Used for the weather, the clock and the day names.">
        <Field label="Place">{() => <PlaceSearch value={project.place} onChange={(p) => set("place", p)} language={project.language} />}</Field>
        <Field label="Time zone">{(id) => <Select id={id} value={project.timezone} onChange={(v) => set("timezone", v)} options={zones} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Language">{(id) => <Select id={id} value={project.language} onChange={(v) => set("language", v)} options={LANGUAGES} />}</Field>
          <Field label="Units">
            {() => <Segmented label="Units" value={project.units} onChange={(v) => set("units", v)} options={[{ value: "metric", label: "°C, km/h" }, { value: "imperial", label: "°F, mph" }]} />}
          </Field>
        </div>
      </Section>

      <Section title="Waking up" description="The panel sleeps between updates. Waking less often makes a battery last longer.">
        <Field label="Update" help="Some widgets ask for more — a clock updates every minute while it is on screen.">
          {(id) => <Select id={id} value={String(project.refreshMinutes)} onChange={(v) => set("refreshMinutes", Number(v))} options={REFRESH} />}
        </Field>
        <div className="flex items-center gap-3">
          <Toggle checked={project.quiet.enabled} onChange={(enabled) => set("quiet", { ...project.quiet, enabled })} label="Quiet hours" />
          <span>Don't update between</span>
          <input type="time" aria-label="Quiet from" value={project.quiet.from} disabled={!project.quiet.enabled}
            onChange={(e) => set("quiet", { ...project.quiet, from: e.target.value })} className="h-8 rounded-md border border-line bg-raised px-2 disabled:opacity-50" />
          <span>and</span>
          <input type="time" aria-label="Quiet until" value={project.quiet.to} disabled={!project.quiet.enabled}
            onChange={(e) => set("quiet", { ...project.quiet, to: e.target.value })} className="h-8 rounded-md border border-line bg-raised px-2 disabled:opacity-50" />
        </div>
      </Section>

      <Section title="Hardware">
        <Field label="Display">
          {(id) => <Select id={id} value={project.board} onChange={(board) => update((p) => fitToPanel({ ...p, board }))} options={listBoards().map((b) => ({ value: b.id, label: b.name }))} />}
        </Field>
        <Field label="Hanging" help="Turn the picture if the panel hangs on its side or upside down.">
          {() => (
            <Segmented label="Rotation" value={project.rotation} onChange={(rotation) => update((p) => fitToPanel({ ...p, rotation }))}
              options={[{ value: 0, label: "Landscape" }, { value: 90, label: "Portrait" }, { value: 180, label: "Upside down" }, { value: 270, label: "Portrait, flipped" }]} />
          )}
        </Field>
        <Field label="Project name">{(id) => <TextInput id={id} value={project.name} onChange={(v) => set("name", v, "name")} />}</Field>
      </Section>
    </div>
  );
}
