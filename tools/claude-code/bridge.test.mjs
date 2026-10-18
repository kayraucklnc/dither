import { strict as assert } from "node:assert";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "dither-claude-"));
process.env.DITHER_CLAUDE_DIR = join(home, "state");
const { allTime, costOf, dayOf, duration, line, load, modelName, planOf, readHistory, record, save, usage } = await import("../../app/public/claude-code/bridge.mjs");

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

test("models, durations and plans are named as Claude Code names them", () => {
  assert.equal(modelName("claude-opus-4-8"), "Opus 4.8");
  assert.equal(modelName("claude-haiku-4-5-20251001"), "Haiku 4.5");
  assert.equal(modelName("claude-fable-5-1"), "Fable 5.1");
  assert.equal(duration(1470095193), "17d 0h 21m");
  assert.equal(duration(5 * 3600000 + 21 * 60000), "5h 21m");
  const account = (type, tier) => ({ oauthAccount: { organizationType: type, organizationRateLimitTier: tier, emailAddress: "me@example.com" } });
  assert.equal(planOf(account("claude_max", "default_claude_max_20x")), "Claude Max 20x");
  assert.equal(planOf(account("claude_max", "default_claude_max_5x")), "Claude Max 5x");
  assert.equal(planOf(account("claude_pro", "default_claude_pro")), "Claude Pro");
  assert.equal(planOf(account("api", "")), null);
  assert.equal(planOf(null), null);
});

test("/stats figures come from its cache, with the days the bridge saw after it", () => {
  const usage_ = (i, o, r, w) => ({ inputTokens: i, outputTokens: o, cacheReadInputTokens: r, cacheCreationInputTokens: w });
  const cache = {
    lastComputedDate: "2026-10-17", firstSessionDate: "2026-10-01T10:49:51.569Z", totalSessions: 40,
    longestSession: { duration: 1470095193 },
    modelUsage: { "claude-opus-4-8": usage_(2000, 90000, 9000000, 500000), "claude-sonnet-5": usage_(10, 1000, 100000, 0) },
    // Active the 2nd–5th (four days), then the 12th–17th (six).
    dailyActivity: ["02", "03", "04", "05", "12", "13", "14", "15", "16", "17"].map((d) => ({ date: `2026-10-${d}`, messageCount: d === "14" ? 900 : 10 })),
  };
  const state = { sessions: {}, days: {
    "2026-10-17": { cost: 1, tokens: 5, sessions: ["x"], kinds: { i: 1, o: 1, r: 2, w: 1 } },
    "2026-10-18": { cost: 2, tokens: 730, sessions: ["a", "b"], kinds: { i: 30, o: 600, r: 100, w: 0 } },
  }, limits: {}, files: {}, latest: null };
  const now = noon(2026, 10, 18);
  assert.deepEqual(allTime(cache, state, now), {
    model: "Opus 4.8", tokens: 2040 + 91600 + 9100100 + 500000, input: 2040, output: 91600, cacheRead: 9100100, cacheWrite: 500000,
    sessions: 42, longest: "17d 0h 21m", activeDays: 11, days: 18, busiest: "2026-10-14",
    longestStreak: 7, currentStreak: 7, warAndPeace: 0,
  });
  // A quiet day leaves the streak standing until it is over.
  assert.equal(allTime(cache, { ...state, days: {} }, now).currentStreak, 6);
  assert.equal(allTime(cache, { ...state, days: {} }, noon(2026, 10, 19)).currentStreak, 0);
  assert.equal(allTime(null, state, now), null);
  assert.equal(usage(state, now, { cache, account: { oauthAccount: { organizationType: "claude_max", organizationRateLimitTier: "default_claude_max_20x" } } }).plan, "Claude Max 20x");
});

test("tokens are kept by kind for the days after the /stats cache", () => {
  const transcript = join(home, "kinds.jsonl");
  writeFileSync(transcript, JSON.stringify({ message: { id: "k1", usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } } }) + "\n");
  const state = empty();
  const now = Date.now();
  record(state, { session_id: "k", transcript_path: transcript }, now);
  assert.deepEqual(state.days[dayOf(now)].kinds, { i: 1, o: 2, r: 3, w: 4 });
  assert.equal(state.days[dayOf(now)].tokens, 10);
});

test("a reply costs its tokens at the model's list price", () => {
  const u = { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 2e6, cache_creation: { ephemeral_5m_input_tokens: 1e6, ephemeral_1h_input_tokens: 1e6 } };
  // Opus 5.5: $4 in, $20 out, $0.20 read, writes 1.25× and 2× input.
  assert.equal(costOf("claude-opus-5-5", u), 4 + 20 + 0.2 + 5 + 8);
  // The longest matching id wins: Opus 5, not Opus 5.5's prefix.
  assert.equal(costOf("claude-opus-5", { input_tokens: 1e6 }), 5);
  assert.equal(costOf("claude-haiku-4-5-20251001", { output_tokens: 1e6 }), 5);
  // Without the split, a write is a five-minute one.
  assert.equal(costOf("claude-sonnet-5", { cache_creation_input_tokens: 1e6 }), 2.5);
  // Claude Haiku 5.5 over 100K prompt tokens costs more.
  assert.equal(costOf("claude-haiku-5-5", { input_tokens: 50000 }), 0.005);
  assert.equal(costOf("claude-haiku-5-5", { input_tokens: 200000 }), 0.1);
  assert.equal(costOf("some-other-model", u), null);
});

test("the week before the bridge is read back from the transcripts", async () => {
  const root = join(home, "projects");
  mkdirSync(join(root, "p", "s1", "subagents"), { recursive: true });
  const at = (y, m, d, h) => new Date(y, m - 1, d, h).toISOString();
  const entry = (id, time, session, model = "claude-opus-5-5", out = 1e6) =>
    JSON.stringify({ timestamp: time, sessionId: session, message: { id, model, usage: { input_tokens: 0, output_tokens: out } } }) + "\n";
  writeFileSync(join(root, "p", "s1.jsonl"),
    entry("a", at(2026, 10, 15, 10), "s1") + entry("a", at(2026, 10, 15, 10), "s1") + entry("b", at(2026, 10, 16, 9), "s1") +
    entry("c", at(2026, 10, 17, 9), "s1") + entry("d", at(2026, 10, 18, 9), "s1") + entry("e", at(2026, 10, 1, 9), "s1") + "not json\n");
  writeFileSync(join(root, "p", "s1", "subagents", "agent-x.jsonl"), entry("f", at(2026, 10, 15, 11), "s1", "claude-sonnet-5"));
  const state = { ...empty(), days: { "2026-10-17": { cost: 1, tokens: 1, sessions: ["s9"] } } };
  const now = noon(2026, 10, 18);
  const h = await readHistory(root, state, now);
  // The 15th counts its reply once, plus the subagent's; the 17th is the status line's, today is skipped, the 1st is too old.
  assert.deepEqual(Object.keys(h.days).sort(), ["2026-10-15", "2026-10-16"]);
  assert.equal(h.days["2026-10-15"].cost, 20 + 10);
  assert.equal(h.days["2026-10-15"].tokens, 2e6);
  assert.deepEqual(h.days["2026-10-15"].sessions, ["s1"]);
  assert.equal(h.read, "2026-10-18");
  // The status line's days win; the rest fill the week.
  const u = usage(state, now, { history: h });
  assert.deepEqual(u.days, [0, 0, 0, 30, 20, 1, 0]);
  assert.equal(u.week.cost, 51);
  assert.equal(u.week.sessions, 2);
});
