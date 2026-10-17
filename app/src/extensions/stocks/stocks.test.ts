import { beforeAll, describe, expect, it } from "vitest";
import { loadFonts, nodeLibrary } from "@/assets/node";
import { compile, type CompileDeps } from "@/compiler";
import { createProject } from "@/project/starters";
import type { Env, SourceSpec } from "../api";
import stocks, { finnhubUrl, stocksOf } from "./index";

const env = { units: "metric", place: null, language: "en", timezone: "Europe/Istanbul", accounts: { finnhub: { key: "k3y" } }, now: 0 } as unknown as Env;
const settings = (over: Record<string, unknown> = {}) => ({ ...stocks.defaults(env), ...over });
const sources = (over: Record<string, unknown> = {}) => stocks.source!(settings(over), env) as Record<string, SourceSpec>;

describe("stock symbols", () => {
  it("reads one a line, upper-cased, named from the table or the line, five at most", () => {
    expect(stocksOf(["aapl", "ASTS AST SpaceMobile", "QQQ", "", "$$$", "aapl", "XYZQ"])).toEqual([
      { symbol: "AAPL", name: "Apple" },
      { symbol: "ASTS", name: "AST SpaceMobile" },
      { symbol: "QQQ", name: "Nasdaq-100" },
      { symbol: "XYZQ", name: "" },
    ]);
    expect(stocksOf(["A", "B", "C", "D", "E", "F"]).map((s) => s.symbol)).toEqual(["A", "B", "C", "D", "E"]);
    expect(stocksOf(["BRK.B — Berkshire"])).toEqual([{ symbol: "BRK.B", name: "Berkshire" }]);
    // Typed on one line between commas, as people do; the funds and New York names are known too.
    expect(stocksOf(["TSM, KO,SPY", "BRK.B"])).toEqual([
      { symbol: "TSM", name: "TSMC" }, { symbol: "KO", name: "Coca-Cola" }, { symbol: "SPY", name: "S&P 500" }, { symbol: "BRK.B", name: "Berkshire Hathaway" },
    ]);
  });
});

describe("stock sources", () => {
  it("asks for a quote a symbol every five minutes, with the key in the address", () => {
    const s = sources();
    expect(Object.keys(s)).toEqual(["q0", "q1", "q2", "q3", "q4", "mkt"]);
    expect(s.q0.url).toBe("https://finnhub.io/api/v1/quote?symbol=AAPL&token=k3y");
    expect(s.q0.every).toBe(5);
    expect(s.q0.values).toEqual({ c: "c", d: "d", dp: "dp", h: "h", l: "l", pc: "pc", t: "t" });
    expect(s.mkt.url).toBe(finnhubUrl("stock/market-status?exchange=US", "k3y"));
    expect(s.mkt.values).toEqual({ open: "isOpen", session: "session" });
  });

  it("fetches today's rate when prices are shown in another currency", () => {
    expect(sources().fx).toBeUndefined();
    const lira = sources({ currency: "try" });
    expect(lira.fx.url).toBe("https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY");
    expect(lira.fx.values).toEqual({ rate: "rates.TRY" });
    const price = stocks.facts!(settings({ currency: "try" }), env).find((f) => f.key === "price0");
    expect(price).toMatchObject({ unit: " TRY", format: { times: "fx/rate" } });
  });

  it("asks nothing without a key or a symbol", () => {
    const keyless = { ...env, accounts: { finnhub: null } } as unknown as Env;
    expect(stocks.source!(settings(), keyless)).toBeNull();
    expect(stocks.source!(settings({ symbols: [] }), env)).toBeNull();
  });

  it("gives rules each symbol's price and change, and whether the market is open", () => {
    const facts = stocks.facts!(settings({ symbols: ["NVDA", "AAPL"] }), env);
    expect(facts.map((f) => f.label)).toEqual(["Nasdaq open", "NVDA price", "NVDA change today", "AAPL price", "AAPL change today"]);
    expect(facts.find((f) => f.key === "change0")).toMatchObject({ type: "number", value: "q0/dp" });
  });
});

describe("stocks widget", () => {
  let deps: CompileDeps;
  beforeAll(async () => {
    deps = { library: nodeLibrary, fonts: await loadFonts(), picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };
  });

  it("lays out every look at every size without a problem", async () => {
    for (const [layout, currency] of [["auto", "usd"], ["list", "try"], ["tiles", "jpy"], ["single", "eur"]]) {
      for (const [w, h] of [[4, 2], [10, 6], [20, 3], [6, 12]]) {
        const project = createProject({ starter: "blank", timezone: "Europe/Istanbul", language: "en", units: "metric", place: null });
        project.accounts.finnhub = { key: "k3y" };
        project.screens[0].widgets = [{ id: "s", type: "stocks", x: 0, y: 0, w, h, frame: "none", settings: { layout, currency } }];
        const c = await compile(project, deps);
        expect(c.problems).toEqual([]);
      }
    }
  });
});
