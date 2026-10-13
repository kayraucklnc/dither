// A pretend panel for working on the Panel activity view without one:
// open the app in dev with `?demo-activity` and click Connect. It replays
// three past wakes, then wakes every 20 seconds. Never part of a build.

export const DEMO_ACTIVITY = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("demo-activity");

export interface DemoShape {
  readonly sources: readonly string[];
  readonly screens: number;
  /** The CRC of the editor's design, so the pretend panel runs the same one. */
  readonly crc: number | null;
}

const LIVE_EVERY_MS = 20_000;
const LINE_GAP_MS = 350;
const d = (s: string) => `[dither] ${s}`;

const hex = (n: number) => n.toString(16).padStart(8, "0");

function wakeLines(n: number, shape: DemoShape, kind: "fetch" | "idle" | "fail", sleep: number): string[] {
  const screen = shape.screens > 1 && n % 3 === 0 ? 1 : 0;
  const lines = [
    d(`wake #${n}: Dither 0.9.0 on xiao-epaper-75, reset reason 8, heap 214332`),
    d(`blob ok: 98304 bytes, crc ${hex(shape.crc ?? 0x1a2b3c4d)}, built 1760380000, ${shape.screens} screens, ${shape.sources.length} sources, parsed in 41 ms, heap 182000`),
  ];
  const outcome = (i: number) => (kind === "idle" ? "wait" : i === shape.sources.length - 1 && kind === "fail" ? "fail" : i % 2 === 1 && kind === "fetch" ? "wait" : "ok");
  if (kind === "idle") {
    lines.push(d("nothing due: no network this wake"));
  } else {
    lines.push(d("wifi: joining 'Casa'"), d("wifi: joined 'Casa' in 2140 ms, rssi -61 dBm, ip 192.168.1.20"));
    lines.push(d("ntp: synced with pool.ntp.org in 280 ms, now 1760385780"));
    shape.sources.forEach((id, i) => {
      const o = outcome(i);
      if (o === "ok") lines.push(d(`source ${id}: ok in ${420 + i * 110} ms (88 values, 640 bytes of text kept), heap 151000`));
      if (o === "fail") lines.push(d(`source ${id}: failed: HTTP 401 (check the API key)`));
    });
  }
  lines.push(d("clock set, online yes, usb yes"), d(`screen ${screen} drawn in 118 ms`));
  lines.push(kind === "idle" ? d("panel already shows this frame (5e1f00aa), left alone") : d(`panel updated (${(0x5e1f0000 + n).toString(16)})`));
  const sources = shape.sources.map((id, i) => `${id}:${outcome(i)}`).join(",") || "-";
  lines.push(d(`summary: wake=${n} state=ran screen=${screen} frame=${kind === "idle" ? "same" : "updated"} online=yes clock=set sources=${sources} sleep=${sleep}`));
  lines.push(d("stack headroom 3912 bytes, heap 170112 (lowest 118400)"), d(`USB host connected: staying awake ${sleep} s`));
  return lines;
}

/** Feed pretend lines; returns a function that stops the feed. */
export function startDemo(shape: DemoShape, onLine: (line: string, at: number) => void): () => void {
  const now = Date.now();
  const past: [number, "fetch" | "idle" | "fail"][] = [[40, "fetch"], [41, "idle"], [42, "fail"]];
  past.forEach(([n, kind], i) => {
    const start = now - (past.length - i) * 5 * 60_000;
    wakeLines(n, shape, kind, 300).forEach((line, j) => onLine(line, start + j * 300));
  });
  const timers: ReturnType<typeof setTimeout>[] = [];
  let n = 43;
  const live = () => {
    const lines = wakeLines(n, shape, n % 2 === 0 ? "idle" : "fetch", LIVE_EVERY_MS / 1000);
    n += 1;
    lines.forEach((line, j) => timers.push(setTimeout(() => onLine(line, Date.now()), j * LINE_GAP_MS)));
  };
  timers.push(setTimeout(live, 1500));
  const every = setInterval(live, LIVE_EVERY_MS);
  return () => {
    clearInterval(every);
    timers.forEach(clearTimeout);
  };
}
