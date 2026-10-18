import { strict as assert } from "node:assert";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "dither-claude-"));
process.env.DITHER_CLAUDE_DIR = join(home, "state");
const { dayOf, line, load, record, save, usage } = await import("./bridge.mjs");

const empty = () => ({ sessions: {}, days: {}, limits: {}, files: {}, latest: null });
const noon = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
const reply = (id, input, output) => JSON.stringify({ type: "assistant", message: { id, usage: { input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }) + "\n";

test("spend goes to the day it happened, and starts again after /clear", () => {
  const state = empty();
  record(state, { session_id: "a", cost: { total_cost_usd: 2 } }, noon(2026, 10, 17));
  record(state, { session_id: "a", cost: { total_cost_usd: 5 } }, noon(2026, 10, 18));
  // /clear: the session's cost drops to 0.4, which is all new.
  record(state, { session_id: "a", cost: { total_cost_usd: 0.4 } }, noon(2026, 10, 18) + 60000);
  record(state, { session_id: "b", cost: { total_cost_usd: 1 } }, noon(2026, 10, 18) + 120000);
  const u = usage(state, noon(2026, 10, 18));
  assert.deepEqual(u.days, [0, 0, 0, 0, 0, 2, 4.4]);
  assert.deepEqual(u.today, { cost: 4.4, tokens: 0, sessions: 2 });
  assert.equal(u.week.cost, 6.4);
  assert.equal(u.week.sessions, 2);
  assert.equal(u.session.cost, 1);
});

test("the week is the last seven days, and history past two weeks is forgotten", () => {
  const state = empty();
  record(state, { session_id: "old", cost: { total_cost_usd: 9 } }, noon(2026, 10, 1));
  record(state, { session_id: "a", cost: { total_cost_usd: 3 } }, noon(2026, 10, 11));
  record(state, { session_id: "b", cost: { total_cost_usd: 1 } }, noon(2026, 10, 12));
  assert.equal(state.days["2026-10-01"].cost, 9);
  record(state, { session_id: "c", cost: { total_cost_usd: 2 } }, noon(2026, 10, 18));
  assert.equal(state.days["2026-10-01"], undefined);
  assert.equal(state.sessions.old, undefined);
  const u = usage(state, noon(2026, 10, 18));
  assert.deepEqual(u.days, [1, 0, 0, 0, 0, 0, 2]);
  assert.equal(u.week.cost, 3);
  // A quiet day rolls over without an update.
  assert.deepEqual(usage(state, noon(2026, 10, 19)).days, [0, 0, 0, 0, 0, 2, 0]);
});

test("limits are kept, and served as null once they reset", () => {
  const state = empty();
  const now = noon(2026, 10, 18);
  const at = now / 1000;
  record(state, { session_id: "a", rate_limits: { five_hour: { used_percentage: 23.46, resets_at: at + 3600 }, seven_day: { used_percentage: 61.2, resets_at: at + 86400 } } }, now);
  // An update without them keeps the last ones.
  record(state, { session_id: "a" }, now + 1000);
  assert.deepEqual(usage(state, now).limits, { session: { used: 23.5, resets: at + 3600 }, week: { used: 61.2, resets: at + 86400 } });
  assert.deepEqual(usage(state, now + 2 * 3600000).limits, { session: null, week: { used: 61.2, resets: at + 86400 } });
});

test("tokens are read once per reply, carry on from where they stopped, and include subagents", () => {
  const dir = join(home, "project");
  mkdirSync(join(dir, "s1", "subagents"), { recursive: true });
  const transcript = join(dir, "s1.jsonl");
  // One reply is several lines with the same id; a half-written line waits.
  writeFileSync(transcript, reply("m1", 10, 5) + reply("m1", 10, 5) + reply("m2", 100, 50) + '{"message":{"id":"m3","usa');
  writeFileSync(join(dir, "s1", "subagents", "agent-x.jsonl"), reply("x1", 1000, 0));
  const state = empty();
  const now = Date.now();
  record(state, { session_id: "s1", transcript_path: transcript }, now);
  assert.equal(state.sessions.s1.tokens, 1165);
  appendFileSync(transcript, `ge":{"input_tokens":1,"output_tokens":1}}}\n` + reply("m2", 100, 50) + "not json\n");
  record(state, { session_id: "s1", transcript_path: transcript }, now);
  assert.equal(state.sessions.s1.tokens, 1167);
  assert.equal(usage(state, now).today.tokens, 1167);
});

test("a transcript that is old when first seen counts from now on", () => {
  const transcript = join(home, "old.jsonl");
  writeFileSync(transcript, reply("m1", 500, 500));
  const state = empty();
  const later = Date.now() + 20 * 60000;
  record(state, { session_id: "o", transcript_path: transcript }, later);
  assert.equal(state.sessions.o.tokens, 0);
  appendFileSync(transcript, reply("m2", 3, 4));
  record(state, { session_id: "o", transcript_path: transcript }, later);
  assert.equal(state.sessions.o.tokens, 7);
});

test("the current session's figures, and the status line", () => {
  const state = empty();
  const now = noon(2026, 10, 18);
  const s = record(state, {
    session_id: "a", model: { display_name: "Opus 5.5" }, workspace: { project_dir: "/Users/me/dither" },
    cost: { total_cost_usd: 1.5, total_lines_added: 120, total_lines_removed: 30, total_duration_ms: 54 * 60000 },
    context_window: { used_percentage: 41 }, rate_limits: { five_hour: { used_percentage: 23.5, resets_at: now / 1000 + 60 } },
  }, now);
  assert.deepEqual(usage(state, now).session, { cost: 1.5, tokens: 0, model: "Opus 5.5", project: "dither", context: 41, added: 120, removed: 30, minutes: 54 });
  assert.equal(line(s, usage(state, now).limits), "Opus 5.5 · 41% context · $1.50 · 5h 24%");
  assert.equal(usage(empty(), now).session, null);
  assert.equal(dayOf(now), "2026-10-18");
});

test("state survives a save and a load", () => {
  const state = empty();
  record(state, { session_id: "a", cost: { total_cost_usd: 1 } }, noon(2026, 10, 18));
  save(state);
  assert.deepEqual(load(), state);
});
