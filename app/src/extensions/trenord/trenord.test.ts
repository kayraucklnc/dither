import { describe, expect, it } from "vitest";
import type { Env, SourceSpec } from "../api";
import trenord from "./index";

const env = { units: "metric", place: null, language: "en", timezone: "Europe/Rome", accounts: {} } as unknown as Env;
const settings = { ...trenord.defaults(env), from: "S01066", to: "S01933" };
const source = (s: typeof settings) => trenord.source!(s, env) as SourceSpec | null;

describe("trenord source", () => {
  it("asks the planner by station name, which is all it answers to", () => {
    const url = new URL(source(settings)!.url.split("&departure_date")[0]);
    expect(url.searchParams.get("orig")).toBe("MILANO CADORNA");
    expect(url.searchParams.get("dest")).toBe("SARONNO");
  });

  it("has no source until both stations are known ones", () => {
    expect(source({ ...settings, to: "" })).toBeNull();
    expect(source({ ...settings, from: "S99999" })).toBeNull();
  });
});
