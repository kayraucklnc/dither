// What the panel actually did, read from its log: each "[dither]" line the
// firmware writes (firmware/src/platform/*.cpp) folded into one record per
// wake. Pure and immutable, so the view can keep the whole history in state.
//
// The firmware ends every wake with a stable machine line,
//   summary: wake=42 state=ran screen=0 frame=updated online=yes clock=set sources=s0:ok,s1:wait sleep=300
// and the human lines around it are parsed too, so older firmware that never
// writes the summary still reads well (it just cannot say which sources were
// not due).

import { DITHER_PREFIX } from "./monitor";

export type SourceOutcome = "ok" | "fail" | "offline" | "noclock" | "wait";
export type FrameOutcome = "updated" | "same" | "failed";
export type WakeState = "running" | "ran" | "quiet" | "not-set-up";

export interface SourceResult {
  readonly id: string;
  readonly outcome: SourceOutcome;
  readonly ms?: number;
  readonly error?: string;
}

export interface WifiAttempt {
  readonly ssid: string;
  readonly joined: boolean | null;
  readonly ms?: number;
  readonly rssi?: number;
  readonly status?: number;
}

export interface Sleep {
  readonly seconds: number;
  /** "awake": a computer is attached, so the panel waits awake instead of sleeping. */
  readonly mode: "deep" | "awake";
  /** When the line arrived, in ms. */
  readonly at: number;
}

export interface Wake {
  /** The firmware's wake counter; null when the log was joined mid-wake. */
  readonly number: number | null;
  /** When the first line of this wake arrived, in ms. */
  readonly at: number;
  readonly state: WakeState;
  readonly version?: string;
  readonly resetReason?: number;
  readonly blob?: { readonly crc: number; readonly builtAt: number; readonly screens: number; readonly sources: number };
  readonly notSetUp?: string;
  readonly quietUntil?: string;
  readonly wifi: readonly WifiAttempt[];
  /** "skipped": nothing was due, so Wi-Fi stayed off. */
  readonly network?: "used" | "skipped";
  readonly ntp?: { readonly ok: boolean; readonly server: string; readonly ms?: number };
  readonly clockSet?: boolean;
  readonly online?: boolean;
  readonly usb?: boolean;
  readonly sources: readonly SourceResult[];
  readonly screen?: number;
  readonly drawMs?: number;
  readonly frame?: FrameOutcome;
  readonly sleep?: Sleep;
  readonly summarised: boolean;
  readonly notes: readonly string[];
}

export interface RawLine {
  readonly at: number;
  readonly text: string;
}

export interface Activity {
  /** Oldest first. */
  readonly wakes: readonly Wake[];
  readonly raw: readonly RawLine[];
}

export const EMPTY_ACTIVITY: Activity = { wakes: [], raw: [] };

const MAX_WAKES = 200;
const MAX_RAW = 1500;

// ---------------------------------------------------------------------------
// One line → what it says

export type Parsed =
  | { kind: "wake"; number: number; version: string; resetReason: number }
  | { kind: "blob"; crc: number; builtAt: number; screens: number; sources: number }
  | { kind: "not-set-up"; reason: string }
  | { kind: "quiet"; until: string }
  | { kind: "wifi-joining"; ssid: string }
  | { kind: "wifi-joined"; ssid: string; ms: number; rssi: number }
  | { kind: "wifi-failed"; ssid: string; status: number }
  | { kind: "ntp"; ok: boolean; server: string; ms?: number }
  | { kind: "source"; id: string; outcome: Exclude<SourceOutcome, "wait">; ms?: number; error?: string }
  | { kind: "nothing-due" }
  | { kind: "status"; clockSet: boolean; online: boolean; usb: boolean }
  | { kind: "screen"; index: number; ms: number }
  | { kind: "frame"; outcome: FrameOutcome }
  | { kind: "summary"; wake: number; state: WakeState; screen?: number; frame?: FrameOutcome; online?: boolean; clockSet?: boolean; sources: SourceResult[]; sleep?: number }
  | { kind: "sleep"; seconds: number; mode: Sleep["mode"] }
  | { kind: "note"; text: string };

type Rule = [RegExp, (m: RegExpMatchArray) => Parsed];

const int = (s: string) => Number.parseInt(s, 10);

const RULES: Rule[] = [
  [/^wake #(\d+): Dither (\S+) on \S+, reset reason (-?\d+)/, (m) => ({ kind: "wake", number: int(m[1]), version: m[2], resetReason: int(m[3]) })],
  [/^blob ok: \d+ bytes, crc ([0-9a-f]+), built (\d+), (\d+) screens, (\d+) sources/, (m) => ({
    kind: "blob", crc: Number.parseInt(m[1], 16), builtAt: int(m[2]), screens: int(m[3]), sources: int(m[4]),
  })],
  [/^not set up: (.*)$/, (m) => ({ kind: "not-set-up", reason: m[1] })],
  [/^quiet hours until (\d\d:\d\d)/, (m) => ({ kind: "quiet", until: m[1] })],
  [/^wifi: joining '(.*)'$/, (m) => ({ kind: "wifi-joining", ssid: m[1] })],
  [/^wifi: joined '(.*)' in (\d+) ms, rssi (-?\d+) dBm/, (m) => ({ kind: "wifi-joined", ssid: m[1], ms: int(m[2]), rssi: int(m[3]) })],
  [/^wifi: '(.*)' failed \(status (-?\d+)\)/, (m) => ({ kind: "wifi-failed", ssid: m[1], status: int(m[2]) })],
  [/^ntp: synced with (\S+) in (\d+) ms/, (m) => ({ kind: "ntp", ok: true, server: m[1], ms: int(m[2]) })],
  [/^ntp: no answer from (\S+)/, (m) => ({ kind: "ntp", ok: false, server: m[1] })],
  [/^source (\S+): ok in (\d+) ms/, (m) => ({ kind: "source", id: m[1], outcome: "ok", ms: int(m[2]) })],
  [/^source (\S+): failed: (.*)$/, (m) => ({ kind: "source", id: m[1], outcome: "fail", error: m[2] })],
  [/^source (\S+): due, but offline/, (m) => ({ kind: "source", id: m[1], outcome: "offline" })],
  [/^source (\S+): needs the clock/, (m) => ({ kind: "source", id: m[1], outcome: "noclock" })],
  [/^nothing due: no network this wake/, () => ({ kind: "nothing-due" })],
  [/^clock (set|unknown), online (yes|no), usb (yes|no)/, (m) => ({ kind: "status", clockSet: m[1] === "set", online: m[2] === "yes", usb: m[3] === "yes" })],
  [/^screen (-?\d+) drawn in (\d+) ms/, (m) => ({ kind: "screen", index: int(m[1]), ms: int(m[2]) })],
  [/^panel already shows this frame/, () => ({ kind: "frame", outcome: "same" })],
  [/^panel updated/, () => ({ kind: "frame", outcome: "updated" })],
  [/^panel update failed/, () => ({ kind: "frame", outcome: "failed" })],
  [/^summary: (.*)$/, (m) => parseSummary(m[1])],
  [/^sleeping (\d+) s/, (m) => ({ kind: "sleep", seconds: int(m[1]), mode: "deep" })],
  [/^USB host connected: staying awake (\d+) s/, (m) => ({ kind: "sleep", seconds: int(m[1]), mode: "awake" })],
  [/^USB host gone/, () => ({ kind: "note", text: "The computer was unplugged" })],
  [/^wake requested over serial/, () => ({ kind: "note", text: "Woken early from the computer" })],
  [/^(\d+) crash resets in a row: waiting (\d+) s/, (m) => ({ kind: "note", text: `Crashed ${m[1]} times in a row; waiting ${m[2]} s before trying again` })],
  [/^tz not understood/, () => ({ kind: "note", text: "Time zone not understood, using UTC" })],
];

const OUTCOMES: readonly SourceOutcome[] = ["ok", "fail", "offline", "noclock", "wait"];
const FRAMES: readonly FrameOutcome[] = ["updated", "same", "failed"];
const STATES: readonly WakeState[] = ["ran", "quiet", "not-set-up"];

function parseSummary(body: string): Parsed {
  const fields = new Map(
    body.split(/\s+/).filter(Boolean).map((pair) => {
      const eq = pair.indexOf("=");
      return eq < 0 ? [pair, ""] : [pair.slice(0, eq), pair.slice(eq + 1)];
    }),
  );
  const num = (k: string) => {
    const v = fields.get(k);
    return v !== undefined && /^-?\d+$/.test(v) ? int(v) : undefined;
  };
  const yes = (k: string, t: string, f: string) => (fields.get(k) === t ? true : fields.get(k) === f ? false : undefined);
  const sources: SourceResult[] = (fields.get("sources") ?? "")
    .split(",")
    .map((pair) => pair.split(":"))
    .filter((p): p is [string, SourceOutcome] => p.length === 2 && p[0] !== "" && (OUTCOMES as readonly string[]).includes(p[1]))
    .map(([id, outcome]) => ({ id, outcome }));
  const state = fields.get("state");
  const frame = fields.get("frame");
  const screen = num("screen");
  return {
    kind: "summary",
    wake: num("wake") ?? -1,
    state: (STATES as readonly string[]).includes(state ?? "") ? (state as WakeState) : "ran",
    ...(screen !== undefined && screen >= 0 ? { screen } : {}),
    ...((FRAMES as readonly string[]).includes(frame ?? "") ? { frame: frame as FrameOutcome } : {}),
    online: yes("online", "yes", "no"),
    clockSet: yes("clock", "set", "unknown"),
    sources,
    sleep: num("sleep"),
  };
}

/** What a log line says, or null for lines that are not the panel's or say nothing the timeline shows. */
export function parseLine(line: string): Parsed | null {
  if (!line.startsWith(DITHER_PREFIX)) return null;
  const body = line.slice(DITHER_PREFIX.length).trim();
  for (const [re, make] of RULES) {
    const m = body.match(re);
    if (m) return make(m);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lines → wakes

function blankWake(at: number, number: number | null): Wake {
  return { number, at, state: "running", wifi: [], sources: [], summarised: false, notes: [] };
}

function withSource(sources: readonly SourceResult[], next: SourceResult): SourceResult[] {
  const i = sources.findIndex((s) => s.id === next.id);
  return i < 0 ? [...sources, next] : sources.map((s, j) => (j === i ? { ...s, ...next } : s));
}

/** Merge the summary's per-source outcomes in: it knows which were not due; the human lines know timings and errors. */
function mergeSummarySources(sources: readonly SourceResult[], summary: readonly SourceResult[]): SourceResult[] {
  const ordered = summary.map((s) => {
    const known = sources.find((k) => k.id === s.id);
    return known && known.outcome === s.outcome ? known : { ...known, ...s };
  });
  return [...ordered, ...sources.filter((s) => !summary.some((x) => x.id === s.id))];
}

function apply(wake: Wake, p: Parsed, at: number): Wake {
  switch (p.kind) {
    case "wake":
      return { ...wake, number: p.number, version: p.version, resetReason: p.resetReason };
    case "blob":
      return { ...wake, blob: { crc: p.crc, builtAt: p.builtAt, screens: p.screens, sources: p.sources } };
    case "not-set-up":
      return { ...wake, state: "not-set-up", notSetUp: p.reason };
    case "quiet":
      return { ...wake, state: "quiet", quietUntil: p.until };
    case "wifi-joining":
      return { ...wake, network: "used", wifi: [...wake.wifi, { ssid: p.ssid, joined: null }] };
    case "wifi-joined":
    case "wifi-failed": {
      const attempt: WifiAttempt = p.kind === "wifi-joined"
        ? { ssid: p.ssid, joined: true, ms: p.ms, rssi: p.rssi }
        : { ssid: p.ssid, joined: false, status: p.status };
      const last = wake.wifi.length - 1;
      const pending = last >= 0 && wake.wifi[last].joined === null && wake.wifi[last].ssid === p.ssid;
      return { ...wake, network: "used", wifi: pending ? [...wake.wifi.slice(0, last), attempt] : [...wake.wifi, attempt] };
    }
    case "ntp":
      return { ...wake, ntp: { ok: p.ok, server: p.server, ...(p.ms !== undefined ? { ms: p.ms } : {}) } };
    case "source":
      return { ...wake, sources: withSource(wake.sources, { id: p.id, outcome: p.outcome, ...(p.ms !== undefined ? { ms: p.ms } : {}), ...(p.error !== undefined ? { error: p.error } : {}) }) };
    case "nothing-due":
      return { ...wake, network: "skipped" };
    case "status":
      return { ...wake, clockSet: p.clockSet, online: p.online, usb: p.usb };
    case "screen":
      return { ...wake, screen: p.index, drawMs: p.ms };
    case "frame":
      return { ...wake, frame: p.outcome };
    case "summary":
      return {
        ...wake,
        number: wake.number ?? (p.wake >= 0 ? p.wake : null),
        state: p.state,
        summarised: true,
        screen: wake.screen ?? p.screen,
        frame: wake.frame ?? p.frame,
        online: wake.online ?? (p.state === "ran" ? p.online : undefined),
        clockSet: wake.clockSet ?? p.clockSet,
        sources: mergeSummarySources(wake.sources, p.sources),
      };
    case "sleep":
      return { ...wake, state: wake.state === "running" ? "ran" : wake.state, sleep: { seconds: p.seconds, mode: p.mode, at } };
    case "note":
      return { ...wake, notes: [...wake.notes, p.text] };
  }
}

/** Fold one line, received at `at` (ms), into the activity. */
export function addLine(activity: Activity, text: string, at: number): Activity {
  const raw = [...activity.raw.slice(-(MAX_RAW - 1)), { at, text }];
  const parsed = parseLine(text);
  if (!parsed) return { ...activity, raw };
  const wakes = activity.wakes;
  const last = wakes.length > 0 ? wakes[wakes.length - 1] : null;
  // A wake line always starts a new wake; anything else belongs to the current one
  // (or to one we joined halfway through).
  const starts = parsed.kind === "wake" || last === null || (last.sleep !== undefined && parsed.kind !== "sleep" && parsed.kind !== "note");
  const base = starts ? blankWake(at, null) : last;
  const next = apply(base, parsed, at);
  const kept = starts ? [...wakes, next] : [...wakes.slice(0, -1), next];
  return { wakes: kept.slice(-MAX_WAKES), raw };
}

// ---------------------------------------------------------------------------
// Wakes → words

export interface Labels {
  /** "Trains" for "s0"; falls back to the id. */
  source(id: string): string;
  /** "Home" for 0. */
  screen(index: number): string;
  /** Wall-clock time of day for a moment in ms, e.g. "21:03". */
  time(ms: number): string;
}

export type Tone = "ok" | "info" | "muted" | "warn" | "bad";

export interface Step {
  readonly text: string;
  readonly tone: Tone;
}

/** "45 s", "5 min", "1 h 30 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// esp_reset_reason_t
const RESET_POWER_ON = 1;
const RESET_CRASHES = new Set([4, 5, 6, 7, 9]);

export function resetStep(reason: number | undefined): Step | null {
  if (reason === undefined) return null;
  if (RESET_CRASHES.has(reason)) return { text: reason === 9 ? "Restarted after the power dipped" : "Restarted after a crash", tone: "bad" };
  if (reason === RESET_POWER_ON) return { text: "Powered on", tone: "info" };
  return null;
}

export function wifiStep(wake: Wake): Step | null {
  if (wake.network === "skipped") return { text: "Nothing due — Wi-Fi stayed off", tone: "muted" };
  const joined = wake.wifi.find((w) => w.joined === true);
  if (joined) return { text: `Wi-Fi joined (${joined.ssid}${joined.rssi !== undefined ? `, ${joined.rssi} dBm` : ""})`, tone: "ok" };
  const failed = wake.wifi.filter((w) => w.joined === false);
  if (failed.length > 0) return { text: `Wi-Fi failed: could not join ${failed.map((w) => w.ssid).join(" or ")}`, tone: "bad" };
  if (wake.wifi.length > 0) return { text: `Joining Wi-Fi (${wake.wifi[wake.wifi.length - 1].ssid})…`, tone: "muted" };
  return null;
}

export function sourceStep(s: SourceResult, labels: Labels): Step {
  const name = labels.source(s.id);
  switch (s.outcome) {
    case "ok": return { text: `${name} fetched${s.ms !== undefined ? ` (${s.ms} ms)` : ""}`, tone: "ok" };
    case "fail": return { text: `${name} failed${s.error ? `: ${s.error}` : ""}`, tone: "bad" };
    case "offline": return { text: `${name}: due, but offline`, tone: "warn" };
    case "noclock": return { text: `${name}: waiting for the clock`, tone: "warn" };
    case "wait": return { text: `${name}: not due`, tone: "muted" };
  }
}

export function frameStep(frame: FrameOutcome | undefined): Step | null {
  if (frame === "updated") return { text: "Panel updated", tone: "ok" };
  if (frame === "same") return { text: "Nothing changed — panel left alone", tone: "muted" };
  if (frame === "failed") return { text: "Panel update failed", tone: "bad" };
  return null;
}

export function nextWakeAt(wake: Wake): number | null {
  return wake.sleep ? wake.sleep.at + wake.sleep.seconds * 1000 : null;
}

export function sleepStep(wake: Wake, labels: Labels): Step | null {
  if (!wake.sleep) return null;
  const how = wake.sleep.mode === "deep" ? "Sleeping" : "Waiting awake (on USB)";
  return { text: `${how} ${formatDuration(wake.sleep.seconds)} — next wake ≈ ${labels.time(nextWakeAt(wake)!)}`, tone: "info" };
}

/** The wake as the timeline tells it, in the order it happened. */
export function describeWake(wake: Wake, labels: Labels): Step[] {
  const steps: (Step | null)[] = [resetStep(wake.resetReason)];
  if (wake.state === "not-set-up") steps.push({ text: `Not set up: ${wake.notSetUp ?? "no design on it"}`, tone: "bad" });
  if (wake.state === "quiet") steps.push({ text: `Quiet hours until ${wake.quietUntil} — screen left as it was`, tone: "muted" });
  steps.push(wifiStep(wake));
  if (wake.ntp && !wake.ntp.ok) steps.push({ text: `Clock not synced (no answer from ${wake.ntp.server})`, tone: "warn" });
  else if (wake.clockSet === false && wake.state === "ran") steps.push({ text: "Clock unknown", tone: "warn" });
  steps.push(...wake.sources.map((s) => sourceStep(s, labels)));
  if (wake.screen !== undefined) steps.push({ text: `Screen “${labels.screen(wake.screen)}” drawn`, tone: "info" });
  steps.push(frameStep(wake.frame));
  steps.push(...wake.notes.map((text): Step => ({ text, tone: "warn" })));
  steps.push(sleepStep(wake, labels));
  return steps.filter((s): s is Step => s !== null);
}

// ---------------------------------------------------------------------------
// The card on top

export interface SourceSummary {
  readonly id: string;
  /** This source's outcome in the latest wake that mentioned it. */
  readonly latest: SourceOutcome;
  /** The latest wake that actually fetched it (ok or failed), if any. */
  readonly lastAttempt: (SourceResult & { readonly at: number }) | null;
}

export interface ActivitySummary {
  readonly last: Wake | null;
  /** The latest wake that redrew the panel. */
  readonly lastRedraw: Wake | null;
  readonly nextWakeAt: number | null;
  /** The latest wake that needed the network. */
  readonly lastNetwork: Wake | null;
  readonly sources: readonly SourceSummary[];
}

export function summarize(activity: Activity): ActivitySummary {
  const newest = [...activity.wakes].reverse();
  const last = newest[0] ?? null;
  const sleeper = newest.find((w) => w.sleep !== undefined);
  // A wake still running has not decided yet; a newer wake makes an older plan moot.
  const next = last && last.sleep ? nextWakeAt(last) : last && last.state === "running" ? null : sleeper ? nextWakeAt(sleeper) : null;
  const ids: string[] = [];
  for (const w of newest) for (const s of w.sources) if (!ids.includes(s.id)) ids.push(s.id);
  const sources = ids
    .map((id): SourceSummary => {
      const latest = newest.find((w) => w.sources.some((s) => s.id === id))!.sources.find((s) => s.id === id)!;
      const tried = newest.find((w) => w.sources.some((s) => s.id === id && (s.outcome === "ok" || s.outcome === "fail")));
      const result = tried?.sources.find((s) => s.id === id);
      return { id, latest: latest.outcome, lastAttempt: tried && result ? { ...result, at: tried.at } : null };
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return {
    last,
    lastRedraw: newest.find((w) => w.frame === "updated") ?? null,
    nextWakeAt: next,
    lastNetwork: newest.find((w) => w.network === "used") ?? null,
    sources,
  };
}

/** The blob CRC the firmware logs ("blob ok: … crc …"), read from a compiled blob's header. */
export function blobCrc(blob: Uint8Array): number | null {
  if (blob.length < 16) return null;
  return new DataView(blob.buffer, blob.byteOffset, 16).getUint32(12, true);
}
