// A quiet label by the panel preview saying where its numbers come from:
// fetched live by this browser, or example data. The panel fetches its own.

import { useId, useState } from "react";
import { Activity } from "lucide-react";
import type { Compiled } from "@/compiler";
import type { SourceStatus } from "@/state/simulation";

export interface PreviewData {
  readonly live: readonly string[];
  readonly loading: readonly string[];
  readonly sample: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * The sources a compiled screen reads — its widgets, and the alerts drawn over
 * it — found by the references its elements make ("s0.temp", or "m0.x" for a
 * list merged from several sources).
 */
export function screenSources(compiled: Compiled | null, screen: number): string[] {
  const elements = compiled?.runtime.screens[screen]?.elements;
  if (!elements) return [];
  const text = JSON.stringify(elements);
  const refers = (id: string) => new RegExp(`(?<![\\w$])${id}\\.`).test(text);
  const merged = (compiled.runtime.merges ?? []).filter((m) => refers(m.id)).flatMap((m) => m.from);
  return compiled.sources.map((s) => s.source.id).filter((id) => refers(id) || merged.includes(id));
}

/** The sources a screen reads, grouped by where the preview got them. */
export function previewData(compiled: Compiled | null, screen: number, status: ReadonlyMap<string, SourceStatus>): PreviewData {
  const used = screenSources(compiled, screen);
  const live: string[] = [];
  const loading: string[] = [];
  const sample: { id: string; reason: string }[] = [];
  for (const id of used) {
    const st = status.get(id);
    if (!st || st.state === "loading") loading.push(id);
    else if (st.state === "live") live.push(id);
    else sample.push({ id, reason: st.reason });
  }
  return { live, loading, sample };
}

function headline(data: PreviewData, name: (id: string) => string): string {
  if (data.sample.length > 0) {
    const names = [...new Set(data.sample.map((s) => name(s.id)))];
    return `Preview · example data for ${names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ")}`;
  }
  if (data.loading.length > 0) return "Preview · fetching…";
  return "Preview · live data";
}

export function PreviewBadge({ data, name, onActivity }: {
  data: PreviewData;
  name: (id: string) => string;
  onActivity: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tip = useId();
  if (data.live.length + data.loading.length + data.sample.length === 0) return null;
  const example = data.sample.length > 0;
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-describedby={tip} aria-expanded={open} onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)} onBlur={(e) => !e.currentTarget.parentElement?.contains(e.relatedTarget) && setOpen(false)}
        className="inline-flex max-w-[44ch] items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[12px] text-muted hover:text-ink">
        <span className={`size-1.5 shrink-0 rounded-full ${example ? "bg-muted/60" : "bg-accent"}`} />
        <span className="truncate">{headline(data, name)}</span>
      </button>
      {open && (
        <div id={tip} role="tooltip"
          className="absolute right-0 top-full z-30 mt-1.5 w-[340px] space-y-2 rounded-lg border border-line bg-raised p-3 text-[13px] text-ink shadow-lg">
          <p>This preview is drawn in your browser. Where a server lets a browser ask, it fetches live data; otherwise it shows example data.</p>
          {example && (
            <ul className="space-y-1 text-muted">
              {data.sample.map((s) => <li key={s.id}><span className="font-medium text-ink">{name(s.id)}</span>: {s.reason}</li>)}
            </ul>
          )}
          <p className="text-muted">The panel fetches its own data over Wi-Fi every time it wakes, so it shows the real numbers.</p>
          <button type="button" onClick={() => { setOpen(false); onActivity(); }}
            className="inline-flex items-center gap-1.5 font-medium text-accent hover:text-accent-strong">
            <Activity size={14} /> See what the panel actually did
          </button>
        </div>
      )}
    </div>
  );
}
