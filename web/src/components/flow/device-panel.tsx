"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff, Loader2, Moon, Trash2 } from "lucide-react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { fromClock, toClock } from "@/lib/quiet-hours";

export interface DeviceDetails {
  id: number;
  name: string;
  macAddress: string;
  apiKey: string;
  modelLabel: string;
  width: number;
  height: number;
  refreshRate: number;
  imageTimeout: number;
  sleepStartMinute: number | null;
  sleepStopMinute: number | null;
  firmwareVersion: string | null;
}

const input =
  "w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] text-ink " +
  "outline-none transition-colors focus:border-accent/70";

/**
 * What the device is, rather than what it decides.
 *
 * Quiet hours are here rather than in the tree on purpose: they are not a
 * decision about *what* to show, they are an instruction to stop waking. A
 * panel costs nothing to leave lit and a lot to refresh.
 */
export function DevicePanel({ device }: { device: DeviceDetails }) {
  const [draft, setDraft] = useState(device);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const save = async (patch: Partial<DeviceDetails>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setState("saving");

    await fetch(`/api/devices/${device.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: next.name,
        refreshRate: next.refreshRate,
        imageTimeout: next.imageTimeout,
        sleepStartMinute: next.sleepStartMinute,
        sleepStopMinute: next.sleepStopMinute,
      }),
    });

    setState("saved");
  };

  const quiet = draft.sleepStartMinute !== null && draft.sleepStopMinute !== null;

  return (
    <div className="space-y-5 p-4">
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
          Name
        </label>
        <input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          onBlur={() => save({})}
          className={input}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
          Wake every
        </label>
        <Select
          value={draft.refreshRate}
          ariaLabel="Wake every"
          options={[
            { value: 60, label: "Every minute", hint: "Heavy on the battery" },
            { value: 300, label: "Every 5 minutes" },
            { value: 900, label: "Every 15 minutes", hint: "A sensible default" },
            { value: 1800, label: "Every 30 minutes" },
            { value: 3600, label: "Every hour" },
            { value: 21600, label: "Every 6 hours", hint: "Months on a charge" },
          ]}
          onChange={(refreshRate) => save({ refreshRate })}
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          Used unless the screen it lands on asks for something faster.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-ground/40 p-3">
        <button
          type="button"
          onClick={() =>
            save(
              quiet
                ? { sleepStartMinute: null, sleepStopMinute: null }
                : { sleepStartMinute: 23 * 60, sleepStopMinute: 7 * 60 },
            )
          }
          className="flex w-full items-center gap-2 text-left"
        >
          <Moon size={13} className={cn("shrink-0", quiet ? "text-accent-bright" : "text-faint")} />
          <span className="flex-1 text-[12px] font-medium">Quiet hours</span>
          <span
            className={cn(
              "h-4 w-7 shrink-0 rounded-full border p-0.5 transition-colors",
              quiet ? "border-accent/60 bg-accent/30" : "border-line bg-ground",
            )}
          >
            <span
              className={cn(
                "block h-2.5 w-2.5 rounded-full transition-transform",
                quiet ? "translate-x-3 bg-accent" : "bg-faint",
              )}
            />
          </span>
        </button>

        {quiet && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="time"
              value={toClock(draft.sleepStartMinute ?? 0)}
              onChange={(event) => save({ sleepStartMinute: fromClock(event.target.value) })}
              className={input}
            />
            <span className="shrink-0 text-[12px] text-faint">to</span>
            <input
              type="time"
              value={toClock(draft.sleepStopMinute ?? 0)}
              onChange={(event) => save({ sleepStopMinute: fromClock(event.target.value) })}
              className={input}
            />
          </div>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {quiet
            ? "It keeps whatever it is showing and sleeps until the window ends — one wake instead of forty."
            : "Stop the panel waking overnight. It keeps the last picture; e-ink costs nothing to leave lit."}
        </p>
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-faint">This panel</p>

        <dl className="space-y-1.5 text-[12px]">
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Model</dt>
            <dd>{draft.modelLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Size</dt>
            <dd className="font-mono">
              {draft.width}×{draft.height}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Firmware</dt>
            <dd className="font-mono">{draft.firmwareVersion ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-faint">MAC</dt>
            <dd className="font-mono">{draft.macAddress}</dd>
          </div>
        </dl>

        <div>
          <p className="mb-1 text-[11px] text-faint">API key</p>
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-md bg-raised px-2 py-1.5 font-mono text-[11px]">
              {revealed ? draft.apiKey : "•".repeat(Math.min(24, draft.apiKey.length))}
            </code>
            <button
              type="button"
              onClick={() => setRevealed((value) => !value)}
              className="shrink-0 rounded-md p-1.5 text-faint transition-colors hover:text-ink"
            >
              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(draft.apiKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-md p-1.5 text-faint transition-colors hover:text-ink"
            >
              {copied ? <Check size={13} className="text-live" /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex items-center gap-1.5 text-[12px] text-faint">
          {state === "saving" && <Loader2 size={12} className="animate-spin" />}
          {state === "saved" && <Check size={12} className="text-live" />}
          {{ idle: "", saving: "Saving", saved: "Saved" }[state]}
        </span>

        <button
          type="button"
          onClick={async () => {
            await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
            router.push("/devices");
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-faint transition-colors hover:bg-danger/15 hover:text-danger"
        >
          <Trash2 size={13} />
          Forget this device
        </button>
      </div>
    </div>
  );
}
