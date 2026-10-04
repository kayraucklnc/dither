// The project, with undo, saved to the browser as it changes.

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { Project } from "@/project/schema";
import { historyReducer, initialHistory } from "./history";
import { pruneImages, saveLocal } from "./storage";

const SAVE_DELAY = 300;

interface Store {
  project: Project;
  update: (fn: (p: Project) => Project, coalesce?: string) => void;
  replace: (project: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The last save to this browser failed (full or blocked storage). */
  saveFailed: boolean;
}

const Ctx = createContext<Store | null>(null);

/** Saves shortly after each change, and at once when the page is hidden or left. */
function useAutosave(project: Project): boolean {
  const [failed, setFailed] = useState(false);
  const latest = useRef(project);
  const pending = useRef(false);

  const save = useCallback(() => {
    pending.current = false;
    setFailed(!saveLocal(pruneImages(latest.current)));
  }, []);

  useEffect(() => {
    latest.current = project;
    pending.current = true;
    const t = setTimeout(save, SAVE_DELAY);
    return () => clearTimeout(t);
  }, [project, save]);

  useEffect(() => {
    const flush = () => pending.current && save();
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [save]);

  return failed;
}

export function ProjectProvider({ initial, children }: { initial: Project; children: ReactNode }) {
  const [state, dispatch] = useReducer(historyReducer, initial, initialHistory);
  const saveFailed = useAutosave(state.present);

  const update = useCallback((fn: (p: Project) => Project, coalesce?: string) => dispatch({ type: "update", fn, coalesce, at: Date.now() }), []);
  const replace = useCallback((project: Project) => dispatch({ type: "replace", project }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const value = useMemo<Store>(() => ({
    project: state.present, update, replace, undo, redo,
    canUndo: state.past.length > 0, canRedo: state.future.length > 0, saveFailed,
  }), [state, update, replace, undo, redo, saveFailed]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useProject outside ProjectProvider");
  return s;
}
