import { z } from "zod";

import { compare, describe, OPERATORS, valueAt } from "@/lib/facts";
import type { Fact } from "@/lib/extensions/manifest";

/**
 * What makes a transition fire.
 *
 * There is no AND, no OR and no nesting. Two ways of reaching a state are two
 * transitions into it, which is both simpler to build in a canvas and simpler
 * to explain when you are asking "why is my display showing this?".
 */

export const conditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("always") }),
  z.object({
    kind: z.literal("time_between"),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    kind: z.literal("weekday"),
    days: z.array(z.number().min(0).max(6)),
  }),
  z.object({
    kind: z.literal("fact"),
    widgetId: z.number(),
    factKey: z.string(),
    operator: z.string(),
    value: z.unknown().optional(),
  }),
  z.object({ kind: z.literal("battery_below"), percent: z.number() }),
  z.object({ kind: z.literal("charging") }),
  z.object({ kind: z.literal("wifi_below"), rssi: z.number() }),
  z.object({ kind: z.literal("button_pressed") }),
  z.object({ kind: z.literal("stale"), minutes: z.number() }),
]);

export type Condition = z.infer<typeof conditionSchema>;
export type ConditionKind = Condition["kind"];

/** What the editor offers, and how each reads in a sentence. */
export const CONDITION_KINDS: {
  id: ConditionKind;
  label: string;
  summary: string;
}[] = [
  { id: "always", label: "Always", summary: "Fires whenever it is looked at." },
  { id: "fact", label: "Extension value", summary: "Compares something a widget on this device knows." },
  { id: "time_between", label: "Between two times", summary: "A window on the clock, which may cross midnight." },
  { id: "weekday", label: "On certain days", summary: "One or more days of the week." },
  { id: "button_pressed", label: "Button pressed", summary: "The device woke because someone pressed its button." },
  { id: "battery_below", label: "Battery below", summary: "Charge has dropped under a percentage." },
  { id: "charging", label: "On USB power", summary: "The device is plugged in." },
  { id: "wifi_below", label: "Weak Wi-Fi", summary: "Signal is worse than a threshold." },
  { id: "stale", label: "Data is stale", summary: "Nothing has been fetched for a while." },
];

/** Everything a condition may need to answer, gathered once per evaluation. */
export interface Context {
  now: Date;
  device: {
    percentCharged: number | null;
    usbConnected: boolean;
    rssi: number | null;
    updateSource: string | null;
  };
  /** Widget id to its fetched payload and the facts its extension declares. */
  widgets: Map<number, { payload: unknown; facts: Fact[]; label: string; fetchedAt: Date | null }>;
}

const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

function parseClock(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** One evaluation, kept so the dashboard can show why a transition did or did not fire. */
export interface Trace {
  holds: boolean;
  sentence: string;
  /** The value the condition actually saw, rendered for a human. */
  actual?: string;
}

export function evaluate(condition: Condition, context: Context): Trace {
  switch (condition.kind) {
    case "always":
      return { holds: true, sentence: "Always" };

    case "time_between": {
      const from = parseClock(condition.from);
      const to = parseClock(condition.to);
      const sentence = `Between ${condition.from} and ${condition.to}`;
      if (from === undefined || to === undefined) return { holds: false, sentence };

      const now = minutesOfDay(context.now);
      // A window that ends before it starts has wrapped past midnight.
      const holds = from <= to ? now >= from && now < to : now >= from || now < to;
      const clock = `${String(context.now.getHours()).padStart(2, "0")}:${String(context.now.getMinutes()).padStart(2, "0")}`;
      return { holds, sentence, actual: `now ${clock}` };
    }

    case "weekday": {
      const holds = condition.days.includes(context.now.getDay());
      return { holds, sentence: "On certain days", actual: `today is day ${context.now.getDay()}` };
    }

    case "fact": {
      const widget = context.widgets.get(condition.widgetId);
      if (!widget) return { holds: false, sentence: "A widget that is no longer on this device" };

      const fact = widget.facts.find((candidate) => candidate.key === condition.factKey);
      if (!fact) {
        return { holds: false, sentence: `${widget.label}: unknown value "${condition.factKey}"` };
      }

      const actual = valueAt(widget.payload, fact.path);
      const holds = compare(actual, condition.operator, condition.value);

      return {
        holds,
        sentence: `${widget.label}: ${describe(fact.label, condition.operator, condition.value)}`,
        actual: actual === undefined ? "no value yet" : `${String(actual)}${fact.unit ? ` ${fact.unit}` : ""}`,
      };
    }

    case "battery_below": {
      const charge = context.device.percentCharged;
      return {
        holds: charge !== null && charge < condition.percent,
        sentence: `Battery below ${condition.percent}%`,
        actual: charge === null ? "not reported" : `${charge}%`,
      };
    }

    case "charging":
      return {
        holds: context.device.usbConnected,
        sentence: "On USB power",
        actual: context.device.usbConnected ? "plugged in" : "on battery",
      };

    case "wifi_below": {
      const rssi = context.device.rssi;
      return {
        holds: rssi !== null && rssi < condition.rssi,
        sentence: `Wi-Fi weaker than ${condition.rssi} dBm`,
        actual: rssi === null ? "not reported" : `${rssi} dBm`,
      };
    }

    case "button_pressed": {
      const source = context.device.updateSource ?? "";
      return {
        holds: /button/i.test(source),
        sentence: "Button pressed",
        actual: source || "no reason reported",
      };
    }

    case "stale": {
      const oldest = [...context.widgets.values()]
        .map((widget) => widget.fetchedAt)
        .filter((at): at is Date => at !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0];

      if (!oldest) return { holds: true, sentence: `Nothing fetched for ${condition.minutes} min`, actual: "never fetched" };

      const minutes = Math.floor((context.now.getTime() - oldest.getTime()) / 60_000);
      return {
        holds: minutes >= condition.minutes,
        sentence: `Nothing fetched for ${condition.minutes} min`,
        actual: `${minutes} min ago`,
      };
    }
  }
}

/** The one-line form shown on an edge in the canvas. */
export function summarise(condition: Condition, context?: Pick<Context, "widgets">): string {
  if (condition.kind !== "fact") {
    const kind = CONDITION_KINDS.find((candidate) => candidate.id === condition.kind);
    if (condition.kind === "time_between") return `${condition.from} - ${condition.to}`;
    if (condition.kind === "battery_below") return `Battery < ${condition.percent}%`;
    if (condition.kind === "wifi_below") return `Wi-Fi < ${condition.rssi} dBm`;
    if (condition.kind === "stale") return `Stale > ${condition.minutes} min`;
    return kind?.label ?? condition.kind;
  }

  const widget = context?.widgets.get(condition.widgetId);
  const fact = widget?.facts.find((candidate) => candidate.key === condition.factKey);
  const operator = OPERATORS[condition.operator];

  if (!fact || !operator) return "Extension value";
  return `${fact.label} ${operator.label}${operator.needsValue ? ` ${condition.value}` : ""}`;
}
