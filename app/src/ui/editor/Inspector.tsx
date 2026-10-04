// The right-hand panel: the selected widget's settings, or the screen's.

import { ArrowDownToLine, ArrowUpToLine, Copy, Star, Trash2 } from "lucide-react";
import { BatteryMedium, Bitcoin, Calendar, CalendarDays, ChartLine, Clock, CloudSun, Gift, Globe, Image, Quote, Square, TrainFront, Type, type LucideIcon } from "lucide-react";
import type { Compiled } from "@/compiler";
import { gridOf, rotated } from "@/compiler/grid";
import { envOf, extensionFor, missingAccounts, settingsOf, widgetTitle } from "@/compiler/widgets";
import { newId } from "@/project/ids";
import type { Project, Widget } from "@/project/schema";
import { boardPanel } from "@/state/compile";
import type { SourceStatus } from "@/state/simulation";
import { useProject } from "@/state/project-store";
import { Button, Field, Note, Segmented, TextInput } from "../kit";
import { clampWidget } from "./placement";
import { SettingsForm } from "./SettingsForm";
import { updateWidget } from "./ScreenEditor";

// Gallery icons by name. An extension naming one not listed here gets a square.
const ICONS: Record<string, LucideIcon> = {
  clock: Clock, calendar: Calendar, "cloud-sun": CloudSun, type: Type, quote: Quote, gift: Gift,
  image: Image, bitcoin: Bitcoin, globe: Globe, "battery-medium": BatteryMedium,
  "calendar-days": CalendarDays, "train-front": TrainFront, "chart-line": ChartLine,
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

const withWidgets = (p: Project, screenIndex: number, fn: (ws: Widget[]) => Widget[]): Project => ({
  ...p,
  screens: p.screens.map((s, i) => (i === screenIndex ? { ...s, widgets: fn(s.widgets) } : s)),
});

export function Inspector({ screenIndex, selected, onSelect, compiled, status }: {
  screenIndex: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  compiled: Compiled | null;
  status: ReadonlyMap<string, SourceStatus>;
}) {
  const { project, update } = useProject();
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
        <p className="text-[13px] text-muted">Click a widget on the panel to change it. Drag to move it, drag its corner to resize. Arrow keys nudge.</p>
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
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-accent-soft text-accent"><ExtensionIcon name={ext.icon} /></span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold truncate">{widgetTitle(widget, env)}</h2>
          <p className="text-[12px] text-muted">{ext.description}</p>
        </div>
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

      <div className="flex flex-wrap gap-1 border-t border-line pt-4">
        <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => {
          const grid = gridOf(rotated(boardPanel(project.board), project.rotation));
          const copy = clampWidget({ ...widget, id: newId("w"), x: widget.x + 1, y: widget.y + 1 }, grid, ext.size.min);
          update((p) => withWidgets(p, screenIndex, (ws) => [...ws, copy]));
          onSelect(copy.id);
        }}>Duplicate</Button>
        <Button size="sm" variant="ghost" icon={<ArrowUpToLine size={14} />} onClick={() => update((p) => withWidgets(p, screenIndex, (ws) => [...ws.filter((w) => w.id !== widget.id), widget]))}>To front</Button>
        <Button size="sm" variant="ghost" icon={<ArrowDownToLine size={14} />} onClick={() => update((p) => withWidgets(p, screenIndex, (ws) => [widget, ...ws.filter((w) => w.id !== widget.id)]))}>To back</Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => {
          update((p) => withWidgets(p, screenIndex, (ws) => ws.filter((w) => w.id !== widget.id)));
          onSelect(null);
        }}>Remove</Button>
      </div>
    </div>
  );
}
