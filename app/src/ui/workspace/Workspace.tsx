// The editor: screens on the left, the panel in the middle, settings on the right.

import { useMemo, useState } from "react";
import { Copy, FolderOpen, Sparkles, LayoutGrid, Plus, Redo2, Save, Settings2, Trash2, Undo2, Usb, Workflow } from "lucide-react";
import { gridOf, rotated } from "@/compiler/grid";
import type { Extension } from "@/extensions/api";
import { newId } from "@/project/ids";
import { withShowcase } from "@/project/showcase";
import { chooseScreen } from "@/runtime/conditions";
import { formatContext } from "@/runtime/render";
import { parseZone, toLocal } from "@/runtime/tz";
import { boardPanel, useCompiled } from "@/state/compile";
import { useProject } from "@/state/project-store";
import { useSimulation, type Overrides } from "@/state/simulation";
import { download, fileName, projectFile, readProjectFile } from "@/state/storage";
import { freeSpot } from "../editor/placement";
import { Inspector } from "../editor/Inspector";
import { ScreenEditor } from "../editor/ScreenEditor";
import { WidgetGallery } from "../editor/WidgetGallery";
import { FlashDialog } from "../flash/FlashDialog";
import { Button, Dialog, IconButton, Note } from "../kit";
import { PanelSettings } from "../panel/PanelSettings";
import { SaveWarning } from "./SaveWarning";
import { ScreenPreview } from "../Preview";
import { RulesView } from "../rules/RulesView";
import { NO_SIM, type SimState } from "../rules/SimulatePanel";
import { Wordmark } from "../Mark";

type View = { kind: "screen"; index: number } | { kind: "rules" } | { kind: "panel" };

function toOverrides(sim: SimState, now: number, tz: string | undefined): Overrides {
  let time: number | undefined;
  if (tz && (sim.minutes !== null || sim.weekday !== null)) {
    const l = toLocal(parseZone(tz), now);
    const minutes = sim.minutes ?? l.hour * 60 + l.minute;
    const dayShift = sim.weekday === null ? 0 : sim.weekday - l.weekday;
    time = now + (minutes - (l.hour * 60 + l.minute)) * 60 - l.second + dayShift * 86400;
  }
  return {
    time,
    device: { ...(sim.battery !== null ? { battery: sim.battery } : {}), ...(sim.online !== null ? { online: sim.online } : {}) },
    values: sim.values,
  };
}

export function Workspace({ onNew }: { onNew: () => void }) {
  const { project, update, replace, undo, redo, canUndo, canRedo } = useProject();
  const { compiled, error } = useCompiled(project);
  const [view, setView] = useState<View>({ kind: "screen", index: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [sim, setSim] = useState<SimState>(NO_SIM);
  const [openError, setOpenError] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmShowcase, setConfirmShowcase] = useState(false);

  const base = useSimulation(compiled);
  const overrides = useMemo(() => toOverrides(sim, base.now, compiled?.runtime.tz), [sim, base.now, compiled]);
  const { values, now, status } = useSimulation(compiled, overrides);
  const showing = compiled ? chooseScreen(compiled.runtime.rules, values, formatContext(compiled.runtime, now, values)).screen : 0;

  const screenIndex = view.kind === "screen" ? Math.min(view.index, project.screens.length - 1) : 0;
  const panel = rotated(boardPanel(project.board), project.rotation);

  const addWidget = (ext: Extension) => {
    const s = project.screens[screenIndex];
    const spot = freeSpot(s.widgets, ext.size.default, gridOf(panel));
    const w = { id: newId("w"), type: ext.id, ...spot, frame: "none" as const, settings: {} };
    update((p) => ({ ...p, screens: p.screens.map((x, i) => (i === screenIndex ? { ...x, widgets: [...x.widgets, w] } : x)) }));
    setSelected(w.id);
    setGallery(false);
  };

  const addScreen = () => {
    const s = { id: newId("s"), name: `Screen ${project.screens.length + 1}`, widgets: [] };
    update((p) => ({ ...p, screens: [...p.screens, s] }));
    setView({ kind: "screen", index: project.screens.length });
    setSelected(null);
  };

  const duplicateScreen = (i: number) => {
    const src = project.screens[i];
    const s = { ...src, id: newId("s"), name: `${src.name} copy`, widgets: src.widgets.map((w) => ({ ...w, id: newId("w") })) };
    update((p) => ({ ...p, screens: [...p.screens.slice(0, i + 1), s, ...p.screens.slice(i + 1)] }));
    setView({ kind: "screen", index: i + 1 });
  };

  const removeScreen = (i: number) => {
    const s = project.screens[i];
    update((p) => {
      const screens = p.screens.filter((_, j) => j !== i);
      return {
        ...p,
        screens,
        defaultScreenId: p.defaultScreenId === s.id ? screens[0].id : p.defaultScreenId,
        rules: p.rules.filter((r) => r.screenId !== s.id),
      };
    });
    setView({ kind: "screen", index: Math.max(0, i - 1) });
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      replace(await readProjectFile(file));
      setView({ kind: "screen", index: 0 });
      setOpenError(null);
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : String(e));
    }
  };

  const navItem = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left font-medium ${active ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink hover:bg-ink/5"}`;

  return (
    <div className="h-full grid grid-rows-[56px_minmax(0,1fr)]">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4">
        <Wordmark />
        <span className="text-line">/</span>
        <span className="font-medium truncate max-w-[24ch]" title={project.name}>{project.name}</span>
        <SaveWarning />
        <div className="ml-2 flex items-center">
          <IconButton label="Undo" onClick={undo} disabled={!canUndo}><Undo2 size={16} /></IconButton>
          <IconButton label="Redo" onClick={redo} disabled={!canRedo}><Redo2 size={16} /></IconButton>
        </div>
        <div className="flex-1" />
        {error && <span className="text-[12px] text-danger truncate max-w-[40ch]" title={error}>{error}</span>}
        <label className="inline-flex h-9 items-center gap-2 rounded-md px-3 font-medium text-ink hover:bg-ink/5 cursor-pointer">
          <FolderOpen size={15} /> Open
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <Button variant="ghost" icon={<Save size={15} />} onClick={() => setSaving(true)}>Save</Button>
        <Button variant="primary" icon={<Usb size={16} />} onClick={() => setFlashing(true)} disabled={!compiled}>Flash to panel</Button>
      </header>

      <div className="grid min-h-0 grid-cols-[232px_minmax(0,1fr)]">
        <nav className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface p-3" aria-label="Project">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[13px] font-semibold text-muted">Screens</h2>
              <IconButton label="Add a screen" onClick={addScreen}><Plus size={15} /></IconButton>
            </div>
            {project.screens.map((s, i) => {
              const active = view.kind === "screen" && screenIndex === i;
              return (
                <div key={s.id} className={`group rounded-lg p-1.5 ${active ? "bg-raised shadow-sm ring-1 ring-line" : "hover:bg-ink/5"}`}>
                  <button type="button" className="block w-full text-left" onClick={() => { setView({ kind: "screen", index: i }); setSelected(null); }}>
                    <div className="rounded-[4px] bg-bezel p-1">
                      <ScreenPreview compiled={compiled} screen={i} values={values} now={now} className="block w-full bg-paper" />
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                      <span className="truncate font-medium">{s.name}</span>
                      {showing === i && <span className="size-1.5 shrink-0 rounded-full bg-accent" title="The panel shows this now" />}
                      {project.defaultScreenId === s.id && <span className="ml-auto text-[11px] text-muted">Default</span>}
                    </div>
                  </button>
                  {active && (
                    <div className="mt-1 flex gap-0.5">
                      <IconButton label="Duplicate screen" onClick={() => duplicateScreen(i)}><Copy size={14} /></IconButton>
                      <IconButton label="Delete screen" disabled={project.screens.length < 2} onClick={() => removeScreen(i)}><Trash2 size={14} /></IconButton>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="space-y-0.5 border-t border-line pt-3">
            <button type="button" className={navItem(view.kind === "rules")} onClick={() => setView({ kind: "rules" })}>
              <Workflow size={16} /> Rules
              {project.rules.length > 0 && <span className="ml-auto text-[12px] text-muted">{project.rules.length}</span>}
            </button>
            <button type="button" className={navItem(view.kind === "panel")} onClick={() => setView({ kind: "panel" })}>
              <Settings2 size={16} /> Panel
              {!project.wifi.some((n) => n.ssid.trim()) && <span className="ml-auto size-1.5 rounded-full bg-danger" title="Wi-Fi is not set" />}
            </button>
          </div>
          <div className="mt-auto space-y-1.5 px-1">
            <button type="button" onClick={() => setConfirmShowcase(true)} className="flex items-center gap-2 text-[13px] text-muted hover:text-ink">
              <Sparkles size={14} /> Load the showcase
            </button>
            <button type="button" onClick={() => setConfirmNew(true)} className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink">
              <LayoutGrid size={14} /> Start a new project
            </button>
          </div>
        </nav>

        <main className="min-h-0 overflow-auto">
          {openError && <div className="p-4"><Note tone="warn">{openError}</Note></div>}
          {view.kind === "screen" && (
            <div className="grid h-full min-h-[560px] grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-h-0 flex-col">
                <div className="flex items-center gap-3 px-6 pt-4">
                  <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setGallery(true)}>Add widget</Button>
                  <span className="text-[13px] text-muted">
                    {showing === screenIndex
                      ? "The panel would show this screen right now."
                      : `Right now the panel would show “${project.screens[showing]?.name}”.`}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <ScreenEditor
                    screenIndex={screenIndex}
                    compiled={compiled}
                    values={values}
                    now={now}
                    selected={selected}
                    onSelect={setSelected}
                    onAdd={() => setGallery(true)}
                    flashKey={flashKey}
                  />
                </div>
              </div>
              <aside className="overflow-y-auto border-l border-line bg-surface p-5">
                <Inspector screenIndex={screenIndex} selected={selected} onSelect={setSelected} compiled={compiled} status={status} />
              </aside>
            </div>
          )}
          {view.kind === "rules" && <RulesView compiled={compiled} values={values} now={now} sim={sim} onSim={setSim} />}
          {view.kind === "panel" && <PanelSettings />}
        </main>
      </div>

      <WidgetGallery open={gallery} onClose={() => setGallery(false)} onPick={addWidget} project={project}
        onConnect={() => { setGallery(false); setView({ kind: "panel" }); }} />
      <FlashDialog open={flashing} onClose={() => setFlashing(false)} compiled={compiled} onFlashed={() => setFlashKey((k) => k + 1)} />
      <Dialog open={saving} onClose={() => setSaving(false)} title="Save to a file">
        <div className="space-y-4">
          <p>Everything is already saved in this browser, and a copy goes onto the panel each time you flash. A file is for keeping a copy elsewhere or sharing a design.</p>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button onClick={() => { download(projectFile(project, true), fileName(project)); setSaving(false); }}>With Wi-Fi passwords and API keys</Button>
            <Button variant="primary" onClick={() => { download(projectFile(project, false), fileName(project)); setSaving(false); }}>Save without passwords and keys</Button>
          </div>
        </div>
      </Dialog>
      <Dialog open={confirmShowcase} onClose={() => setConfirmShowcase(false)} title="Load the showcase?">
        <div className="space-y-4">
          <p>Seven screens that use every widget, rules that follow the day and your trains, and four alerts. Your screens, rules and alerts are replaced; Wi-Fi, accounts and place stay. You can undo this.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmShowcase(false)}>Keep mine</Button>
            <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => {
              update(withShowcase);
              setView({ kind: "screen", index: 0 });
              setSelected(null);
              setConfirmShowcase(false);
            }}>Load the showcase</Button>
          </div>
        </div>
      </Dialog>
      <Dialog open={confirmNew} onClose={() => setConfirmNew(false)} title="Start a new project?">
        <div className="space-y-4">
          <p>This one is cleared from the browser. Save it to a file first if you want to come back to it — the panel keeps its own copy too. The saved copy leaves out Wi-Fi passwords and API keys.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirmNew(false)}>Keep working</Button>
            <Button onClick={() => download(projectFile(project, false), fileName(project))} icon={<Save size={15} />}>Save a copy</Button>
            <Button variant="danger" onClick={onNew}>Start over</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
