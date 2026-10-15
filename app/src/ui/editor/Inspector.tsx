// The right-hand panel: the selected widget's settings, or the screen's.

import { ArrowDownToLine, ArrowUpToLine, Copy, Star, Trash2 } from "lucide-react";
import { BatteryMedium, Bitcoin, Calendar, CalendarDays, ChartLine, Clock, CloudSun, FileCode, Gift, Globe, Image, Plane, Quote, Satellite, Square, TrainFront, Type, Wind, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Compiled } from "@/compiler";
import { envOf, extensionFor, missingAccounts, settingsOf, widgetTitle } from "@/compiler/widgets";
import type { ScreenDef, Widget } from "@/project/schema";
import type { SourceStatus } from "@/state/simulation";
import { useProject } from "@/state/project-store";
import { Button, Field, IconButton, Note, Segmented, Select, TextInput } from "../kit";
import { useWidgetActions, type WidgetActions } from "./actions";
import { SettingsForm } from "./SettingsForm";
import { updateWidget } from "./ScreenEditor";

// Gallery icons by name. An extension naming one not listed here gets a square.
const ICONS: Record<string, LucideIcon> = {
  clock: Clock, calendar: Calendar, "cloud-sun": CloudSun, type: Type, quote: Quote, gift: Gift,
  image: Image, bitcoin: Bitcoin, globe: Globe, "battery-medium": BatteryMedium,
  "calendar-days": CalendarDays, "train-front": TrainFront, "chart-line": ChartLine, "file-code": FileCode,
  wind: Wind, plane: Plane, satellite: Satellite,
};

export function ExtensionIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Square;
  return <Icon size={size} />;
}

function DataStatus({ status }: { status: SourceStatus | undefined }) {
  if (!status) return null;
  if (status.state === "loading") return <Note>Fetching live data…</Note>;
  if (status.state === "live") return <Note tone="ok">Showing live data, fetched by this browser at {new Date(status.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</Note>;
  return <Note>Showing example data. {status.reason}</Note>;
}

// Null leaves the schedule to each widget.
const FETCH_OPTIONS = [
  { value: "auto", label: "Each widget decides" },
  { value: "5", label: "Every 5 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "180", label: "Every 3 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Once a day" },
] as const;
type FetchOption = (typeof FETCH_OPTIONS)[number]["value"];

const SHORTCUTS: [string, string][] = [
  ["A", "Add a widget"],
  ["Del", "Remove the selected widget"],
  ["⌘D", "Duplicate it"],
  ["← ↑ → ↓", "Nudge it"],
  ["⇧ + arrows", "Resize it"],
  ["⌘Z / ⇧⌘Z", "Undo / redo"],
];

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-raised px-1 py-px font-sans text-[11px] text-ink">{children}</kbd>;
}

function Shortcuts() {
  return (
    <section className="space-y-2 border-t border-line pt-4">
      <h3 className="text-[13px] font-medium">Shortcuts</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px] text-muted">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="contents">
            <dt><Kbd>{keys}</Kbd></dt>
            <dd className="self-center">{what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The widgets on a screen, top first, so a hidden or tiny one can still be found. */
function WidgetList({ screen, onSelect, actions }: { screen: ScreenDef; onSelect: (id: string) => void; actions: WidgetActions }) {
  const { project } = useProject();
  const env = envOf(project);
  if (!screen.widgets.length) return <p className="text-[13px] text-muted">No widgets yet. Press <Kbd>A</Kbd> or “Add widget” to place one.</p>;
  return (
    <section className="space-y-1.5">
      <h3 className="text-[13px] font-medium">Widgets <span className="font-normal text-muted">{screen.widgets.length}</span></h3>
      <ul className="-mx-1.5">
        {[...screen.widgets].reverse().map((w) => (
          <li key={w.id} className="group flex items-center rounded-md hover:bg-ink/5">
            <button type="button" onClick={() => onSelect(w.id)} className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left">
              <span className="text-muted"><ExtensionIcon name={extensionFor(w.type)?.icon ?? ""} size={14} /></span>
              <span className="truncate">{widgetTitle(w, env)}</span>
              <span className="ml-auto shrink-0 text-[12px] text-muted tabular-nums">{w.w}×{w.h}</span>
            </button>
            <IconButton label={`Remove ${widgetTitle(w, env)}`} onClick={() => actions.remove(w)} className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger">
              <Trash2 size={13} />
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Inspector({ screenIndex, selected, onSelect, compiled, status }: {
  screenIndex: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  compiled: Compiled | null;
  status: ReadonlyMap<string, SourceStatus>;
}) {
  const { project, update } = useProject();
  const actions = useWidgetActions(screenIndex, onSelect);
  const screen = project.screens[screenIndex];
  const widget = screen.widgets.find((w) => w.id === selected);
  const env = envOf(project);

  if (!widget) {
    const isDefault = project.defaultScreenId === screen.id;
    const usedBy = project.rules.filter((r) => r.screenId === screen.id).length;
    return (
      <div className="space-y-5">
        <h2 className="text-[15px] font-semibold">Screen</h2>
        <Field label="Name">
          {(id) => (
            <TextInput
              id={id}
              value={screen.name}
              onChange={(name) => update((p) => ({ ...p, screens: p.screens.map((s, i) => (i === screenIndex ? { ...s, name } : s)) }), `screen-name:${screen.id}`)}
            />
          )}
        </Field>
        {isDefault ? (
          <Note>This is the screen the panel shows when no rule applies.</Note>
        ) : (
          <div className="space-y-2">
            <p className="text-[13px] text-muted">
              {usedBy ? `Shown when ${usedBy === 1 ? "a rule" : `${usedBy} rules`} say so.` : "No rule shows this screen yet. Add one under Rules."}
            </p>
            <Button size="sm" icon={<Star size={14} />} onClick={() => update((p) => ({ ...p, defaultScreenId: screen.id }))}>
              Show this when no rule applies
            </Button>
          </div>
        )}
        <Field label="Fetch data every" help="How often the panel asks for new data for the widgets on this screen. Less often saves battery.">
          {(id) => (
            <Select<FetchOption>
              id={id}
              value={(FETCH_OPTIONS.find((o) => o.value === String(screen.fetchMinutes))?.value ?? "auto")}
              onChange={(v) => {
                const fetchMinutes = v === "auto" ? null : Number(v);
                update((p) => ({ ...p, screens: p.screens.map((s, i) => (i === screenIndex ? { ...s, fetchMinutes } : s)) }));
              }}
              options={FETCH_OPTIONS}
            />
          )}
        </Field>
        <WidgetList screen={screen} onSelect={onSelect} actions={actions} />
        <p className="text-[13px] text-muted">Click a widget on the panel to change it. Drag to move it, drag its corner to resize.</p>
        <Shortcuts />
      </div>
    );
  }

  const ext = extensionFor(widget.type);
  if (!ext) return <Note tone="warn">This widget's type ({widget.type}) is not part of this version of Dither.</Note>;
  const settings = settingsOf(widget, env);
  const sourceId = compiled?.sources.find((s) => s.widgetIds.includes(widget.id))?.source.id;
  const set = (fn: (w: Widget) => Widget, coalesce?: string) => update((p) => updateWidget(p, screenIndex, widget.id, fn), coalesce);
  const problem = compiled?.problems.find((p) => p.widgetId === widget.id);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent"><ExtensionIcon name={ext.icon} /></span>
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{widgetTitle(widget, env)}</h2>
          <div className="-mr-1.5 flex shrink-0">
            <IconButton label="Duplicate (⌘D)" onClick={() => actions.duplicate(widget)}><Copy size={15} /></IconButton>
            <IconButton label="Bring to front" onClick={() => actions.toFront(widget)}><ArrowUpToLine size={15} /></IconButton>
            <IconButton label="Send to back" onClick={() => actions.toBack(widget)}><ArrowDownToLine size={15} /></IconButton>
            <IconButton label="Remove (Del)" onClick={() => actions.remove(widget)} className="hover:!text-danger hover:!bg-danger-soft"><Trash2 size={15} /></IconButton>
          </div>
        </div>
        <p className="text-[12px] text-muted">{ext.description} <span className="tabular-nums">· {widget.w}×{widget.h} cells</span></p>
      </div>

      {problem && <Note tone="warn">{problem.message}</Note>}
      {missingAccounts(widget.type, env).length > 0 && (
        <Note tone="warn">This widget needs an account that is not linked. Link it under Panel → Accounts.</Note>
      )}
      {ext.source && !sourceId && <Note tone="warn">Fill in the settings below so the panel knows what to fetch.</Note>}
      {sourceId && <DataStatus status={status.get(sourceId)} />}

      <SettingsForm
        fields={ext.fields}
        values={settings}
        onChange={(key, value, also) => update(
          (p) => updateWidget(also ? also(p) : p, screenIndex, widget.id, (w) => ({ ...w, settings: { ...w.settings, [key]: value } })),
          `widget:${widget.id}:${key}`,
        )}
      />

      <Field label="Frame">
        {() => (
          <Segmented
            label="Frame"
            value={widget.frame}
            onChange={(frame) => set((w) => ({ ...w, frame }))}
            options={[{ value: "none", label: "None" }, { value: "outline", label: "Outline" }, { value: "inverted", label: "Inverted" }]}
          />
        )}
      </Field>

      <Button size="sm" variant="ghost" onClick={() => onSelect(null)} className="-ml-2 text-muted">← Back to the screen</Button>
    </div>
  );
}
