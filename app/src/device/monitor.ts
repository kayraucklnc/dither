// Watch the panel's log after flashing: reopen the port as a plain serial
// reader and hand back "[dither]" lines.

import { listBoards } from "./boards";
import { toDeviceError, type DeviceError } from "./errors";

export const DITHER_PREFIX = "[dither]";
const MONITOR_BAUD = 115200;
const OPEN_ATTEMPTS = 20;
const OPEN_RETRY_MS = 250;

export interface MonitorOptions {
  /** Keep only lines starting with this; null keeps every line. Default "[dither]". */
  readonly prefix?: string | null;
  /** Called for each line. Use this or iterate `lines`, not both. */
  readonly onLine?: (line: string) => void;
  /** With onLine: called once when reading stops — null when closed, an error when the panel went away. */
  readonly onEnd?: (error: DeviceError | null) => void;
}

export interface Monitor {
  readonly port: SerialPort;
  readonly lines: AsyncIterable<string>;
  close(): Promise<void>;
}

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Split a stream of text into lines; returns a function fed chunk by chunk. */
export function createLineSplitter(): (chunk: string) => string[] {
  let rest = "";
  return (chunk) => {
    const parts = (rest + chunk).split("\n");
    rest = parts.pop() ?? "";
    return parts.map((line) => line.replace(ANSI, "").replace(/\r$/, ""));
  };
}

export function keepLine(line: string, prefix: string | null): boolean {
  return prefix === null || line.startsWith(prefix);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isPanelPort(port: SerialPort): boolean {
  const { usbVendorId, usbProductId } = port.getInfo();
  return listBoards().some((b) =>
    b.usbFilters.some((f) => f.usbVendorId === usbVendorId && (f.usbProductId ?? usbProductId) === usbProductId),
  );
}

/** The panel re-enumerates after a reset, so the old port object may be gone; look again each try. */
async function candidates(port: SerialPort | undefined): Promise<SerialPort[]> {
  const known = (await navigator.serial.getPorts()).filter(isPanelPort);
  return port ? [port, ...known.filter((p) => p !== port)] : known;
}

async function openAny(port: SerialPort | undefined): Promise<SerialPort> {
  let lastError: unknown = new Error("No panel port found");
  for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt++) {
    for (const candidate of await candidates(port)) {
      try {
        await candidate.open({ baudRate: MONITOR_BAUD });
        return candidate;
      } catch (err) {
        lastError = err;
      }
    }
    await sleep(OPEN_RETRY_MS);
  }
  throw toDeviceError(lastError);
}

/** Release both control lines without resetting the chip (RTS first, then DTR). */
async function quietSignals(port: SerialPort): Promise<void> {
  try {
    await port.setSignals({ requestToSend: false });
    await port.setSignals({ dataTerminalReady: false });
  } catch {
    // Not every adapter supports control lines; reading works without them.
  }
}

async function* readLines(reader: ReadableStreamDefaultReader<Uint8Array>, prefix: string | null) {
  const decoder = new TextDecoder();
  const split = createLineSplitter();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    for (const line of split(decoder.decode(value, { stream: true }))) {
      if (keepLine(line, prefix)) yield line;
    }
  }
}

export async function openMonitor(port?: SerialPort, options: MonitorOptions = {}): Promise<Monitor> {
  const opened = await openAny(port);
  await quietSignals(opened);
  if (!opened.readable) {
    await opened.close();
    throw toDeviceError(new Error("device has been lost"));
  }
  const reader = opened.readable.getReader();
  const lines = readLines(reader, options.prefix === undefined ? DITHER_PREFIX : options.prefix);
  let closing: Promise<void> | null = null;

  const close = () =>
    (closing ??= (async () => {
      try {
        await reader.cancel();
      } finally {
        reader.releaseLock();
        await opened.close();
      }
    })());

  const pump = async (onLine: (line: string) => void) => {
    try {
      for await (const line of lines) onLine(line);
      options.onEnd?.(null);
    } catch (err) {
      // The device went away mid-read: report it, then release what is left of the port.
      options.onEnd?.(toDeviceError(err));
      await close().catch(() => undefined);
    }
  };
  if (options.onLine) void pump(options.onLine);

  return { port: opened, lines, close };
}
