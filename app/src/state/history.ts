// Undo history for the project. Pure, so the store's behaviour is testable.

import type { Project } from "@/project/schema";

export interface History {
  past: Project[];
  present: Project;
  future: Project[];
  /** The last coalescing edit, so a burst of typing is one step of undo. */
  coalesce: { key: string; at: number } | null;
}

export type HistoryAction =
  | { type: "update"; fn: (p: Project) => Project; coalesce?: string; at: number }
  | { type: "replace"; project: Project }
  | { type: "undo" }
  | { type: "redo" };

const LIMIT = 100;
const COALESCE_MS = 1200;

export function initialHistory(project: Project): History {
  return { past: [], present: project, future: [], coalesce: null };
}

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case "update": {
      const next = action.fn(state.present);
      if (next === state.present) return state;
      const last = state.coalesce;
      const merge = action.coalesce !== undefined && last?.key === action.coalesce && action.at - last.at < COALESCE_MS;
      return {
        past: merge ? state.past : [...state.past, state.present].slice(-LIMIT),
        present: next,
        future: [],
        coalesce: action.coalesce !== undefined ? { key: action.coalesce, at: action.at } : null,
      };
    }
    case "replace":
      return { past: [...state.past, state.present].slice(-LIMIT), present: action.project, future: [], coalesce: null };
    case "undo":
      if (!state.past.length) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
        coalesce: null,
      };
    case "redo":
      if (!state.future.length) return state;
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1), coalesce: null };
  }
}
