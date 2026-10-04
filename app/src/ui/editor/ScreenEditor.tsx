// The panel, life size or as large as fits, with the widgets on it you can
// pick up, move and resize. What is drawn underneath is the real render.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Plus } from "lucide-react";
import type { Compiled } from "@/compiler";
import { CELL, cellsToBox, gridOf, rotated } from "@/compiler/grid";
import { envOf, extensionFor, widgetTitle } from "@/compiler/widgets";
import type { Project, Widget } from "@/project/schema";
import type { Value } from "@/runtime/types";
import { boardPanel } from "@/state/compile";
import { useProject } from "@/state/project-store";
import { Button } from "../kit";
import { ScreenPreview } from "../Preview";
import { clampWidget, overlapping } from "./placement";

interface Props {
  screenIndex: number;
  compiled: Compiled | null;
  values: ReadonlyMap<string, Value>;
  now: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  flashKey: number;
}

type Drag = { id: string; mode: "move" | "resize"; startX: number; startY: number; origin: Widget };

const NOT_OURS = "dialog, button, input, select, textarea, [role=radiogroup], [contenteditable]:not([contenteditable=false])";

/** Editor shortcuts apply only while focus is on the panel (or nowhere), and never with a modifier other than shift. */
function ownsKey(e: KeyboardEvent, area: HTMLElement | null): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const t = e.target instanceof Element ? e.target : null;
  if (!t || t === document.body) return true;
  return !t.closest(NOT_OURS) && (area?.contains(t) ?? false);
}

export function updateWidget(p: Project, screenIndex: number, id: string, fn: (w: Widget) => Widget): Project {
  return {
    ...p,
    screens: p.screens.map((s, i) => (i !== screenIndex ? s : { ...s, widgets: s.widgets.map((w) => (w.id === id ? fn(w) : w)) })),
  };
}

export function ScreenEditor({ screenIndex, compiled, values, now, selected, onSelect, onAdd, flashKey }: Props) {
  const { project, update } = useProject();
  const screen = project.screens[screenIndex];
  const panel = rotated(boardPanel(project.board), project.rotation);
  const grid = gridOf(panel);
  const env = envOf(project);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<Widget | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.max(0.3, Math.min(1.5, (width - 48) / panel.width, (height - 48) / panel.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [panel.width, panel.height]);

  const clashes = useMemo(() => overlapping(screen.widgets), [screen.widgets]);

  const commit = useCallback((w: Widget) => {
    update((p) => updateWidget(p, screenIndex, w.id, () => w));
  }, [update, screenIndex]);

  const onPointerDown = (e: ReactPointerEvent, w: Widget, mode: Drag["mode"]) => {
    if (e.button !== 0 || !e.isPrimary) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(w.id);
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ id: w.id, mode, startX: e.clientX, startY: e.clientY, origin: w });
    setGhost(w);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const dx = Math.round((e.clientX - drag.startX) / (CELL * scale));
    const dy = Math.round((e.clientY - drag.startY) / (CELL * scale));
    const o = drag.origin;
    const min = extensionFor(o.type)?.size.min ?? [1, 1];
    const next = drag.mode === "move" ? { ...o, x: o.x + dx, y: o.y + dy } : { ...o, w: o.w + dx, h: o.h + dy };
    setGhost(clampWidget(next, grid, min));
  };

  const cancelDrag = () => {
    setDrag(null);
    setGhost(null);
  };

  const onPointerUp = () => {
    if (drag && ghost && (ghost.x !== drag.origin.x || ghost.y !== drag.origin.y || ghost.w !== drag.origin.w || ghost.h !== drag.origin.h)) {
      commit(ghost);
    }
    setDrag(null);
    setGhost(null);
  };

  // Keyboard: arrows move, shift+arrows resize, delete removes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || !ownsKey(e, wrap.current)) return;
      const w = screen.widgets.find((x) => x.id === selected);
      if (!w) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        update((p) => ({ ...p, screens: p.screens.map((s, i) => (i !== screenIndex ? s : { ...s, widgets: s.widgets.filter((x) => x.id !== w.id) })) }));
        onSelect(null);
        return;
      }
      if (e.key === "Escape") return onSelect(null);
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const min = extensionFor(w.type)?.size.min ?? [1, 1];
      const next = e.shiftKey ? { ...w, w: w.w + d[0], h: w.h + d[1] } : { ...w, x: w.x + d[0], y: w.y + d[1] };
      commit(clampWidget(next, grid, min));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, screen.widgets, grid, commit, update, screenIndex, onSelect]);

  const box = (w: Widget) => {
    const b = cellsToBox(w.x, w.y, w.w, w.h, panel);
    return { left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale };
  };

  return (
    <div ref={wrap} className="relative h-full w-full grid place-items-center overflow-hidden" onPointerDown={(e) => e.button === 0 && onSelect(null)}>
      <div className="rounded-[14px] bg-bezel p-3.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)]">
        <div className="relative" style={{ width: panel.width * scale, height: panel.height * scale }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={cancelDrag} onLostPointerCapture={() => drag && cancelDrag()}>
          <ScreenPreview
            key={flashKey}
            compiled={compiled}
            screen={screenIndex}
            values={values}
            now={now}
            className={`absolute inset-0 h-full w-full bg-paper ${flashKey ? "eink-refresh" : ""}`}
          />
          {drag && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "linear-gradient(to right, rgba(108,76,232,.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(108,76,232,.22) 1px, transparent 1px)",
                backgroundSize: `${CELL * scale}px ${CELL * scale}px`,
              }}
            />
          )}
          {screen.widgets.map((w) => {
            const shown = ghost && ghost.id === w.id ? ghost : w;
            const isSel = selected === w.id;
            return (
              <div
                key={w.id}
                role="button"
                tabIndex={0}
                aria-label={`${widgetTitle(w, env)} widget`}
                aria-pressed={isSel}
                onPointerDown={(e) => onPointerDown(e, w, "move")}
                onFocus={() => onSelect(w.id)}
                className={`absolute group rounded-[3px] cursor-move outline-none ${isSel ? "ring-2 ring-accent" : "hover:ring-1 hover:ring-accent/60"} ${clashes.has(w.id) && !isSel ? "ring-1 ring-danger/50" : ""}`}
                style={box(shown)}
              >
                {isSel && (
                  <>
                    <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-white">
                      {widgetTitle(w, env)} · {shown.w}×{shown.h}
                    </span>
                    <span
                      onPointerDown={(e) => onPointerDown(e, w, "resize")}
                      className="absolute -right-1.5 -bottom-1.5 size-3.5 rounded-sm border-2 border-accent bg-raised cursor-nwse-resize"
                      aria-hidden="true"
                    />
                  </>
                )}
              </div>
            );
          })}
          {screen.widgets.length === 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <Button variant="primary" size="lg" icon={<Plus size={16} />} onPointerDown={(e) => e.stopPropagation()} onClick={onAdd}>
                Add your first widget
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
