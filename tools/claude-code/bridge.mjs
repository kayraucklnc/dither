#!/usr/bin/env node
// The Claude Code widget's data, from your own computer. Claude Code hands its
// status line a JSON object on every update: the plan's 5-hour and 7-day
// limits, the session's estimated cost and its context. This script is that
// status line. It keeps a little state, adds each session's spend to the day
// it happened, and serves the result as one JSON file the panel fetches over
// your Wi-Fi.
//
//   node tools/claude-code/bridge.mjs statusline   # as Claude Code's statusLine command
//   node tools/claude-code/bridge.mjs serve        # http://<this computer>:8787/usage.json
//   node tools/claude-code/bridge.mjs print        # what the panel would get
//
// No dependencies. Tokens are read from the session transcripts, whose format
// Claude Code does not promise to keep; when it changes they stop counting and
// everything else still works.

import { createServer } from "node:http";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
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

/** Tokens added to a transcript since it was last read: each reply counted once. */
function newTokens(state, file, now) {
  if (!file || !existsSync(file)) return 0;
  const { size, birthtimeMs } = statSync(file);
  const seen = state.files[file] ?? { at: birthtimeMs < now - FRESH ? size : 0, ids: [] };
  state.files[file] = seen;
  if (size < seen.at) seen.at = 0;
  if (size === seen.at) return 0;
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
  let tokens = 0;
  for (const line of buf.subarray(0, end).toString("utf8").split("\n")) {
    if (!line.includes('"usage"')) continue;
    try {
      const m = JSON.parse(line).message;
      const u = m?.usage;
      // One reply is written as several lines that share its id and its usage.
      if (!u || !m.id || seen.ids.includes(m.id)) continue;
      seen.ids = [...seen.ids.slice(-49), m.id];
      tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
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

  // Spend goes to the day it happened. /clear starts the session's cost again from 0.
  const cost = num(input.cost?.total_cost_usd) ?? s.cost;
  const tokens = transcripts(input.transcript_path).reduce((n, f) => n + newTokens(state, f, now), 0);
  day.cost += cost >= s.cost ? cost - s.cost : cost;
  day.tokens += tokens;
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

/** What the panel reads: worked out when it asks, so a quiet evening still rolls over at midnight. */
export function usage(state, now = Date.now()) {
  const days = [...Array(SENT)].map((_, i) => state.days[daysBack(now, SENT - 1 - i)] ?? { cost: 0, tokens: 0, sessions: [] });
  const last = days[SENT - 1];
  // A window is over once it resets; its old figure would only mislead.
  const limit = (l) => (l && l.resets * 1000 > now ? { used: round(l.used, 1), resets: l.resets } : null);
  const s = state.latest ? state.sessions[state.latest] : null;
  return {
    updated: s ? Math.floor(s.updated / 1000) : null,
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
  };
}

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
    res.end(JSON.stringify(usage(load())));
  }).listen(PORT, "0.0.0.0", () => {
    const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
    console.log("Serving Claude Code usage. Give the widget one of:");
    for (const ip of ips) console.log(`  http://${ip}:${PORT}/usage.json`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === "statusline") statusline();
  else if (command === "serve") serve();
  else if (command === "print") console.log(JSON.stringify(usage(load()), null, 2));
  else {
    console.error("usage: bridge.mjs statusline | serve | print");
    process.exit(1);
  }
}
