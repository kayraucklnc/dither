import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { createProject } from "@/project/starters";
import { parseProject, type Project } from "@/project/schema";
import { AssetStore, formatContext, render } from "@/runtime/render";
import { evaluate } from "@/runtime/conditions";
import { builtins } from "@/runtime/values";
import { compile, type CompileDeps } from "./index";
import { factCatalog, scoped } from "./facts";
import { activeAlert } from "./alerts";

let deps: CompileDeps;
beforeAll(async () => {
  deps = { library: nodeLibrary, fonts: await loadFonts(), picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };
});

const account = { id: "me@example.com", clientId: "id.apps.googleusercontent.com", clientSecret: "shh", refreshToken: "1//refresh", email: "me@example.com" };
const NOW = Date.UTC(2026, 9, 5, 6, 0) / 1000; // Monday 08:00 in Rome

function project(): Project {
  const p = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: { name: "Milan", latitude: 45.46, longitude: 9.19 } });
  p.screens[0].widgets = [
    { id: "train", type: "trenord", x: 0, y: 0, w: 10, h: 6, frame: "none", settings: {} },
    { id: "cal", type: "google-calendar", x: 10, y: 0, w: 10, h: 6, frame: "none", settings: {} },
    { id: "sky", type: "weather", x: 0, y: 6, w: 10, h: 6, frame: "none", settings: {} },
  ];
  p.accounts = { google: [account], stripe: null };
  p.alerts = [
    { id: "a1", enabled: true, match: "any", checks: [{ fact: "train:trouble", op: "is", value: true }], icon: "train-front", text: "Trouble on your line", value: "train:delay", style: "banner" },
    { id: "a2", enabled: true, match: "any", checks: [{ fact: "sky:rain", op: "ge", value: 60 }], icon: "umbrella", text: "Take an umbrella", value: "sky:rain", style: "banner" },
  ];
  return p;
}

describe("transit, calendar and alerts", () => {
  it("compiles the sources the panel needs", async () => {
    const out = await compile(project(), deps);
    expect(out.problems).toEqual([]);
    const train = out.runtime.sources.find((s) => s.url.includes("trenord"))!;
    expect(train.url).toContain("departure_date={{now|YYYYMMDD}}");
    expect(train.decode?.aes256ecb).toMatch(/^[0-9a-f]{64}$/);
    const cal = out.runtime.sources.find((s) => s.url.includes("googleapis"))!;
    expect(cal.auth?.form).toContainEqual(["refresh_token", "1//refresh"]);
    expect(cal.url).toContain("timeMin={{now|YYYY-MM-DD[T]HH:mm:ssZ}}");
  });

  it("puts the first alert that holds on top of the screen", async () => {
    const p = project();
    const out = await compile(p, deps);
    const ids = new Map(out.sources.flatMap((s) => s.widgetIds.map((w) => [w, s.source.id] as const)));
    const catalog = factCatalog(p, ids);
    const values = builtins(NOW, out.runtime.tz);
    for (const s of out.sources) for (const [k, v] of s.sample) values.set(k, v);
    const ctx = formatContext(out.runtime, NOW);
    // The sample has a cancelled train and a 7-minute delay: the train alert wins over rain.
    values.set(`${ids.get("sky")}.rain`, 80);
    expect(activeAlert(p.alerts, catalog, values, ctx)).toBe("a1");
    const train = ids.get("train")!;
    for (const i of [0, 1, 2, 3]) {
      values.set(`${train}.c${i}`, false);
      values.set(`${train}.s${i}`, "");
      values.set(`${train}.d${i}`, 0);
    }
    values.set(`${train}.alert`, null);
    expect(activeAlert(p.alerts, catalog, values, ctx)).toBe("a2");
    const { fb } = render(out.runtime, out.blob, values, NOW, new AssetStore(out.blob, out.runtime.assets));
    // The banner is a solid strip along the bottom.
    let ink = 0;
    for (let x = 0; x < 800; x++) if (fb.get(x, 476)) ink++;
    expect(ink).toBeGreaterThan(700);
  });

  it("knows whether you are in a meeting", async () => {
    const p = project();
    const out = await compile(p, deps);
    const ids = new Map(out.sources.flatMap((s) => s.widgetIds.map((w) => [w, s.source.id] as const)));
    const busy = factCatalog(p, ids).find((f) => f.id === "cal:busy")!;
    const src = ids.get("cal")!;
    const values = builtins(NOW, out.runtime.tz);
    const ctx = formatContext(out.runtime, NOW);
    if (busy.type !== "flag") throw new Error("busy is a flag");
    const test = scoped(busy.test, src);
    values.set(`${src}.s0`, "2026-10-05T07:30:00+02:00");
    values.set(`${src}.e0`, "2026-10-05T08:30:00+02:00");
    expect(evaluate(test, values, ctx)).toBe(true);
    values.set(`${src}.s0`, "2026-10-05T08:30:00+02:00");
    values.set(`${src}.e0`, "2026-10-05T09:00:00+02:00");
    expect(evaluate(test, values, ctx)).toBe(false);
  });

  it("asks Stripe for the period's list and totals it on the panel", async () => {
    const p = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: null });
    p.accounts = { google: [], stripe: { key: "rk_live_abc", name: "" } };
    p.screens[0].widgets = [{ id: "rev", type: "stripe", x: 0, y: 0, w: 8, h: 6, frame: "none", settings: { period: "week" } }];
    const out = await compile(p, deps);
    const src = out.runtime.sources[0];
    expect(src.url).toContain("created%5Bgte%5D={{today-518400}}");
    expect(src.headers).toEqual([["Authorization", "Bearer rk_live_abc"]]);
    expect(src.values).toContainEqual({ key: "gross", path: "data", agg: "sum", field: "amount" });
    expect(src.values).toContainEqual({ key: "count", path: "data", agg: "count" });
  });

  it("reads each calendar from the account its widget names", async () => {
    const p = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place: null });
    const work = { ...account, id: "work@example.com", email: "work@example.com", refreshToken: "1//work" };
    p.accounts = { google: [account, work], stripe: null };
    p.screens[0].widgets = [
      { id: "home", type: "google-calendar", x: 0, y: 0, w: 8, h: 6, frame: "none", settings: {} },
      { id: "job", type: "google-calendar", x: 8, y: 0, w: 8, h: 6, frame: "none", settings: { account: "work@example.com" } },
    ];
    const out = await compile(p, deps);
    const tokens = out.runtime.sources.map((s) => s.auth?.form.find(([k]) => k === "refresh_token")?.[1]).sort();
    expect(tokens).toEqual(["1//refresh", "1//work"]);
  });

  it("opens projects saved with a single Google account", () => {
    const old = { ...createProject({ starter: "blank", timezone: "UTC", language: "en", units: "metric", place: null }), accounts: { google: { clientId: "c", clientSecret: "s", refreshToken: "r", email: "me@x" }, stripe: null } };
    expect(parseProject(JSON.parse(JSON.stringify(old))).accounts.google).toEqual([{ id: "me@x", clientId: "c", clientSecret: "s", refreshToken: "r", email: "me@x" }]);
  });
});
