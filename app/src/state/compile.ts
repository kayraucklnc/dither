// The project, compiled — re-run shortly after every change.

import { useEffect, useState } from "react";
import { library } from "@/assets/browser";
import { FONTS } from "@/assets/library";
import { compile, type Compiled } from "@/compiler";
import { browserPicture } from "@/compiler/picture-browser";
import { getBoard } from "@/device";
import type { Project } from "@/project/schema";
import { decodeFont, type Font } from "@/runtime/assets";
import { gzip } from "./storage";

let fontsPromise: Promise<Map<string, Font>> | null = null;

export function loadBrowserFonts(): Promise<Map<string, Font>> {
  fontsPromise ??= Promise.all(FONTS.map(async (f) => [f.id, decodeFont(await library.font(f))] as const)).then((e) => new Map(e));
  return fontsPromise;
}

export function boardPanel(board: string): { width: number; height: number } {
  const b = getBoard(board);
  return b ? { width: b.width, height: b.height } : { width: 800, height: 480 };
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// What became of each project handed to the compiler. Projects are immutable,
// so a view given only `compiled` can tell whether it still matches the project.
const outcomes = new WeakMap<Project, { compiled: Compiled } | { error: string }>();

export async function compileInBrowser(project: Project): Promise<Compiled> {
  try {
    const fonts = await loadBrowserFonts();
    const compiled = await compile(project, { library, fonts, picture: browserPicture(project.images), gzip, boardPanel });
    outcomes.set(project, { compiled });
    return compiled;
  } catch (e) {
    outcomes.set(project, { error: errorText(e) });
    throw e;
  }
}

export type Freshness = { state: "fresh" } | { state: "compiling" } | { state: "failed"; error: string };

/** Whether `compiled` is the result of compiling exactly this project. */
export function freshness(project: Project, compiled: Compiled | null): Freshness {
  const o = outcomes.get(project);
  if (!o) return { state: "compiling" };
  if ("error" in o) return { state: "failed", error: o.error };
  return o.compiled === compiled ? { state: "fresh" } : { state: "compiling" };
}

export interface CompileState {
  /** The last good result — kept through a failed compile so the preview stays up. */
  compiled: Compiled | null;
  error: string | null;
  busy: boolean;
  /** `compiled` was built from the current project; flashing requires it. */
  fresh: boolean;
}

export function useCompiled(project: Project, delay = 120): CompileState {
  const [state, setState] = useState<CompileState>({ compiled: null, error: null, busy: true, fresh: false });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, busy: true, fresh: false }));
    const t = setTimeout(() => {
      compileInBrowser(project).then(
        (compiled) => !cancelled && setState({ compiled, error: null, busy: false, fresh: true }),
        (e: unknown) => !cancelled && setState((s) => ({ ...s, error: errorText(e), busy: false, fresh: false })),
      );
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [project, delay]);
  return state;
}
