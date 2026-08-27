"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Battery, MoreHorizontal, RefreshCw, Trash2, Wifi } from "lucide-react";

import { ContextMenu, type MenuItem } from "@/components/flow/context-menu";
import { Confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";

export interface DeviceSummary {
  id: number;
  name: string;
  macAddress: string;
  percentCharged: number | null;
  rssi: number | null;
  lastSeenAt: Date | string | null;
  refreshRate: number;
  modelLabel: string;
  width: number;
  height: number;
  showing: string | null;
  /** What forgetting it would take with it. Cascaded by the database. */
  ruleCount: number;
  noticeCount: number;
}

const ago = (at: Date | string | null) => {
  if (!at) return "never seen";
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

/**
 * A device, and the picture it would be handed right now.
 *
 * The reason it is showing that picture rides along in a response header, so
 * the card can explain itself without a second request.
 */
export function DeviceCard({ device }: { device: DeviceSummary }) {
  const [src, setSrc] = useState<string>();
  const [reason, setReason] = useState<string>();
  const [screen, setScreen] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;

    setLoading(true);

    fetch(`/api/preview/device/${device.id}?v=${nonce}`)
      .then(async (response) => {
        if (!response.ok || cancelled) return;

        setReason(decodeURIComponent(response.headers.get("X-Dither-Reason") ?? ""));
        setScreen(decodeURIComponent(response.headers.get("X-Dither-Screen") ?? ""));

        url = URL.createObjectURL(await response.blob());
        if (cancelled) return URL.revokeObjectURL(url);

        setSrc((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return url;
        });
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [device.id, nonce]);

  const items: MenuItem[] = [
    {
      id: "open",
      label: "Open",
      hint: "Its tree, notices and settings",
      onSelect: () => router.push(`/devices/${device.id}`),
    },
    {
      id: "delete",
      label: "Forget this device",
      icon: Trash2,
      danger: true,
      hint: "It comes back if the panel is still on the network",
      onSelect: () => setConfirming(true),
    },
  ];

  return (
    <div className="group relative rounded-panel border border-line bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/devices/${device.id}`}
            className="text-[15px] font-semibold tracking-tight transition-colors hover:text-accent-bright"
          >
            {device.name}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
            <span>{device.modelLabel}</span>
            <span className="font-mono">
              {device.width}×{device.height}
            </span>
            {device.percentCharged !== null && (
              <span className="flex items-center gap-1">
                <Battery size={11} />
                {Math.round(device.percentCharged)}%
              </span>
            )}
            {device.rssi !== null && (
              <span className="flex items-center gap-1">
                <Wifi size={11} />
                {device.rssi}
              </span>
            )}
            <span>{ago(device.lastSeenAt)}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            title="Work it out again"
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-raised hover:text-ink"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          </button>

          <button
            type="button"
            aria-label={`More for ${device.name}`}
            onClick={(event) => setMenu({ x: event.clientX, y: event.clientY })}
            className="rounded-md p-1.5 text-faint opacity-0 transition-opacity hover:bg-raised hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>

      <Link
        href={`/devices/${device.id}`}
        className="block overflow-hidden rounded-lg bg-white"
        style={{ aspectRatio: `${device.width} / ${device.height}` }}
      >
        {loading && !src && <div className="loading-sheen h-full w-full" />}
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${device.name} showing ${screen ?? ""}`}
            className="h-full w-full paper-shadow"
          />
        )}
      </Link>

      <div className="mt-3 flex items-start gap-2">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-live" />
        <p className="text-[12px] leading-relaxed text-muted">
          {reason ?? "Working it out…"}
        </p>
      </div>

      {menu && <ContextMenu at={menu} items={items} onClose={() => setMenu(undefined)} />}

      {confirming && (
        <Confirm
          title={`Forget ${device.name}?`}
          body={
            "Everything this panel decides with is kept here, not on the panel, so it goes with it. " +
            "If the panel is still on your network it will introduce itself again on its next wake — " +
            "as a new device, with a new key and an empty tree."
          }
          losing={[
            `${device.ruleCount} rule${device.ruleCount === 1 ? "" : "s"} in its decision tree`,
            `${device.noticeCount} notice${device.noticeCount === 1 ? "" : "s"}`,
            "Its API key, and everything it has logged",
          ]}
          confirmLabel="Forget it"
          onConfirm={async () => {
            await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
            setConfirming(false);
            router.refresh();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
