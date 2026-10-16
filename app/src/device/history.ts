// The panel's own wake history: one line per wake, kept in its flash
// (firmware/src/runtime/history.h) and read back with CMD:HISTORY when a
// computer is attached. It covers the time nobody was watching, so it is what
// tells a panel that lost power from one that woke and found nothing new.
//
//   history: begin
//   history: at=1792094280 v=0.15.0 reset=8 wake=14 state=ran frame=same … err=s3:the body took too long
//   history: end 32

import { DITHER_PREFIX } from "./monitor";
import { formatDuration, type Labels, type Step } from "./activity";

export const HISTORY_COMMAND = "CMD:HISTORY";

export interface PastWake {
  /** When the wake ended, in ms; null when the panel did not know the time. */
  readonly at: number | null;
  readonly version: string;
  /** esp_reset_reason_t: 1 power-on, 8 deep sleep, 9 brownout. */
  readonly reset: number;
  /** Counted since power-on. */
  readonly wake: number;
  readonly state: string;
  readonly frame: string;
  readonly online: boolean;
  readonly clockSet: boolean;
  readonly usb: boolean;
  readonly network: boolean;
  readonly rssi?: number;
  readonly ok: number;
  readonly fail: number;
  readonly offline: number;
  readonly noclock: number;
  /** Seconds it planned to sleep afterwards. */
  readonly sleep: number;
  readonly awakeMs: number;
  readonly heap: number;
  /** The first failure, "s3:the body took too long". */
  readonly error?: string;
}

export interface History {
  /** Oldest first. */
  readonly records: readonly PastWake[];
  /** "loading" between begin and end; "unsupported" when the firmware does not know the command. */
  readonly state: "none" | "loading" | "done" | "unsupported";
}

export const EMPTY_HISTORY: History = { records: [], state: "none" };

const RESET_POWER_ON = 1;
const RESET_DEEP_SLEEP = 8;
const RESET_BROWNOUT = 9;
const RESET_CRASHES = new Set([4, 5, 6, 7]);
/** A wake this much later than planned is reported as late (the timer drifts a little). */
const LATE_SLACK_S = 120;

export function parseRecord(body: string): PastWake | null {
  const errAt = body.indexOf(" err=");
  const error = errAt >= 0 ? body.slice(errAt + 5) : undefined;
  const pairs = (errAt >= 0 ? body.slice(0, errAt) : body).split(/\s+/).filter(Boolean);
  const f = new Map(pairs.map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
  if (!f.has("at") || !f.has("wake")) return null;
  const num = (k: string) => {
    const v = f.get(k);
    return v !== undefined && /^-?\d+$/.test(v) ? Number.parseInt(v, 10) : undefined;
  };
  const at = num("at");
  const rssi = num("rssi");
  return {
    at: at !== undefined ? at * 1000 : null,
    version: f.get("v") ?? "",
    reset: num("reset") ?? 0,
    wake: num("wake") ?? 0,
    state: f.get("state") ?? "ran",
    frame: f.get("frame") ?? "none",
    online: f.get("online") === "yes",
    clockSet: f.get("clock") === "set",
    usb: f.get("usb") === "yes",
    network: f.get("net") === "used",
    ...(rssi !== undefined ? { rssi } : {}),
    ok: num("ok") ?? 0,
    fail: num("fail") ?? 0,
    offline: num("offline") ?? 0,
    noclock: num("noclock") ?? 0,
    sleep: num("sleep") ?? 0,
    awakeMs: num("ms") ?? 0,
    heap: num("heap") ?? 0,
    ...(error ? { error } : {}),
  };
}

/** Fold one log line in; lines that are not about the history leave it as it is. */
export function addHistoryLine(history: History, line: string): History {
  if (!line.startsWith(DITHER_PREFIX)) return history;
  const body = line.slice(DITHER_PREFIX.length).trim();
  if (body === `unknown command '${HISTORY_COMMAND}'`) return { ...history, state: "unsupported" };
  if (!body.startsWith("history: ")) return history;
  const rest = body.slice("history: ".length);
  if (rest === "begin") return { records: [], state: "loading" };
  if (/^end \d+$/.test(rest)) return { ...history, state: "done" };
  const record = parseRecord(rest);
  return record ? { ...history, records: [...history.records, record] } : history;
}

// ---------------------------------------------------------------------------
// Records → words

export interface PastRow {
  readonly record: PastWake;
  /** What happened between the previous record and this one, if anything worth saying. */
  readonly before: Step | null;
  readonly steps: readonly Step[];
}

/** Between two wakes: power lost, a crash, or a wake that came much later than planned. */
export function gapStep(prev: PastWake | undefined, next: PastWake, labels: Pick<Labels, "time">): Step | null {
  const lastSeen = prev?.at != null ? ` Last wake ${labels.time(prev.at)}` : "";
  if (next.reset === RESET_POWER_ON) {
    const planned = prev?.at != null ? `, next one planned ${labels.time(prev.at + prev.sleep * 1000)}` : "";
    return prev ? { text: `Power was lost.${lastSeen}${planned}; it started again from power-on`, tone: "bad" } : null;
  }
  if (next.reset === RESET_BROWNOUT) return { text: `The power dipped and the panel restarted.${lastSeen}`, tone: "bad" };
  if (RESET_CRASHES.has(next.reset)) return { text: `The panel crashed and restarted.${lastSeen}`, tone: "bad" };
  if (next.reset === RESET_DEEP_SLEEP && prev?.at != null && next.at !== null) {
    const late = (next.at - prev.at) / 1000 - prev.sleep - next.awakeMs / 1000;
    if (late > LATE_SLACK_S) return { text: `Woke ${formatDuration(late)} later than planned`, tone: "warn" };
  }
  return null;
}

export function describePast(r: PastWake, labels: Pick<Labels, "source">): Step[] {
  const steps: Step[] = [];
  if (r.state === "not-set-up") steps.push({ text: `Not set up${r.error ? `: ${r.error}` : ""}`, tone: "bad" });
  if (r.state === "quiet") steps.push({ text: "Quiet hours", tone: "muted" });
  if (r.state === "ran") {
    if (!r.network) steps.push({ text: "Nothing due — Wi-Fi stayed off", tone: "muted" });
    else if (!r.online) steps.push({ text: "Could not get online", tone: "bad" });
    else steps.push({ text: `Online${r.rssi !== undefined ? ` (${r.rssi} dBm)` : ""}`, tone: "ok" });
    if (!r.clockSet) steps.push({ text: "Clock unknown", tone: "warn" });
    if (r.ok > 0) steps.push({ text: `${r.ok} fetched`, tone: "ok" });
    if (r.fail > 0) {
      const [id, ...why] = (r.error ?? "").split(":");
      const first = r.error ? `: ${labels.source(id)} — ${why.join(":")}` : "";
      steps.push({ text: `${r.fail} failed${first}`, tone: "bad" });
    }
    if (r.offline > 0) steps.push({ text: `${r.offline} due but offline`, tone: "warn" });
    if (r.noclock > 0) steps.push({ text: `${r.noclock} waiting for the clock`, tone: "warn" });
    if (r.frame === "updated") steps.push({ text: "Panel updated", tone: "ok" });
    if (r.frame === "same") steps.push({ text: "Nothing changed", tone: "muted" });
    if (r.frame === "failed") steps.push({ text: "Panel update failed", tone: "bad" });
  }
  steps.push({ text: `${r.usb ? "Waited" : "Slept"} ${formatDuration(r.sleep)}`, tone: "info" });
  return steps;
}

/** Newest first, each with what happened just before it. */
export function pastRows(history: History, labels: Pick<Labels, "source" | "time">): PastRow[] {
  return history.records
    .map((record, i) => ({ record, before: gapStep(history.records[i - 1], record, labels), steps: describePast(record, labels) }))
    .reverse();
}
