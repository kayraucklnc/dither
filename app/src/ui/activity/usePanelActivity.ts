// Listen to the panel's log over USB and keep what it said. The port is opened
// as a plain serial reader; the only things written are requests (a wake now,
// the wake history the panel keeps in flash), never anything that changes it.
// Lives above the views so the history survives switching between them.

import { useCallback, useEffect, useRef, useState } from "react";
import { addLine, EMPTY_ACTIVITY, type Activity } from "@/device/activity";
import { addHistoryLine, EMPTY_HISTORY, HISTORY_COMMAND, type History } from "@/device/history";
import { DeviceError, isPanelPort, openMonitor, PanelConnection, toDeviceError, type Board, type Monitor } from "@/device";
import { startDemo, type DemoShape } from "./demo";

export type Link =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "watching"; since: number }
  /** The Flash dialog has the port; picked up again when it closes. */
  | { kind: "paused" }
  /** Unplugged, restarting or asleep; reconnects by itself when the panel comes back. */
  | { kind: "lost" }
  | { kind: "error"; reason: "busy" | "unsupported" | "other"; message: string };

export interface PanelActivity {
  readonly link: Link;
  readonly activity: Activity;
  /** What the panel did while nobody was watching, from its own flash. */
  readonly history: History;
  /** From a click: may open the browser's port chooser. */
  readonly connect: () => void;
  /** Watch again without asking, e.g. after the Flash dialog lets go of the port. */
  readonly watch: () => void;
  readonly disconnect: () => void;
  readonly clear: () => void;
  /** Asks the panel for a wake now; it wakes as it would on its own. */
  readonly wakeNow: () => Promise<void>;
  /** Asks the panel for its wake history again. */
  readonly loadHistory: () => Promise<void>;
}

export const BUSY_MESSAGE =
  "Something else has the panel's port open: another Dither tab, Arduino IDE or a serial monitor. Close it, then try again.";

async function askForPort(board: Board | null): Promise<SerialPort | undefined> {
  const granted = (await navigator.serial.getPorts()).filter(isPanelPort);
  if (granted.length > 0) return undefined; // openMonitor tries every granted panel port
  return navigator.serial.requestPort({ filters: [...(board?.usbFilters ?? [])] });
}

export function usePanelActivity({ board, paused, demo }: { board: Board | null; paused: boolean; demo: DemoShape | null }): PanelActivity {
  const [link, setLink] = useState<Link>({ kind: "idle" });
  const [activity, setActivity] = useState<Activity>(EMPTY_ACTIVITY);
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const monitor = useRef<Monitor | null>(null);
  const stopDemo = useRef<(() => void) | null>(null);
  // Bumped whenever the port is let go: callbacks from an older attempt report to nobody.
  const attempt = useRef(0);
  /** The person wants to be watching; pausing and unplugging do not change that. */
  const wanted = useRef(false);
  const demoRef = useRef(demo);
  demoRef.current = demo;

  const release = useCallback(() => {
    attempt.current += 1;
    const m = monitor.current;
    monitor.current = null;
    void m?.close().catch(() => undefined);
    stopDemo.current?.();
    stopDemo.current = null;
  }, []);

  const open = useCallback(async (ask: boolean) => {
    release();
    const a = attempt.current;
    const current = () => a === attempt.current;
    setLink({ kind: "connecting" });
    const shape = demoRef.current;
    if (shape) {
      stopDemo.current = startDemo(shape, (line, at) => current() && setActivity((x) => addLine(x, line, at)));
      setLink({ kind: "watching", since: Date.now() });
      return;
    }
    if (!PanelConnection.isSupported()) {
      setLink({ kind: "error", reason: "unsupported", message: "Watching the panel needs Chrome or Edge on a computer — this browser cannot talk to USB devices." });
      return;
    }
    try {
      const port = ask ? await askForPort(board) : undefined;
      if (!current()) return;
      const m = await openMonitor(port, {
        prefix: null,
        onLine: (line) => {
          if (!current()) return;
          setActivity((x) => addLine(x, line, Date.now()));
          setHistory((h) => addHistoryLine(h, line));
        },
        onEnd: () => {
          if (!current()) return;
          monitor.current = null;
          setLink({ kind: "lost" });
        },
      });
      if (!current()) return void m.close().catch(() => undefined);
      monitor.current = m;
      setLink({ kind: "watching", since: Date.now() });
      // Answered once the panel is between wakes; older firmware says it does not know it.
      void m.send(HISTORY_COMMAND).catch(() => undefined);
    } catch (e) {
      if (!current()) return;
      const err = e instanceof DeviceError ? e : toDeviceError(e);
      if (err.kind === "cancelled") {
        wanted.current = false;
        setLink({ kind: "idle" });
      } else if (err.kind === "busy") {
        setLink({ kind: "error", reason: "busy", message: BUSY_MESSAGE });
      } else if (!ask) {
        setLink({ kind: "lost" });
      } else {
        setLink({ kind: "error", reason: err.kind === "unsupported" ? "unsupported" : "other", message: err.message });
      }
    }
  }, [board, release]);

  const connect = useCallback(() => {
    wanted.current = true;
    void open(true);
  }, [open]);

  const watch = useCallback(() => {
    wanted.current = true;
    if (!paused) void open(false);
  }, [open, paused]);

  const disconnect = useCallback(() => {
    wanted.current = false;
    release();
    setLink({ kind: "idle" });
  }, [release]);

  const clear = useCallback(() => {
    setActivity(EMPTY_ACTIVITY);
    setHistory(EMPTY_HISTORY);
  }, []);

  /** Ask the panel for a wake now, rather than waiting out its interval. A normal wake: nothing else changes. */
  const wakeNow = useCallback(async () => {
    await monitor.current?.send("CMD:WAKE");
  }, []);

  const loadHistory = useCallback(async () => {
    await monitor.current?.send(HISTORY_COMMAND);
  }, []);

  // Give the port to the Flash dialog while it is open, and take it back after.
  useEffect(() => {
    if (!wanted.current) return;
    if (paused) {
      release();
      setLink({ kind: "paused" });
    } else {
      void open(false);
    }
  }, [paused, open, release]);

  // The panel came back (plugged in, or restarted after a flash): listen again.
  useEffect(() => {
    if (link.kind !== "lost" || typeof navigator === "undefined" || !("serial" in navigator)) return;
    const again = (e: Event) => {
      const port = e.target as SerialPort | null;
      if (wanted.current && (!port || isPanelPort(port))) void open(false);
    };
    navigator.serial.addEventListener("connect", again);
    return () => navigator.serial.removeEventListener("connect", again);
  }, [link.kind, open]);

  useEffect(() => release, [release]);

  return { link, activity, history, connect, watch, disconnect, clear, wakeNow, loadHistory };
}
