// What can be done to a widget, from the canvas, the inspector or the keyboard.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { gridOf, rotated } from "@/compiler/grid";
import { envOf, extensionFor, widgetTitle } from "@/compiler/widgets";
import { newId } from "@/project/ids";
import type { Project, Widget } from "@/project/schema";
import { boardPanel } from "@/state/compile";
import { useProject } from "@/state/project-store";
import { useToast } from "../toast";
import { clampWidget } from "./placement";

export interface WidgetActions {
  duplicate: (w: Widget) => void;
  remove: (w: Widget) => void;
  toFront: (w: Widget) => void;
  toBack: (w: Widget) => void;
}

export const withWidgets = (p: Project, screenIndex: number, fn: (ws: Widget[]) => Widget[]): Project => ({
  ...p,
  screens: p.screens.map((s, i) => (i === screenIndex ? { ...s, widgets: fn(s.widgets) } : s)),
});

export function useWidgetActions(screenIndex: number, onSelect: (id: string | null) => void): WidgetActions {
  const { project, update, undo } = useProject();
  const toast = useToast();
  const latest = useRef(project);
  useEffect(() => {
    latest.current = project;
  }, [project]);

  const duplicate = useCallback((w: Widget) => {
    const p = latest.current;
    const grid = gridOf(rotated(boardPanel(p.board), p.rotation));
    const copy = clampWidget({ ...w, id: newId("w"), x: w.x + 1, y: w.y + 1 }, grid, extensionFor(w.type)?.size.min ?? [1, 1]);
    update((q) => withWidgets(q, screenIndex, (ws) => [...ws, copy]));
    onSelect(copy.id);
  }, [update, screenIndex, onSelect]);

  const remove = useCallback((w: Widget) => {
    const before = latest.current;
    const at = before.screens[screenIndex]?.widgets.findIndex((x) => x.id === w.id) ?? -1;
    if (at < 0) return;
    const after = withWidgets(before, screenIndex, (ws) => ws.filter((x) => x.id !== w.id));
    update(() => after);
    onSelect(null);
    toast(`Removed ${widgetTitle(w, envOf(before))}`, {
      label: "Undo",
      run: () => {
        // Undo only steps back if nothing else changed since; otherwise put the widget back where it was.
        if (latest.current === after) undo();
        else update((q) => withWidgets(q, screenIndex, (ws) => (ws.some((x) => x.id === w.id) ? ws : [...ws.slice(0, at), w, ...ws.slice(at)])));
        onSelect(w.id);
      },
    });
  }, [update, undo, screenIndex, onSelect, toast]);

  const toFront = useCallback((w: Widget) => {
    update((p) => withWidgets(p, screenIndex, (ws) => [...ws.filter((x) => x.id !== w.id), w]));
  }, [update, screenIndex]);

  const toBack = useCallback((w: Widget) => {
    update((p) => withWidgets(p, screenIndex, (ws) => [w, ...ws.filter((x) => x.id !== w.id)]));
  }, [update, screenIndex]);

  return useMemo(() => ({ duplicate, remove, toFront, toBack }), [duplicate, remove, toFront, toBack]);
}
