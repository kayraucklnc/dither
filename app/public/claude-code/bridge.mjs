#!/usr/bin/env node
// The Claude Code widget's data, from your own computer. Claude Code hands its
// status line a JSON object on every update: the plan's 5-hour and 7-day
// limits, the session's estimated cost and its context. This script is that
// status line. It keeps a little state, adds each session's spend to the day
// it happened, and serves the result as one JSON file the panel fetches over
// your Wi-Fi.
//
//   node ~/.claude/dither/bridge.mjs statusline   # as Claude Code's statusLine command
//   node ~/.claude/dither/bridge.mjs serve        # http://<this computer>:8787/usage.json
//   node ~/.claude/dither/bridge.mjs print        # what the panel would get
//
// The app serves this file, so the widget's settings can give a one-line
// download to ~/.claude/dither/. No dependencies. Tokens are read from the session transcripts, whose format
// Claude Code does not promise to keep; when it changes they stop counting and
// everything else still works.

import { createReadStream, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { homedir, networkInterfaces } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = () => process.env.DITHER_CLAUDE_DIR ?? join(homedir(), ".claude", "dither");
const PORT = Number(process.env.DITHER_CLAUDE_PORT ?? 8787);
/** Days of history kept, and sent. */
const KEEP = 14;
const SENT = 7;
const DAY = 86400000;
/** A transcript first seen this long after it was made is history, not today's spend. */
const FRESH = 10 * 60000;

/** The local date, as the day spend is filed under. */
export const dayOf = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** `n` local days before `t`'s, by the calendar rather than 24-hour steps (the clocks change). */
const daysBack = (t, n) => {
  const d = new Date(t);
  d.setDate(d.getDate() - n);
  return dayOf(d.getTime());
};
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const empty = () => ({ sessions: {}, days: {}, limits: {}, files: {}, latest: null });

export function load() {
  try {
    return { ...empty(), ...JSON.parse(readFileSync(join(dir(), "state.json"), "utf8")) };
  } catch {
    return empty();
  }
}

export function save(state) {
  mkdirSync(dir(), { recursive: true });
  const file = join(dir(), "state.json");
  // Several sessions update at once; a rename never leaves a half-written file.
  const tmp = `${file}.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, file);
}

const KINDS = { i: "input_tokens", o: "output_tokens", r: "cache_read_input_tokens", w: "cache_creation_input_tokens" };
const noTokens = () => ({ i: 0, o: 0, r: 0, w: 0 });
const total = (k) => k.i + k.o + k.r + k.w;

/** Tokens added to a transcript since it was last read, by kind: each reply counted once. */
function newTokens(state, file, now) {
  const tokens = noTokens();
  if (!file || !existsSync(file)) return tokens;
  const { size, birthtimeMs } = statSync(file);
  const seen = state.files[file] ?? { at: birthtimeMs < now - FRESH ? size : 0, ids: [] };
  state.files[file] = seen;
  if (size < seen.at) seen.at = 0;
  if (size === seen.at) return tokens;
  const buf = Buffer.alloc(size - seen.at);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buf, 0, buf.length, seen.at);
  } finally {
    closeSync(fd);
  }
  // Only whole lines; a half-written one is read next time.
  const end = buf.lastIndexOf(0x0a) + 1;
  seen.at += end;
  for (const line of buf.subarray(0, end).toString("utf8").split("\n")) {
    if (!line.includes('"usage"')) continue;
    try {
      const m = JSON.parse(line).message;
      const u = m?.usage;
      // One reply is written as several lines that share its id and its usage.
      if (!u || !m.id || seen.ids.includes(m.id)) continue;
      seen.ids = [...seen.ids.slice(-49), m.id];
      for (const [k, field] of Object.entries(KINDS)) tokens[k] += num(u[field]) ?? 0;
    } catch {}
  }
  return tokens;
}

/** The session's transcript and its subagents' (`<session>/subagents/*.jsonl`). */
function transcripts(path) {
  if (!path) return [];
  const sub = join(dirname(path), basename(path, ".jsonl"), "subagents");
  const subs = existsSync(sub) ? readdirSync(sub).filter((f) => f.endsWith(".jsonl")).map((f) => join(sub, f)) : [];
  return [path, ...subs];
}

/** One status line update, folded into `state`. Returns the session it was about. */
export function record(state, input, now = Date.now()) {
  const id = input.session_id ?? "unknown";
  const s = state.sessions[id] ?? { cost: 0, tokens: 0 };
  const day = (state.days[dayOf(now)] ??= { cost: 0, tokens: 0, sessions: [] });
  day.kinds ??= noTokens();

  // Spend goes to the day it happened. /clear starts the session's cost again from 0.
  const cost = num(input.cost?.total_cost_usd) ?? s.cost;
  const kinds = noTokens();
  for (const f of transcripts(input.transcript_path)) for (const [k, n] of Object.entries(newTokens(state, f, now))) kinds[k] += n;
  const tokens = total(kinds);
  day.cost += cost >= s.cost ? cost - s.cost : cost;
  day.tokens += tokens;
  for (const k of Object.keys(kinds)) day.kinds[k] += kinds[k];
  if (!day.sessions.includes(id)) day.sessions.push(id);

  const ms = num(input.cost?.total_duration_ms);
  Object.assign(s, {
    cost,
    tokens: s.tokens + tokens,
    updated: now,
    model: input.model?.display_name ?? s.model ?? null,
    project: basename(input.workspace?.project_dir ?? input.cwd ?? "") || s.project || null,
    context: num(input.context_window?.used_percentage) ?? s.context ?? null,
    added: num(input.cost?.total_lines_added) ?? s.added ?? null,
    removed: num(input.cost?.total_lines_removed) ?? s.removed ?? null,
    minutes: ms === null ? s.minutes ?? null : Math.round(ms / 60000),
  });
  state.sessions[id] = s;
  state.latest = id;

  for (const [key, window] of [["session", "five_hour"], ["week", "seven_day"]]) {
    const w = input.rate_limits?.[window];
    if (w && num(w.used_percentage) !== null && num(w.resets_at) !== null) state.limits[key] = { used: w.used_percentage, resets: w.resets_at };
  }

  // Forget what is older than the history, so the file stays small.
  const oldest = daysBack(now, KEEP);
  for (const d of Object.keys(state.days)) if (d < oldest) delete state.days[d];
  for (const [k, v] of Object.entries(state.sessions)) if (dayOf(v.updated ?? 0) < oldest) delete state.sessions[k];
  for (const f of Object.keys(state.files)) if (!existsSync(f)) delete state.files[f];
  return s;
}

/**
 * List prices in dollars per million tokens: input, output, cache read. Cache
 * writes are 1.25× input for five minutes and 2× for an hour. Matched by the
 * longest prefix of the model's id; a model not listed is counted but not priced.
 * Claude Haiku 5.5 costs [0.5, 2.5, 0.05] for a prompt over 100K tokens.
 */
const PRICES = {
  "claude-fable-5-1": [10, 50, 0.25], "claude-mythos-5-1": [10, 50, 0.25], "claude-fable-5": [10, 50, 1],
  "claude-opus-5-5": [4, 20, 0.2], "claude-opus-5": [5, 25, 0.5],
  "claude-opus-4-8": [5, 25, 0.5], "claude-opus-4-7": [5, 25, 0.5], "claude-opus-4-6": [5, 25, 0.5], "claude-opus-4-5": [5, 25, 0.5],
  "claude-opus-4": [15, 75, 1.5],
  "claude-sonnet-5-5": [2, 10, 0.2], "claude-sonnet-5": [2, 10, 0.2], "claude-sonnet-4": [3, 15, 0.3],
  "claude-haiku-5-5": [0.1, 0.5, 0.01], "claude-haiku-4-5": [1, 5, 0.1],
};

/** What one reply cost at list price, or null for a model without a price. */
export function costOf(model, u) {
  const id = Object.keys(PRICES).filter((k) => String(model).startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (!id) return null;
  const n = (v) => num(v) ?? 0;
  const prompt = n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens);
  const [input, output, read] = id === "claude-haiku-5-5" && prompt > 100000 ? [0.5, 2.5, 0.05] : PRICES[id];
  // Writes are split by how long they are kept when the transcript says; otherwise five minutes.
  const hour = n(u.cache_creation?.ephemeral_1h_input_tokens);
  const five = u.cache_creation ? n(u.cache_creation.ephemeral_5m_input_tokens) : n(u.cache_creation_input_tokens);
  return (n(u.input_tokens) * input + n(u.output_tokens) * output + n(u.cache_read_input_tokens) * read + five * input * 1.25 + hour * input * 2) / 1e6;
}

/** The days the status line saw, and before them the ones read back from the transcripts. */
const daysOf = (state, history) => ({ ...(history?.days ?? {}), ...state.days });

/** Every transcript under `root` changed since `since`, subagents' included. */
function transcriptFiles(root, since) {
  const out = [];
  const walk = (d) => {
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".jsonl") && statSync(f).mtimeMs >= since) out.push(f);
    }
  };
  walk(root);
  return out;
}

/**
 * The week before the bridge was set up, read back from Claude Code's
 * transcripts: each day's tokens by kind, sessions, and cost at list price.
 * Only days the status line has not seen, and never today.
 */
export async function readHistory(root, state, now = Date.now()) {
  const first = daysBack(now, SENT - 1);
  const today = dayOf(now);
  const wanted = (d) => d >= first && d < today && !state.days[d];
  const days = {};
  const seen = new Set();
  for (const file of transcriptFiles(root, new Date(`${first}T00:00`).getTime())) {
    const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.includes('"usage"')) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      const m = o.message;
      const t = Date.parse(o.timestamp ?? "");
      if (!m?.usage || !m.id || Number.isNaN(t) || seen.has(m.id)) continue;
      seen.add(m.id);
      const d = dayOf(t);
      if (!wanted(d)) continue;
      const day = (days[d] ??= { cost: 0, tokens: 0, sessions: [], kinds: noTokens(), estimated: true });
      for (const [k, field] of Object.entries(KINDS)) day.kinds[k] += num(m.usage[field]) ?? 0;
      day.tokens = total(day.kinds);
      day.cost += costOf(m.model, m.usage) ?? 0;
      const session = o.sessionId ?? basename(file, ".jsonl");
      if (!day.sessions.includes(session)) day.sessions.push(session);
    }
  }
  return { read: today, days };
}

/** "claude-opus-4-8" → "Opus 4.8", "claude-haiku-4-5-20251001" → "Haiku 4.5". */
export function modelName(id) {
  const [family, ...version] = id.replace(/^claude-/, "").replace(/-\d{8}$/, "").split("-");
  return family ? `${family[0].toUpperCase()}${family.slice(1)}${version.length ? ` ${version.join(".")}` : ""}` : id;
}

/** "17d 0h 21m", or "5h 21m" under a day. */
export function duration(ms) {
  const m = Math.floor(ms / 60000);
  const [d, h, min] = [Math.floor(m / 1440), Math.floor((m % 1440) / 60), m % 60];
  return d ? `${d}d ${h}h ${min}m` : `${h}h ${min}m`;
}

/** The plan, from the account Claude Code signed in with: "Claude Max 20x". Nothing else of the account is read. */
export function planOf(account) {
  const type = String(account?.oauthAccount?.organizationType ?? "");
  const tier = String(account?.oauthAccount?.organizationRateLimitTier ?? "");
  const name = { claude_pro: "Pro", claude_max: "Max", claude_team: "Team", claude_enterprise: "Enterprise" }[type];
  if (!name) return null;
  const times = /_(\d+x)$/.exec(tier)?.[1];
  return `Claude ${name}${name === "Max" && times ? ` ${times}` : ""}`;
}

/** Tokens in War and Peace, as Claude Code's /stats counts them. */
const WAR_AND_PEACE = 730000;

/**
 * Everything /stats shows, from the cache it keeps (~/.claude/stats-cache.json,
 * up to yesterday) and the days this bridge has seen since. Null without the cache.
 */
export function allTime(cache, state, now, history = null) {
  if (!cache || !Array.isArray(cache.dailyActivity) || !cache.modelUsage) return null;
  const through = String(cache.lastComputedDate ?? "");
  const later = Object.entries(daysOf(state, history)).filter(([d, v]) => d > through && v.sessions.length);
  const kinds = noTokens();
  const byModel = {};
  for (const [id, u] of Object.entries(cache.modelUsage)) {
    const k = { i: num(u.inputTokens) ?? 0, o: num(u.outputTokens) ?? 0, r: num(u.cacheReadInputTokens) ?? 0, w: num(u.cacheCreationInputTokens) ?? 0 };
    for (const key of Object.keys(kinds)) kinds[key] += k[key];
    byModel[id] = total(k);
  }
  for (const [, v] of later) for (const key of Object.keys(kinds)) kinds[key] += v.kinds?.[key] ?? 0;
  const favourite = Object.entries(byModel).sort((a, b) => b[1] - a[1])[0]?.[0];

  const activity = cache.dailyActivity.filter((d) => d.messageCount > 0);
  const active = new Set([...activity.map((d) => d.date), ...later.map(([d]) => d)]);
  const today = dayOf(now);
  const first = cache.firstSessionDate ? dayOf(Date.parse(cache.firstSessionDate)) : [...active].sort()[0] ?? today;
  let span = 1;
  while (daysBack(now, span - 1) > first && span < 10000) span++;
  // Runs of consecutive active days; the current one may end today or yesterday.
  const run = (from) => {
    let n = 0;
    while (active.has(daysBack(from, n))) n++;
    return n;
  };
  const longest = Math.max(0, ...[...active].map((d) => (active.has(daysBack(Date.parse(`${d}T12:00`), -1)) ? 0 : run(Date.parse(`${d}T12:00`)))));
  const current = active.has(today) ? run(now) : run(now - DAY);
  const busiest = activity.reduce((a, b) => (b.messageCount > (a?.messageCount ?? -1) ? b : a), null);

  return {
    model: favourite ? modelName(favourite) : null,
    tokens: total(kinds),
    input: kinds.i, output: kinds.o, cacheRead: kinds.r, cacheWrite: kinds.w,
    sessions: (num(cache.totalSessions) ?? 0) + later.reduce((n, [, v]) => n + v.sessions.length, 0),
    longest: num(cache.longestSession?.duration) === null ? null : duration(cache.longestSession.duration),
    activeDays: active.size, days: span,
    busiest: busiest?.date ?? null,
    longestStreak: longest, currentStreak: current,
    warAndPeace: Math.round((kinds.i + kinds.o) / WAR_AND_PEACE),
  };
}

/** What the panel reads: worked out when it asks, so a quiet evening still rolls over at midnight. */
export function usage(state, now = Date.now(), { cache = null, account = null, history = null } = {}) {
  const known = daysOf(state, history);
  const days = [...Array(SENT)].map((_, i) => known[daysBack(now, SENT - 1 - i)] ?? { cost: 0, tokens: 0, sessions: [] });
  const last = days[SENT - 1];
  // A window is over once it resets; its old figure would only mislead.
  const limit = (l) => (l && l.resets * 1000 > now ? { used: round(l.used, 1), resets: l.resets } : null);
  const s = state.latest ? state.sessions[state.latest] : null;
  return {
    updated: s ? Math.floor(s.updated / 1000) : null,
    plan: planOf(account),
    limits: { session: limit(state.limits.session), week: limit(state.limits.week) },
    session: s ? {
      cost: round(s.cost), tokens: s.tokens, model: s.model, project: s.project,
      context: s.context, added: s.added, removed: s.removed, minutes: s.minutes,
    } : null,
    today: { cost: round(last.cost), tokens: last.tokens, sessions: last.sessions.length },
    week: {
      cost: round(days.reduce((n, d) => n + d.cost, 0)),
      tokens: days.reduce((n, d) => n + d.tokens, 0),
      sessions: new Set(days.flatMap((d) => d.sessions)).size,
    },
    days: days.map((d) => round(d.cost)),
    stats: allTime(cache, state, now, history),
  };
}

const claudeDir = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
/** Claude Code's own files the served figures add: the /stats cache and the signed-in account's plan. */
const historyFile = () => join(dir(), "history.json");
let reading = null;
/** Reads the transcripts again when the history is from an earlier day; once at a time. */
function refreshHistory() {
  if (readJson(historyFile())?.read === dayOf(Date.now()) || reading) return reading ?? Promise.resolve();
  reading = readHistory(join(claudeDir(), "projects"), load())
    .then((h) => {
      mkdirSync(dir(), { recursive: true });
      writeFileSync(historyFile(), JSON.stringify(h));
    })
    .catch((e) => console.error(`Could not read the transcripts: ${e.message}`))
    .finally(() => (reading = null));
  return reading;
}

const extras = () => ({
  history: readJson(historyFile()),
  cache: readJson(join(claudeDir(), "stats-cache.json")),
  account: readJson(process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, ".claude.json") : join(homedir(), ".claude.json")),
});

/** The line Claude Code shows under the prompt. */
export function line(s, limits) {
  return [
    s.model,
    s.context !== null ? `${Math.round(s.context)}% context` : null,
    `$${s.cost.toFixed(2)}`,
    limits.session ? `5h ${Math.round(limits.session.used)}%` : null,
    limits.week ? `week ${Math.round(limits.week.used)}%` : null,
  ].filter(Boolean).join(" · ");
}

function statusline() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const state = load();
      const s = record(state, JSON.parse(raw || "{}"));
      save(state);
      process.stdout.write(line(s, usage(state).limits));
    } catch (e) {
      process.stdout.write(`dither bridge: ${e.message}`);
    }
  });
}

function serve() {
  createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path !== "/usage.json" && path !== "/") return res.writeHead(404).end();
    // The editor's preview asks from the browser.
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
    res.end(JSON.stringify(usage(load(), Date.now(), extras())));
    void refreshHistory();
  }).listen(PORT, "0.0.0.0", () => {
    const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
    console.log("Serving Claude Code usage. Give the widget one of:");
    for (const ip of ips) console.log(`  http://${ip}:${PORT}/usage.json`);
    void refreshHistory();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === "statusline") statusline();
  else if (command === "serve") serve();
  else if (command === "print") refreshHistory().then(() => console.log(JSON.stringify(usage(load(), Date.now(), extras()), null, 2)));
  else {
    console.error("usage: bridge.mjs statusline | serve | print");
    process.exit(1);
  }
}
