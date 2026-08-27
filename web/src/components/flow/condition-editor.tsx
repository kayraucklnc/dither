"use client";

import { useState } from "react";
import { Plus, Settings2, TriangleAlert, X } from "lucide-react";

import { SettingsForm } from "@/components/composer/settings-form";
import { Select, type SelectOption } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { Field } from "@/lib/extensions/manifest";
import {
  defaultOperator,
  defaultValue,
  operatorsFor,
  OPERATORS,
  type Fact,
} from "@/lib/facts";
import { isGroup, type Condition } from "@/lib/flow/conditions";

/**
 * Building a check.
 *
 * One shape for everything: pick a source, pick one of the values it reports,
 * pick a comparison, give it something to compare against. The device, the
 * clock and every trigger you have added all appear in the same list, because
 * they are the same kind of thing.
 *
 * The comparisons offered come from the value's declared type, so a duration is
 * never offered "contains" and a check that could not possibly be true cannot
 * be built.
 */

export interface EditorSource {
  id: string;
  label: string;
  group: "device" | "clock" | "trigger";
  extension?: string;
  extensionLabel?: string;
  facts: Fact[];
  /** What each fact currently reads, so you can see what you are comparing to. */
  values: Record<string, string>;
  fields?: Field[];
  settings?: Record<string, unknown>;
  error?: string;
}

export interface SourceKind {
  extension: string;
  label: string;
  description: string;
}

const GROUP_LABEL = { device: "This device", clock: "Time", trigger: "Your sources" } as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ADD_SOURCE = "__add__";

const input =
  "w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] text-ink " +
  "outline-none transition-colors focus:border-accent/70";

export function blankCondition(sources: EditorSource[]): Condition {
  const source = sources[0];
  const fact = source?.facts[0];

  return {
    kind: "fact",
    sourceId: source?.id ?? "clock",
    factKey: fact?.key ?? "time_of_day",
    operator: fact ? defaultOperator(fact.type) : "between",
    value: fact ? defaultValue(fact.type) : ["07:00", "09:00"],
  };
}

function Operand({
  fact,
  operator,
  value,
  onChange,
}: {
  fact: Fact;
  operator: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const arity = OPERATORS[operator]?.arity ?? "one";

  if (arity === "none") return null;

  if (arity === "range") {
    const range = Array.isArray(value) ? value : ["07:00", "09:00"];

    return (
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={String(range[0] ?? "")}
          onChange={(event) => onChange([event.target.value, range[1]])}
          className={input}
        />
        <span className="shrink-0 text-[12px] text-faint">and</span>
        <input
          type="time"
          value={String(range[1] ?? "")}
          onChange={(event) => onChange([range[0], event.target.value])}
          className={input}
        />
      </div>
    );
  }

  if (arity === "set") {
    const days = (Array.isArray(value) ? value : []).map(Number);

    return (
      <div className="flex flex-wrap gap-1">
        {DAYS.map((day, index) => {
          const on = days.includes(index);
          return (
            <button
              key={day}
              type="button"
              onClick={() =>
                onChange(
                  on ? days.filter((value) => value !== index) : [...days, index].sort((a, b) => a - b),
                )
              }
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition-colors",
                on
                  ? "border-accent/60 bg-accent/15 text-ink"
                  : "border-line bg-raised text-muted hover:text-ink",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    );
  }

  if (fact.type === "time") {
    return (
      <input
        type="time"
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        className={input}
      />
    );
  }

  const numeric = fact.type === "number" || fact.type === "duration";

  return (
    <div className="flex items-center gap-2">
      <input
        type={numeric ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(event) => onChange(numeric ? event.target.valueAsNumber : event.target.value)}
        placeholder={fact.unit || "value"}
        className={input}
      />
      {fact.unit && <span className="shrink-0 text-[12px] text-faint">{fact.unit}</span>}
    </div>
  );
}

function Leaf({
  condition,
  sources,
  kinds,
  onChange,
  onAddSource,
  onEditSource,
}: {
  condition: Extract<Condition, { kind: "fact" }>;
  sources: EditorSource[];
  kinds: SourceKind[];
  onChange: (condition: Condition) => void;
  onAddSource: (extension: string) => void;
  onEditSource: (id: string, settings: Record<string, unknown>) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const source = sources.find((candidate) => candidate.id === condition.sourceId);
  const fact = source?.facts.find((candidate) => candidate.key === condition.factKey);

  const sourceOptions: SelectOption<string>[] = [
    ...sources.map((candidate) => ({
      value: candidate.id,
      label: candidate.label,
      hint: candidate.group === "trigger" ? candidate.extensionLabel : undefined,
      group: GROUP_LABEL[candidate.group],
    })),
    ...kinds.map((kind) => ({
      value: `${ADD_SOURCE}${kind.extension}`,
      label: `Add ${kind.label}…`,
      hint: kind.description,
      group: "Add a source",
    })),
  ];

  return (
    <div className="space-y-2.5">
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
          Source
        </label>
        <Select
          value={condition.sourceId}
          options={sourceOptions}
          ariaLabel="Source"
          onChange={(next) => {
            if (next.startsWith(ADD_SOURCE)) return onAddSource(next.slice(ADD_SOURCE.length));

            const chosen = sources.find((candidate) => candidate.id === next);
            const first = chosen?.facts[0];

            onChange({
              kind: "fact",
              sourceId: next,
              factKey: first?.key ?? "",
              operator: first ? defaultOperator(first.type) : "present",
              value: first ? defaultValue(first.type) : "",
            });
          }}
        />
      </div>

      {source?.error && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warn">
          <TriangleAlert size={11} className="mt-0.5 shrink-0" />
          {source.error}
        </p>
      )}

      {source && source.group === "trigger" && source.fields && source.fields.length > 0 && (
        <div className="rounded-lg border border-line bg-ground/50">
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="flex w-full items-center gap-1.5 px-2.5 py-2 text-[12px] text-muted transition-colors hover:text-ink"
          >
            <Settings2 size={12} />
            {settingsOpen ? "Hide" : "Settings for"} {source.label}
          </button>

          {settingsOpen && (
            <div className="border-t border-line p-3">
              <SettingsForm
                fields={source.fields}
                values={source.settings ?? {}}
                onChange={(key, value) =>
                  onEditSource(source.id, { ...(source.settings ?? {}), [key]: value })
                }
              />
            </div>
          )}
        </div>
      )}

      {source && (
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
            Value
          </label>
          <Select
            value={condition.factKey}
            ariaLabel="Value"
            options={source.facts.map((candidate) => ({
              value: candidate.key,
              label: candidate.label,
              hint:
                source.values[candidate.key] !== undefined
                  ? `now: ${source.values[candidate.key]}${candidate.unit ? ` ${candidate.unit}` : ""}`
                  : undefined,
            }))}
            onChange={(next) => {
              const chosen = source.facts.find((candidate) => candidate.key === next);
              onChange({
                ...condition,
                factKey: next,
                operator: chosen ? defaultOperator(chosen.type) : "present",
                value: chosen ? defaultValue(chosen.type) : "",
              });
            }}
          />
        </div>
      )}

      {fact && (
        <>
          <Select
            value={condition.operator}
            ariaLabel="Comparison"
            options={operatorsFor(fact.type).map((operator) => ({
              value: operator.id,
              label: operator.label,
            }))}
            onChange={(next) =>
              onChange({
                ...condition,
                operator: next,
                value:
                  OPERATORS[next]?.arity === OPERATORS[condition.operator]?.arity
                    ? condition.value
                    : defaultValue(fact.type),
              })
            }
          />

          <Operand
            fact={fact}
            operator={condition.operator}
            value={condition.value}
            onChange={(value) => onChange({ ...condition, value })}
          />
        </>
      )}
    </div>
  );
}

export function ConditionEditor({
  condition,
  sources,
  kinds,
  onChange,
  onAddSource,
  onEditSource,
  depth = 0,
}: {
  condition: Condition;
  sources: EditorSource[];
  kinds: SourceKind[];
  onChange: (condition: Condition) => void;
  onAddSource: (extension: string) => void;
  onEditSource: (id: string, settings: Record<string, unknown>) => void;
  depth?: number;
}) {
  if (!isGroup(condition)) {
    return (
      <div className="space-y-3">
        <Leaf
          condition={condition}
          sources={sources}
          kinds={kinds}
          onChange={onChange}
          onAddSource={onAddSource}
          onEditSource={onEditSource}
        />

        {depth === 0 && (
          <button
            type="button"
            onClick={() =>
              onChange({ kind: "all", conditions: [condition, blankCondition(sources)] })
            }
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
          >
            <Plus size={12} />
            Needs another condition too
          </button>
        )}
      </div>
    );
  }

  const members = condition.conditions;

  return (
    <div
      className={cn(
        "space-y-2.5",
        depth > 0 && "rounded-lg border border-line bg-ground/40 p-2.5",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-line bg-ground p-0.5">
          {(["all", "any"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...condition, kind: mode })}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                condition.kind === mode ? "bg-accent text-accent-ink" : "text-muted hover:text-ink",
              )}
            >
              {mode === "all" ? "All of" : "Any of"}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-faint">
          {condition.kind === "all" ? "every one must hold" : "one is enough"}
        </p>
      </div>

      <div className="space-y-2">
        {members.map((member, index) => (
          <div key={index} className="rounded-lg border border-line bg-surface p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-faint">
                {index === 0 ? "when" : condition.kind === "all" ? "and" : "or"}
              </span>
              <button
                type="button"
                onClick={() => {
                  const rest = members.filter((_, at) => at !== index);
                  // A group of one is just that condition; collapse it rather
                  // than leaving a group that reads as a group but is not.
                  onChange(rest.length === 1 ? rest[0] : { ...condition, conditions: rest });
                }}
                className="rounded p-1 text-faint transition-colors hover:bg-danger/15 hover:text-danger"
              >
                <X size={12} />
              </button>
            </div>

            <ConditionEditor
              condition={member}
              sources={sources}
              kinds={kinds}
              depth={depth + 1}
              onChange={(next) =>
                onChange({
                  ...condition,
                  conditions: members.map((old, at) => (at === index ? next : old)),
                })
              }
              onAddSource={onAddSource}
              onEditSource={onEditSource}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            onChange({ ...condition, conditions: [...members, blankCondition(sources)] })
          }
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
        >
          <Plus size={12} />
          Condition
        </button>

        {depth < 1 && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...condition,
                conditions: [
                  ...members,
                  {
                    kind: condition.kind === "all" ? "any" : "all",
                    conditions: [blankCondition(sources), blankCondition(sources)],
                  },
                ],
              })
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
          >
            <Plus size={12} />
            Group
          </button>
        )}
      </div>
    </div>
  );
}
