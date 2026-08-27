"use client";

import { CONDITION_KINDS, type Condition, type ConditionKind } from "@/lib/flow/conditions";
import { operatorsFor, OPERATORS } from "@/lib/facts";
import type { Fact } from "@/lib/extensions/manifest";

export interface WidgetFactGroup {
  widgetId: number;
  label: string;
  screenName: string;
  facts: Fact[];
}

const control =
  "w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] text-ink " +
  "outline-none transition-colors focus:border-accent/70";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A blank condition of each kind, so switching kind never leaves invalid state. */
function blank(kind: ConditionKind, groups: WidgetFactGroup[]): Condition {
  switch (kind) {
    case "time_between":
      return { kind, from: "07:00", to: "09:00" };
    case "weekday":
      return { kind, days: [1, 2, 3, 4, 5] };
    case "fact": {
      const group = groups[0];
      const fact = group?.facts[0];
      return {
        kind,
        widgetId: group?.widgetId ?? 0,
        factKey: fact?.key ?? "",
        operator: fact ? operatorsFor(fact.type)[0]?.id ?? "present" : "present",
        value: "",
      };
    }
    case "battery_below":
      return { kind, percent: 20 };
    case "wifi_below":
      return { kind, rssi: -70 };
    case "stale":
      return { kind, minutes: 60 };
    default:
      return { kind } as Condition;
  }
}

/**
 * Only the chosen kind's fields are shown, and the comparisons offered come
 * from the fact's declared type - so a duration is never offered "contains",
 * and a condition that could not possibly be true cannot be built.
 */
export function ConditionEditor({
  condition,
  groups,
  onChange,
}: {
  condition: Condition;
  groups: WidgetFactGroup[];
  onChange: (condition: Condition) => void;
}) {
  const group =
    condition.kind === "fact"
      ? groups.find((candidate) => candidate.widgetId === condition.widgetId)
      : undefined;

  const fact =
    condition.kind === "fact"
      ? group?.facts.find((candidate) => candidate.key === condition.factKey)
      : undefined;

  const operators = fact ? operatorsFor(fact.type) : [];
  const needsValue = condition.kind === "fact" && OPERATORS[condition.operator]?.needsValue;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-[12px] font-medium">When</label>
        <select
          value={condition.kind}
          onChange={(event) => onChange(blank(event.target.value as ConditionKind, groups))}
          className={control}
        >
          {CONDITION_KINDS.map((kind) => (
            <option key={kind.id} value={kind.id} disabled={kind.id === "fact" && !groups.length}>
              {kind.label}
              {kind.id === "fact" && !groups.length ? " (no widgets with values yet)" : ""}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          {CONDITION_KINDS.find((kind) => kind.id === condition.kind)?.summary}
        </p>
      </div>

      {condition.kind === "fact" && groups.length > 0 && (
        <>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium">From</label>
            <select
              value={condition.widgetId}
              onChange={(event) => {
                const next = groups.find((candidate) => candidate.widgetId === Number(event.target.value));
                const first = next?.facts[0];
                onChange({
                  ...condition,
                  widgetId: Number(event.target.value),
                  factKey: first?.key ?? "",
                  operator: first ? operatorsFor(first.type)[0]?.id ?? "present" : "present",
                });
              }}
              className={control}
            >
              {groups.map((candidate) => (
                <option key={candidate.widgetId} value={candidate.widgetId}>
                  {candidate.label} — on {candidate.screenName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium">Value</label>
            <select
              value={condition.factKey}
              onChange={(event) => {
                const next = group?.facts.find((candidate) => candidate.key === event.target.value);
                onChange({
                  ...condition,
                  factKey: event.target.value,
                  operator: next ? operatorsFor(next.type)[0]?.id ?? "present" : "present",
                });
              }}
              className={control}
            >
              {(group?.facts ?? []).map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.label}
                  {candidate.unit ? ` (${candidate.unit})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <select
              value={condition.operator}
              onChange={(event) => onChange({ ...condition, operator: event.target.value })}
              className={control}
            >
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.label}
                </option>
              ))}
            </select>

            {needsValue && (
              <input
                value={String(condition.value ?? "")}
                onChange={(event) => onChange({ ...condition, value: event.target.value })}
                placeholder={fact?.unit || "value"}
                className={control}
              />
            )}
          </div>
        </>
      )}

      {condition.kind === "time_between" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-[12px] font-medium">From</label>
            <input
              type="time"
              value={condition.from}
              onChange={(event) => onChange({ ...condition, from: event.target.value })}
              className={control}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-[12px] font-medium">Until</label>
            <input
              type="time"
              value={condition.to}
              onChange={(event) => onChange({ ...condition, to: event.target.value })}
              className={control}
            />
          </div>
        </div>
      )}

      {condition.kind === "weekday" && (
        <div className="flex flex-wrap gap-1">
          {DAYS.map((day, index) => {
            const on = condition.days.includes(index);
            return (
              <button
                key={day}
                type="button"
                onClick={() =>
                  onChange({
                    ...condition,
                    days: on
                      ? condition.days.filter((value) => value !== index)
                      : [...condition.days, index].sort(),
                  })
                }
                className={
                  "rounded-md border px-2 py-1 text-[11px] transition-colors " +
                  (on
                    ? "border-accent/60 bg-accent/10 text-ink"
                    : "border-line bg-raised text-muted hover:text-ink")
                }
              >
                {day}
              </button>
            );
          })}
        </div>
      )}

      {condition.kind === "battery_below" && (
        <div>
          <label className="mb-1.5 block text-[12px] font-medium">Below percent</label>
          <input
            type="number"
            value={condition.percent}
            onChange={(event) => onChange({ ...condition, percent: event.target.valueAsNumber || 0 })}
            className={control}
          />
        </div>
      )}

      {condition.kind === "wifi_below" && (
        <div>
          <label className="mb-1.5 block text-[12px] font-medium">Weaker than (dBm)</label>
          <input
            type="number"
            value={condition.rssi}
            onChange={(event) => onChange({ ...condition, rssi: event.target.valueAsNumber || 0 })}
            className={control}
          />
        </div>
      )}

      {condition.kind === "stale" && (
        <div>
          <label className="mb-1.5 block text-[12px] font-medium">Older than (minutes)</label>
          <input
            type="number"
            value={condition.minutes}
            onChange={(event) => onChange({ ...condition, minutes: event.target.valueAsNumber || 0 })}
            className={control}
          />
        </div>
      )}
    </div>
  );
}
