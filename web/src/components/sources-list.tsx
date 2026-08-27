"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";

import { SettingsForm } from "@/components/composer/settings-form";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { SourceKindOption, SourceOverview } from "@/lib/sources-overview";

const ago = (at: string | null) => {
  if (!at) return "never fetched";
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

export function SourcesList({
  sources,
  kinds,
}: {
  sources: SourceOverview[];
  kinds: SourceKindOption[];
}) {
  const [openId, setOpenId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const [problem, setProblem] = useState<string>();
  const router = useRouter();

  const add = async (extension: string) => {
    setBusy(true);
    setProblem(undefined);

    const response = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extension }),
    });

    setBusy(false);
    setAdding("");

    if (!response.ok) return setProblem((await response.json())?.error ?? "Could not add that.");

    const body = await response.json();
    if (body.reused) setProblem("There was already one asking exactly that, so it is being reused.");

    router.refresh();
  };

  /**
   * Typing edits a local copy; the server hears about it once you stop.
   *
   * Saving on every keystroke meant a round trip, a refetch of the source, and
   * a full server re-render per character - which is exactly as slow as it
   * sounds. The draft is what the form shows until the save lands.
   */
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const held = timers.current;
    return () => Object.values(held).forEach(clearTimeout);
  }, []);

  const edit = (id: string, settings: Record<string, unknown>) => {
    setDrafts((current) => ({ ...current, [id]: settings }));
    setSaving((current) => ({ ...current, [id]: true }));

    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      await fetch("/api/sources", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(id), settings }),
      });

      setSaving((current) => ({ ...current, [id]: false }));
      // The values it reports change with its settings, so the page catches up
      // once - not once per character.
      router.refresh();
    }, 700);
  };

  const remove = async (id: string) => {
    await fetch(`/api/sources?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1">
          <Select
            value={adding}
            ariaLabel="Add a source"
            placeholder="Add something to watch…"
            options={kinds.map((kind) => ({
              value: kind.extension,
              label: kind.label,
              hint: `${kind.factCount} value${kind.factCount === 1 ? "" : "s"} to decide on`,
            }))}
            onChange={(extension) => add(extension)}
          />
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch("/api/sources/refresh", { method: "POST" });
            setBusy(false);
            router.refresh();
          }}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-raised px-3.5 py-2 text-[13px] text-muted transition-colors hover:text-ink"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Fetch all now
        </button>
      </div>

      {problem && (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-[12px] leading-relaxed text-muted">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-faint" />
          {problem}
        </p>
      )}

      {sources.map((source) => {
        const open = openId === source.id;

        return (
          <div key={source.id} className="rounded-panel border border-line bg-surface">
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="text-[14px] font-medium">{source.label}</h2>
                  <span className="text-[11px] text-faint">{source.extensionLabel}</span>
                  <span className="text-[11px] text-faint">· {ago(source.fetchedAt)}</span>
                  {saving[source.id] && (
                    <span className="flex items-center gap-1 text-[11px] text-faint">
                      <Loader2 size={10} className="animate-spin" />
                      saving
                    </span>
                  )}
                </div>

                <p className="mt-1 text-[12px] text-faint">
                  {source.usedBy === 0
                    ? "Nothing reads from it yet"
                    : `${source.usedBy} check${source.usedBy === 1 ? "" : "s"} read from it` +
                      (source.usedOn.length ? ` on ${source.usedOn.join(", ")}` : "")}
                </p>

                {source.error && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-warn">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    {source.error}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? undefined : source.id)}
                  className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
                >
                  <Settings2 size={12} />
                  Settings
                </button>
                <button
                  type="button"
                  title={
                    source.usedBy
                      ? `${source.usedBy} check${source.usedBy === 1 ? "" : "s"} would stop working`
                      : "Nothing reads from it"
                  }
                  onClick={() => remove(source.id)}
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    source.usedBy
                      ? "text-warn hover:bg-warn/15"
                      : "text-faint hover:bg-danger/15 hover:text-danger",
                  )}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div className="grid gap-x-6 gap-y-1 border-t border-line px-4 py-3 sm:grid-cols-2">
              {source.facts.map((fact) => (
                <div key={fact.key} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[12px] text-faint">{fact.label}</span>
                  <span className="shrink-0 font-mono text-[12px]">
                    {source.values[fact.key]}
                    {fact.unit && <span className="text-faint"> {fact.unit}</span>}
                  </span>
                </div>
              ))}
            </div>

            {open && (
              <div className="border-t border-line p-4">
                <SettingsForm
                  fields={source.fields}
                  capabilitiesFrom={source.capabilitiesFrom}
                  values={drafts[source.id] ?? source.settings}
                  purpose="deciding"
                  onChange={(key, value) =>
                    edit(source.id, { ...(drafts[source.id] ?? source.settings), [key]: value })
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
