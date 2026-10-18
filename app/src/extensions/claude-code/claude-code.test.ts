import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { compile, type CompileDeps } from "@/compiler";
import { createProject } from "@/project/starters";
import type { Env, SourceSpec } from "../api";
import claudeCode from "./index";

const env = { units: "metric", place: null, language: "en", timezone: "Europe/Istanbul", accounts: {}, now: 0 } as unknown as Env;
const settings = (over: Record<string, unknown> = {}) => ({ ...claudeCode.defaults(env), ...over });
const URL = "http://192.168.1.20:8787/usage.json";

describe("Claude Code source", () => {
  it("reads every figure the bridge serves, every five minutes", () => {
    const s = claudeCode.source!(settings({ url: ` ${URL} ` }), env) as SourceSpec;
    expect(s.url).toBe(URL);
    expect(s.every).toBe(5);
    expect(s.values).toMatchObject({
      s5: "limits.session.used", r5: "limits.session.resets", s7: "limits.week.used", r7: "limits.week.resets",
      upd: "updated", sTok: "stats.tokens", sIn: "stats.input", sOut: "stats.output",
    });
  });

  it("asks nothing without a web address", () => {
    expect(claudeCode.source!(settings(), env)).toBeNull();
    expect(claudeCode.source!(settings({ url: "192.168.1.20:8787" }), env)).toBeNull();
  });

  it("gives rules the limits, when the session one resets, and the streak", () => {
    const facts = claudeCode.facts!(settings({ url: URL }), env);
    expect(facts.map((f) => f.label)).toEqual([
      "Session limit used", "Weekly limit used", "Minutes until the session limit resets", "Plan limits known", "Days in a row with Claude Code",
    ]);
    expect(facts.find((f) => f.key === "resets")).toMatchObject({ type: "number", value: "r5", format: { until: true } });
    expect(facts.find((f) => f.key === "limits")).toMatchObject({ type: "flag", test: { v: "s5", op: "present" } });
  });
});

describe("Claude Code widget", () => {
  let deps: CompileDeps;
  beforeAll(async () => {
    deps = { library: nodeLibrary, fonts: await loadFonts(), picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };
  });

  it("lays out at every size, with and without its rows, without a problem", async () => {
    for (const stats of [true, false]) {
      for (const [w, h] of [[5, 2], [5, 3], [10, 6], [12, 8], [20, 3], [6, 12], [20, 12]]) {
        const project = createProject({ starter: "blank", timezone: "Europe/Istanbul", language: "en", units: "metric", place: null });
        project.screens[0].widgets = [{ id: "c", type: "claude-code", x: 0, y: 0, w, h, frame: "none", settings: { url: URL, stats } }];
        const c = await compile(project, deps);
        expect(c.problems).toEqual([]);
      }
    }
  });
});
