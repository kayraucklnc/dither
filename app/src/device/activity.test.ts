import { describe, expect, it } from "vitest";
import {
  addLine,
  blobCrc,
  describeWake,
  EMPTY_ACTIVITY,
  formatDuration,
  parseLine,
  summarize,
  type Activity,
  type Labels,
} from "./activity";

const T0 = Date.UTC(2026, 9, 13, 19, 3, 0);

const labels: Labels = {
  source: (id) => ({ s0: "Trains", s1: "Weather", s2: "Stripe" })[id] ?? id,
  screen: (i) => ["Home", "Commute"][i] ?? `Screen ${i + 1}`,
  time: (ms) => new Date(ms).toISOString().slice(11, 16),
};

/** Feed lines one second apart, starting at `start`. */
function feed(lines: string[], start = T0, from: Activity = EMPTY_ACTIVITY): Activity {
  return lines.reduce((a, line, i) => addLine(a, line, start + i * 1000), from);
}

const d = (s: string) => `[dither] ${s}`;

const FULL_WAKE = [
  d("wake #42: Dither 0.9.0 on xiao-epaper-75, reset reason 8, heap 210000"),
  d("blob ok: 98304 bytes, crc 1a2b3c4d, built 1760000000, 2 screens, 3 sources, parsed in 40 ms, heap 180000"),
  d("wifi: joining 'Home'"),
  d("wifi: joined 'Home' in 2100 ms, rssi -61 dBm, ip 192.168.1.20"),
  d("ntp: synced with pool.ntp.org in 300 ms, now 1760385780"),
  d("source s0: ok in 640 ms (120 values, 900 bytes of text kept), heap 150000"),
  d("source s2: failed: HTTP 401"),
  d("clock set, online yes, usb yes"),
  d("screen 0 drawn in 120 ms"),
  d("panel updated (deadbeef)"),
  d("summary: wake=42 state=ran screen=0 frame=updated online=yes clock=set sources=s0:ok,s1:wait,s2:fail sleep=300"),
  d("stack headroom 4000 bytes, heap 170000 (lowest 120000)"),
  d("USB host connected: staying awake 300 s"),
];

describe("parseLine", () => {
  it("ignores lines that are not the panel's", () => {
    expect(parseLine("I (12) wifi: up")).toBeNull();
    expect(parseLine("[dither] stack headroom 4000 bytes")).toBeNull();
  });

  it("reads the wake, sources, frame and sleep lines", () => {
    expect(parseLine(FULL_WAKE[0])).toEqual({ kind: "wake", number: 42, version: "0.9.0", resetReason: 8 });
    expect(parseLine(FULL_WAKE[1])).toMatchObject({ kind: "blob", crc: 0x1a2b3c4d, screens: 2, sources: 3 });
    expect(parseLine(FULL_WAKE[5])).toEqual({ kind: "source", id: "s0", outcome: "ok", ms: 640 });
    expect(parseLine(d("source s3: failed: TLS: handshake failed (code -0x7780)"))).toEqual({
      kind: "source", id: "s3", outcome: "fail", error: "TLS: handshake failed (code -0x7780)",
    });
    expect(parseLine(d("source s1: due, but offline"))).toMatchObject({ outcome: "offline" });
    expect(parseLine(d("source s1: needs the clock, not fetched"))).toMatchObject({ outcome: "noclock" });
    expect(parseLine(d("panel already shows this frame (deadbeef), left alone"))).toEqual({ kind: "frame", outcome: "same" });
    expect(parseLine(d("panel update failed"))).toEqual({ kind: "frame", outcome: "failed" });
    expect(parseLine(d("sleeping 600 s (deep sleep)"))).toEqual({ kind: "sleep", seconds: 600, mode: "deep" });
    expect(parseLine(d("quiet hours until 07:00"))).toEqual({ kind: "quiet", until: "07:00" });
    expect(parseLine(d("wifi: 'Home' failed (status 6)"))).toEqual({ kind: "wifi-failed", ssid: "Home", status: 6 });
    expect(parseLine(d("ntp: no answer from pool.ntp.org"))).toEqual({ kind: "ntp", ok: false, server: "pool.ntp.org" });
  });

  it("reads the summary line, and tolerates unknown keys and a truncated end", () => {
    expect(parseLine(FULL_WAKE[10])).toEqual({
      kind: "summary", wake: 42, state: "ran", screen: 0, frame: "updated", online: true, clockSet: true, sleep: 300,
      sources: [{ id: "s0", outcome: "ok" }, { id: "s1", outcome: "wait" }, { id: "s2", outcome: "fail" }],
    });
    expect(parseLine(d("summary: wake=7 state=not-set-up screen=-1 frame=updated extra=1 sources=- sleep=3600"))).toMatchObject({
      wake: 7, state: "not-set-up", sources: [], sleep: 3600,
    });
    expect(parseLine(d("summary: wake=8 state=ran screen=1 frame=same online=no clock=set sources=s0:ok,s1:wa"))).toMatchObject({
      screen: 1, frame: "same", online: false, sources: [{ id: "s0", outcome: "ok" }], sleep: undefined,
    });
  });
});

describe("addLine", () => {
  it("folds a whole wake into one record and keeps the raw lines", () => {
    const a = feed(["I (30) boot: something", ...FULL_WAKE]);
    expect(a.raw).toHaveLength(FULL_WAKE.length + 1);
    expect(a.wakes).toHaveLength(1);
    const w = a.wakes[0];
    expect(w).toMatchObject({
      number: 42, at: T0 + 1000, state: "ran", screen: 0, frame: "updated", online: true, clockSet: true, usb: true,
      network: "used", summarised: true, blob: { crc: 0x1a2b3c4d },
    });
    expect(w.wifi).toEqual([{ ssid: "Home", joined: true, ms: 2100, rssi: -61 }]);
    expect(w.sources).toEqual([
      { id: "s0", outcome: "ok", ms: 640 },
      { id: "s1", outcome: "wait" },
      { id: "s2", outcome: "fail", error: "HTTP 401" },
    ]);
    expect(w.sleep).toEqual({ seconds: 300, mode: "awake", at: T0 + 13000 });
  });

  it("does not change the activity it was given", () => {
    const before = feed(FULL_WAKE.slice(0, 3));
    const snapshot = JSON.stringify(before);
    addLine(before, FULL_WAKE[3], T0 + 99);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("starts a new record at each wake line", () => {
    const a = feed([...FULL_WAKE, d("wake #43: Dither 0.9.0 on xiao-epaper-75, reset reason 8, heap 1"), d("nothing due: no network this wake")]);
    expect(a.wakes.map((w) => w.number)).toEqual([42, 43]);
    expect(a.wakes[1]).toMatchObject({ network: "skipped", state: "running" });
  });

  it("keeps a wake joined halfway through, numbered by its summary", () => {
    const a = feed(FULL_WAKE.slice(6));
    expect(a.wakes).toHaveLength(1);
    expect(a.wakes[0]).toMatchObject({ number: 42, frame: "updated" });
  });

  it("lets unplugging turn a wait into a deep sleep for what is left", () => {
    const a = feed([...FULL_WAKE, d("USB host gone"), d("sleeping 120 s (deep sleep)")]);
    expect(a.wakes).toHaveLength(1);
    expect(a.wakes[0].sleep).toMatchObject({ seconds: 120, mode: "deep" });
    expect(a.wakes[0].notes).toEqual(["The computer was unplugged"]);
  });

  it("reads older firmware that writes no summary", () => {
    const a = feed(FULL_WAKE.filter((l) => !l.includes("summary:")));
    expect(a.wakes[0]).toMatchObject({ summarised: false, state: "ran", frame: "updated" });
    expect(a.wakes[0].sources.map((s) => s.id)).toEqual(["s0", "s2"]);
  });

  it("keeps a bounded raw log", () => {
    let a = EMPTY_ACTIVITY;
    for (let i = 0; i < 2000; i++) a = addLine(a, "noise", i);
    expect(a.raw.length).toBe(1500);
    expect(a.raw[a.raw.length - 1].at).toBe(1999);
  });
});

describe("describeWake", () => {
  it("tells a wake in order, with names instead of ids", () => {
    const steps = describeWake(feed(FULL_WAKE).wakes[0], labels);
    expect(steps.map((s) => s.text)).toEqual([
      "Wi-Fi joined (Home, -61 dBm)",
      "Trains fetched (640 ms)",
      "Weather: not due",
      "Stripe failed: HTTP 401",
      "Screen “Home” drawn",
      "Panel updated",
      "Waiting awake (on USB) 5 min — next wake ≈ 19:08",
    ]);
    expect(steps[3].tone).toBe("bad");
  });

  it("says when nothing was due and nothing changed", () => {
    const a = feed([
      d("wake #9: Dither 0.9.0 on xiao-epaper-75, reset reason 8, heap 1"),
      d("nothing due: no network this wake"),
      d("clock set, online yes, usb no"),
      d("screen 1 drawn in 90 ms"),
      d("panel already shows this frame (00000001), left alone"),
      d("summary: wake=9 state=ran screen=1 frame=same online=yes clock=set sources=s0:wait sleep=60"),
      d("sleeping 60 s (deep sleep)"),
    ]);
    expect(describeWake(a.wakes[0], labels).map((s) => s.text)).toEqual([
      "Nothing due — Wi-Fi stayed off",
      "Trains: not due",
      "Screen “Commute” drawn",
      "Nothing changed — panel left alone",
      "Sleeping 60 s — next wake ≈ 19:04",
    ]);
  });

  it("explains a crash restart, a failed Wi-Fi, quiet hours and a panel with no design", () => {
    const crashed = feed([d("wake #1: Dither 0.9.0 on xiao-epaper-75, reset reason 4, heap 1"), d("wifi: joining 'A'"), d("wifi: 'A' failed (status 1)"), d("wifi: joining 'B'"), d("wifi: 'B' failed (status 6)"), d("source s0: due, but offline")]);
    expect(describeWake(crashed.wakes[0], labels).map((s) => s.text)).toEqual([
      "Restarted after a crash",
      "Wi-Fi failed: could not join A or B",
      "Trains: due, but offline",
    ]);
    const quiet = feed([d("wake #2: Dither 0.9.0 on xiao-epaper-75, reset reason 8, heap 1"), d("quiet hours until 07:00")]);
    expect(describeWake(quiet.wakes[0], labels)[0].text).toBe("Quiet hours until 07:00 — screen left as it was");
    const blank = feed([d("wake #1: Dither 0.9.0 on xiao-epaper-75, reset reason 1, heap 1"), d("not set up: no blob in the dither partition")]);
    expect(describeWake(blank.wakes[0], labels).map((s) => s.text)).toEqual(["Powered on", "Not set up: no blob in the dither partition"]);
  });
});

describe("summarize", () => {
  it("is empty before any wake", () => {
    expect(summarize(EMPTY_ACTIVITY)).toEqual({ last: null, lastRedraw: null, nextWakeAt: null, lastNetwork: null, sources: [] });
  });

  it("remembers each source's last real fetch across wakes that skipped it", () => {
    const quietWake = [
      d("wake #43: Dither 0.9.0 on xiao-epaper-75, reset reason 8, heap 1"),
      d("nothing due: no network this wake"),
      d("panel already shows this frame (00000001), left alone"),
      d("summary: wake=43 state=ran screen=0 frame=same online=yes clock=set sources=s0:wait,s1:wait,s2:wait sleep=300"),
      d("USB host connected: staying awake 300 s"),
    ];
    const a = feed(quietWake, T0 + 300_000, feed(FULL_WAKE));
    const s = summarize(a);
    expect(s.last?.number).toBe(43);
    expect(s.lastRedraw?.number).toBe(42);
    expect(s.lastNetwork?.number).toBe(42);
    expect(s.nextWakeAt).toBe(T0 + 300_000 + 4000 + 300_000);
    expect(s.sources).toEqual([
      { id: "s0", latest: "wait", lastAttempt: { id: "s0", outcome: "ok", ms: 640, at: T0 } },
      { id: "s1", latest: "wait", lastAttempt: null },
      { id: "s2", latest: "wait", lastAttempt: { id: "s2", outcome: "fail", error: "HTTP 401", at: T0 } },
    ]);
  });

  it("has no next wake while a wake is still running", () => {
    const a = feed([d("wake #44: Dither 0.9.0 on xiao-epaper-75, reset reason 8, heap 1")], T0 + 999_000, feed(FULL_WAKE));
    expect(summarize(a).nextWakeAt).toBeNull();
  });
});

describe("helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(5400)).toBe("1 h 30 min");
    expect(formatDuration(7200)).toBe("2 h");
  });

  it("reads the CRC the firmware logs from a blob header", () => {
    const blob = new Uint8Array(48);
    new DataView(blob.buffer).setUint32(12, 0x1a2b3c4d, true);
    expect(blobCrc(blob)).toBe(0x1a2b3c4d);
    expect(blobCrc(new Uint8Array(4))).toBeNull();
  });
});
