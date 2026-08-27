import type { Device, Trigger } from "@/lib/db/schema";
import type { Fact } from "@/lib/facts";

/**
 * Everything a check can ask about.
 *
 * Three groups, one shape. The device reports on itself, the clock reports the
 * time, and every trigger you add reports whatever its extension declares.
 * Because they are the same shape, adding a connection that knows whether your
 * laptop is awake needs no new check kind and no editor change - it declares
 * `online: boolean` and the branch is buildable straight away.
 */

export const DEVICE_SOURCE = "device";
export const CLOCK_SOURCE = "clock";

export interface Source {
  id: string;
  label: string;
  group: "device" | "clock" | "trigger";
  /** Present for triggers, so the editor can offer its settings. */
  extension?: string;
  facts: Fact[];
  payload: unknown;
  fetchedAt: Date | null;
  error?: string;
}

const DEVICE_FACTS: Fact[] = [
  { key: "battery_percent", label: "Battery", type: "number", path: "battery_percent", unit: "%" },
  { key: "on_usb", label: "Plugged in", type: "boolean", path: "on_usb", unit: "" },
  { key: "wifi_strength", label: "Wi-Fi strength", type: "number", path: "wifi_strength", unit: "dBm" },
  { key: "woke_by_button", label: "Woken by its button", type: "boolean", path: "woke_by_button", unit: "" },
  { key: "minutes_since_seen", label: "Last heard from", type: "duration", path: "minutes_since_seen", unit: "min ago" },
];

const CLOCK_FACTS: Fact[] = [
  { key: "time_of_day", label: "Time of day", type: "time", path: "time_of_day", unit: "" },
  { key: "day_of_week", label: "Day of week", type: "weekday", path: "day_of_week", unit: "" },
];

/**
 * Every trigger also reports how old its data is.
 *
 * This replaces a check called "data is stale", which never said *whose* data
 * and so could not be acted on. "Milan rain last updated over 60 minutes ago"
 * names the thing that is wrong.
 */
export const FRESHNESS_FACT: Fact = {
  key: "minutes_since_update",
  label: "Last updated",
  type: "duration",
  path: "_dither.minutes_since_update",
  unit: "min ago",
};

export function deviceSource(device: Device, now: Date): Source {
  const seen = device.lastSeenAt;

  return {
    id: DEVICE_SOURCE,
    label: device.name,
    group: "device",
    facts: DEVICE_FACTS,
    fetchedAt: seen,
    payload: {
      battery_percent: device.percentCharged,
      on_usb: device.usbConnected,
      wifi_strength: device.rssi,
      woke_by_button: /button/i.test(device.updateSource ?? ""),
      minutes_since_seen: seen ? Math.floor((now.getTime() - seen.getTime()) / 60_000) : null,
    },
  };
}

export function clockSource(now: Date): Source {
  return {
    id: CLOCK_SOURCE,
    label: "Time",
    group: "clock",
    facts: CLOCK_FACTS,
    fetchedAt: now,
    payload: {
      time_of_day: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      day_of_week: now.getDay(),
    },
  };
}

export function triggerSource(
  trigger: Trigger,
  facts: Fact[],
  answer: { payload: Record<string, unknown>; fetchedAt: Date | null; error?: string },
  now: Date,
): Source {
  const age = answer.fetchedAt
    ? Math.floor((now.getTime() - answer.fetchedAt.getTime()) / 60_000)
    : null;

  return {
    id: String(trigger.id),
    label: trigger.label || trigger.extension,
    group: "trigger",
    extension: trigger.extension,
    facts: [...facts, FRESHNESS_FACT],
    fetchedAt: answer.fetchedAt,
    error: answer.error,
    payload: { ...answer.payload, _dither: { minutes_since_update: age } },
  };
}
