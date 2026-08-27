"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Plus, Trash2 } from "lucide-react";

import { ConditionEditor, type EditorSource, type SourceKind } from "@/components/flow/condition-editor";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { summarise, type Condition } from "@/lib/flow/conditions";
import type { Source } from "@/lib/flow/sources";

/**
 * Notices: what this device says on top of whatever screen it is showing.
 *
 * Separate from the tree on purpose. The tree answers "which screen", and
 * every question in it is exclusive - you end up on one leaf. A notice is
 * additive, so a service alert can appear while you are looking at your
 * calendar without a branch in the tree for every pairing of screen and
 * warning.
 */

export interface NoticeRow {
  id: number;
  label: string;
  condition: Condition;
  icon: string;
  text: string;
  loud: boolean;
  enabled: boolean;
}

export interface Suggestion {
  sourceId: string;
  sourceLabel: string;
  key: string;
  label: string;
  icon: string;
  text: string;
  loud: boolean;
  condition: Condition;
}

const ICONS = [
  "alert", "info", "umbrella", "rain", "snow", "thermometer", "wind",
  "train", "bus", "tram", "walk", "calendar", "clock", "video", "pin",
  "battery", "wifi", "bolt", "currency", "chart", "close", "check", "dot",
];

const input =
  "w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] text-ink " +
  "outline-none transition-colors focus:border-accent/70";

export function NoticesPanel({
  deviceId,
  sources,
  sourceKinds,
  sourceMap,
  onChanged,
}: {
  deviceId: number;
  sources: EditorSource[];
  sourceKinds: SourceKind[];
  sourceMap: Map<string, Source>;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/devices/${deviceId}/notices`);
    if (!response.ok) return;

    const body = await response.json();
    setRows(body.notices);
    setSuggestions(body.suggestions);
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (notice: Partial<NoticeRow> & { condition: Condition }) => {
    await fetch(`/api/devices/${deviceId}/notices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notice),
    });
    await load();
    onChanged();
  };

  const update = async (id: number, patch: Partial<NoticeRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

    await fetch(`/api/devices/${deviceId}/notices`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    onChanged();
  };

  const remove = async (id: number) => {
    setRows((current) => current.filter((row) => row.id !== id));
    await fetch(`/api/devices/${deviceId}/notices?id=${id}`, { method: "DELETE" });
    await load();
    onChanged();
  };

  return (
    <div className="space-y-4 p-4">
      <p className="text-[12px] leading-relaxed text-faint">
        Additive, unlike the tree. A notice appears on whichever screen is showing, as long as that
        screen has somewhere to put it.
      </p>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => {
            const open = openId === row.id;

            return (
              <div
                key={row.id}
                className={cn(
                  "rounded-lg border bg-raised transition-colors",
                  row.enabled ? "border-line" : "border-line/50 opacity-60",
                )}
              >
                <div className="flex items-start gap-2 p-2.5">
                  <button
                    type="button"
                    onClick={() => update(row.id, { enabled: !row.enabled })}
                    title={row.enabled ? "Turn off" : "Turn on"}
                    className={cn(
                      "mt-0.5 h-4 w-7 shrink-0 rounded-full border p-0.5 transition-colors",
                      row.enabled ? "border-accent/60 bg-accent/30" : "border-line bg-ground",
                    )}
                  >
                    <span
                      className={cn(
                        "block h-2.5 w-2.5 rounded-full transition-transform",
                        row.enabled ? "translate-x-3 bg-accent" : "bg-faint",
                      )}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : row.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[12px] font-medium">
                      {row.label || row.text || "Notice"}
                    </span>
                    <span className="block truncate text-[11px] text-faint">
                      when {summarise(row.condition, { sources: sourceMap })}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => remove(row.id)}
                    className="shrink-0 rounded p-1 text-faint transition-colors hover:bg-danger/15 hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {open && (
                  <div className="space-y-3 border-t border-line p-3">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
                        Says
                      </label>
                      <input
                        value={row.text}
                        onChange={(event) => update(row.id, { text: event.target.value })}
                        placeholder="Short line to show"
                        className={input}
                      />
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
                          Icon
                        </label>
                        <Select
                          value={row.icon}
                          ariaLabel="Icon"
                          options={ICONS.map((icon) => ({ value: icon, label: icon }))}
                          onChange={(icon) => update(row.id, { icon })}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
                          Emphasis
                        </label>
                        <button
                          type="button"
                          onClick={() => update(row.id, { loud: !row.loud })}
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-[12px] transition-colors",
                            row.loud
                              ? "border-ink bg-ink text-ground"
                              : "border-line bg-ground text-muted",
                          )}
                        >
                          {row.loud ? "Inverted" : "Plain"}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-line pt-3">
                      <ConditionEditor
                        condition={row.condition}
                        sources={sources}
                        kinds={sourceKinds}
                        onChange={(condition) => update(row.id, { condition })}
                        onAddSource={() => {}}
                        onEditSource={() => {}}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
            <Megaphone size={11} />
            Your sources offer
          </p>
          <div className="space-y-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.sourceId}-${suggestion.key}`}
                type="button"
                onClick={() =>
                  add({
                    label: suggestion.label,
                    condition: suggestion.condition,
                    icon: suggestion.icon,
                    text: suggestion.text,
                    loud: suggestion.loud,
                  })
                }
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-raised"
              >
                <Plus size={13} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px]">{suggestion.label}</span>
                  <span className="block truncate text-[11px] text-faint">
                    {suggestion.sourceLabel}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && suggestions.length === 0 && (
        <p className="rounded-lg border border-dashed border-line p-4 text-center text-[12px] text-faint">
          Add a source in the Decide tab and its alerts will be offered here.
        </p>
      )}
    </div>
  );
}
