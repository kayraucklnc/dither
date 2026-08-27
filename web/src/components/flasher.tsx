"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleAlert, Usb } from "lucide-react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";

/**
 * Writing firmware to a board over USB, from this page.
 *
 * This is here rather than pointing at a vendor tool because Dither is meant
 * to run panels no vendor lists - a Waveshare driver board wired up on a desk
 * is a device this server is happy to serve and no upstream flasher has ever
 * heard of. The binaries are the ones sitting in `public/downloads` on this
 * machine, so an installation with no internet can still bring a board up.
 *
 * The constraint worth knowing before you debug this: `navigator.serial` only
 * exists in a secure context. `http://localhost` counts, `https://anything`
 * counts, and `http://192.168.1.27:3001` does not - which is exactly the
 * address `make url` prints, so the failure is the common case rather than the
 * exotic one. The page says which of the two it is instead of failing when the
 * button is pressed.
 */

export interface FirmwareImage {
  name: string;
  path: string;
  bytes: number;
}

type Status = { kind: "idle" | "working" | "ok" | "error"; message: string };

/** Whether a browser can reach a serial port does not change while you look at it. */
const subscribeToNothing = () => () => {};

const BAUDS = [
  { value: 921_600, label: "921600", hint: "Fast. Wants a short cable." },
  { value: 460_800, label: "460800" },
  { value: 115_200, label: "115200", hint: "Slow and reliable" },
];

export function Flasher({ images }: { images: FirmwareImage[] }) {
  const [image, setImage] = useState(images[0]?.path ?? "");
  const [baud, setBaud] = useState(921_600);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "Idle." });
  const [progress, setProgress] = useState<number>();
  const [lines, setLines] = useState<string[]>([]);
  const busy = useRef(false);
  const log = useRef<HTMLPreElement>(null);

  /*
   * Why the port might not be reachable, or "" when it is.
   *
   * Read through useSyncExternalStore rather than in an effect because it is a
   * browser fact that has no server answer: `navigator` does not exist there
   * and `isSecureContext` is not a thing the server can guess. The server
   * snapshot is the optimistic one, so a page rendered for a browser that can
   * flash never blinks through the warning on its way to the button.
   */
  const unreachable = useSyncExternalStore(
    subscribeToNothing,
    () =>
      "serial" in navigator
        ? ""
        : window.isSecureContext
          ? "This browser has no WebSerial. Chrome, Edge or Opera on a desktop can do it; Firefox and Safari cannot."
          : `This page is at ${window.location.origin}, which the browser does not treat as a secure context, so it hides the serial port. Open the dashboard at http://localhost:${window.location.port || "3000"} on the machine running Dither, or put it behind HTTPS.`,
    () => "",
  );

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [lines]);

  const say = (line: string) => setLines((previous) => [...previous, line]);

  const run = async () => {
    if (busy.current || !image) return;
    busy.current = true;

    setLines([]);
    setProgress(undefined);

    // Imported here rather than at the top of the file: esptool-js reaches for
    // `navigator.serial` as it loads, so pulling it into the server bundle
    // breaks the page for everybody, flashing or not.
    const { ESPLoader, Transport } = await import("esptool-js");

    const terminal = {
      clean: () => setLines([]),
      writeLine: (data: string) => say(data),
      write: (data: string) =>
        setLines((previous) => [...previous.slice(0, -1), (previous.at(-1) ?? "") + data]),
    };

    let transport: InstanceType<typeof Transport> | undefined;

    try {
      setStatus({ kind: "working", message: "Waiting for you to pick a port…" });

      const port = await navigator.serial.requestPort();
      transport = new Transport(port, true);

      const loader = new ESPLoader({ transport, baudrate: baud, terminal });

      const chip = await loader.main();
      setStatus({ kind: "working", message: `Connected to ${chip}.` });
      say(`Detected chip: ${chip}`);

      const response = await fetch(image);
      if (!response.ok) throw new Error(`Could not read the image (HTTP ${response.status}).`);

      const buffer = await response.arrayBuffer();
      say(`Image is ${buffer.byteLength.toLocaleString()} bytes.`);

      setStatus({ kind: "working", message: "Writing…" });
      setProgress(0);

      await loader.writeFlash({
        // Offset zero, so the image has to be a merged one - bootloader,
        // partition table and application in a single file. A bare
        // firmware.bin written here produces a board that does not boot.
        fileArray: [{ data: new Uint8Array(buffer), address: 0 }],
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (_index: number, written: number, total: number) =>
          setProgress(total ? written / total : 0),
      });

      setProgress(1);
      await loader.after();

      setStatus({ kind: "ok", message: "Written. Power-cycle the board." });
      say("Flash complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ kind: "error", message });
      say(`ERROR: ${message}`);
    } finally {
      try {
        await transport?.disconnect();
      } catch {
        // Already gone. There is nothing left to release.
      }
      busy.current = false;
    }
  };

  if (unreachable) {
    return (
      <div className="flex items-start gap-3 rounded-panel border border-line bg-surface p-5">
        <CircleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
        <p className="text-[13px] leading-relaxed text-muted">{unreachable}</p>
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      {images.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted">
          No firmware images to write. Drop a <em>merged</em> <code className="font-mono">.bin</code>{" "}
          — bootloader, partition table and application in one file — into{" "}
          <code className="font-mono text-ink">web/public/downloads/</code> and reload. A bare{" "}
          <code className="font-mono">firmware.bin</code> written at offset 0 produces a board that
          does not boot.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
                Image
              </span>
              <Select
                value={image}
                ariaLabel="Firmware image"
                options={images.map((one) => ({
                  value: one.path,
                  label: one.name,
                  hint: `${(one.bytes / 1024).toFixed(0)} kB`,
                }))}
                onChange={setImage}
              />
            </label>

            <label className="block sm:w-40">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
                Baud
              </span>
              <Select value={baud} ariaLabel="Baud rate" options={BAUDS} onChange={setBaud} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={status.kind === "working"}
              className={cn(
                "flex items-center gap-2 rounded-lg bg-accent/20 px-3.5 py-2 text-[13px] font-medium text-accent-bright",
                "transition-colors hover:bg-accent/30 disabled:opacity-50",
              )}
            >
              <Usb size={15} />
              Connect and write
            </button>

            <span
              className={cn(
                "text-[12px]",
                status.kind === "error"
                  ? "text-danger"
                  : status.kind === "ok"
                    ? "text-live"
                    : "text-muted",
              )}
            >
              {status.message}
            </span>
          </div>

          {progress !== undefined && (
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-raised">
              <div
                className="h-full bg-accent transition-[width] duration-150"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}

          {lines.length > 0 && (
            <pre
              ref={log}
              aria-live="polite"
              className="mt-4 max-h-56 overflow-auto rounded-lg bg-ground/60 p-3 font-mono text-[11px] leading-relaxed text-muted"
            >
              {lines.join("\n")}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
