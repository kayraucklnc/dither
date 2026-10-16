import { describe, expect, it } from "vitest";
import { addHistoryLine, describePast, EMPTY_HISTORY, gapStep, parseRecord, pastRows, type History } from "./history";

const labels = {
  source: (id: string) => ({ s3: "Stripe" })[id] ?? id,
  time: (ms: number) => new Date(ms).toISOString().slice(11, 16),
};

const AT = 1792094280; // 2026-10-15 19:58 UTC
const line = (at: number | "-", extra = "", reset = 8, sleep = 1800) =>
  `at=${at} v=0.15.0 reset=${reset} wake=14 state=ran frame=same online=yes clock=set usb=no net=used rssi=-61 ok=3 fail=0 offline=0 noclock=0 sleep=${sleep} ms=9000 heap=29648${extra}`;

const feed = (lines: string[], from: History = EMPTY_HISTORY) => lines.reduce((h, l) => addHistoryLine(h, `[dither] ${l}`), from);

describe("parseRecord", () => {
  it("reads every field, the error with its spaces last", () => {
    const r = parseRecord(line(AT, " err=s3:the body took too long").replace("fail=0", "fail=1"));
    expect(r).toMatchObject({ at: AT * 1000, version: "0.15.0", reset: 8, wake: 14, network: true, online: true, rssi: -61, ok: 3, fail: 1, sleep: 1800, awakeMs: 9000 });
    expect(r?.error).toBe("s3:the body took too long");
  });

  it("knows a wake without a clock", () => {
    expect(parseRecord(line("-"))?.at).toBeNull();
  });

  it("ignores what is not a record", () => {
    expect(parseRecord("hello")).toBeNull();
  });
});

describe("addHistoryLine", () => {
  it("collects the records between begin and end", () => {
    const h = feed(["history: begin", `history: ${line(AT)}`, `history: ${line(AT + 1800)}`, "history: end 2"]);
    expect(h.state).toBe("done");
    expect(h.records.map((r) => r.at)).toEqual([AT * 1000, (AT + 1800) * 1000]);
  });

  it("starts over on a new begin", () => {
    const h = feed(["history: begin", `history: ${line(AT)}`, "history: end 1", "history: begin"]);
    expect(h).toEqual({ records: [], state: "loading" });
  });

  it("knows firmware that keeps no history", () => {
    expect(feed(["unknown command 'CMD:HISTORY'"]).state).toBe("unsupported");
  });

  it("leaves other lines alone", () => {
    expect(feed(["wake #1: Dither 0.15.0 on xiao-epaper-75, reset reason 1, heap 1"])).toBe(EMPTY_HISTORY);
  });
});

describe("gapStep", () => {
  const a = parseRecord(line(AT))!;

  it("says power was lost before a power-on", () => {
    const b = parseRecord(line(AT + 5 * 3600, "", 1))!;
    expect(gapStep(a, b, labels)).toEqual({ text: "Power was lost. Last wake 19:58, next one planned 20:28; it started again from power-on", tone: "bad" });
  });

  it("says a wake came late", () => {
    const b = parseRecord(line(AT + 1800 + 9 + 600))!;
    expect(gapStep(a, b, labels)?.text).toBe("Woke 10 min later than planned");
  });

  it("is quiet for a wake on time", () => {
    expect(gapStep(a, parseRecord(line(AT + 1800 + 9 + 30))!, labels)).toBeNull();
  });

  it("names brownouts and crashes", () => {
    expect(gapStep(a, parseRecord(line(AT + 60, "", 9))!, labels)?.text).toMatch(/power dipped/);
    expect(gapStep(a, parseRecord(line(AT + 60, "", 4))!, labels)?.text).toMatch(/crashed/);
  });
});

describe("describePast", () => {
  it("names the source of the first failure", () => {
    const r = parseRecord(line(AT, " err=s3:HTTP 401").replace("fail=0", "fail=1"))!;
    expect(describePast(r, labels).map((s) => s.text)).toContain("1 failed: Stripe — HTTP 401");
  });
});

describe("pastRows", () => {
  it("is newest first", () => {
    const h = feed(["history: begin", `history: ${line(AT)}`, `history: ${line(AT + 1809)}`, "history: end 2"]);
    expect(pastRows(h, labels).map((r) => r.record.at)).toEqual([(AT + 1809) * 1000, AT * 1000]);
  });
});
