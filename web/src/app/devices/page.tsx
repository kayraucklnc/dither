import { eq } from "drizzle-orm";
import Link from "next/link";
import { Battery, MonitorSmartphone, Wifi } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { db } from "@/lib/db";
import { devices, flowStates, models } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      macAddress: devices.macAddress,
      percentCharged: devices.percentCharged,
      rssi: devices.rssi,
      lastSeenAt: devices.lastSeenAt,
      modelId: models.id,
      modelLabel: models.label,
      width: models.width,
      height: models.height,
      stateName: flowStates.name,
      screenId: flowStates.screenId,
    })
    .from(devices)
    .innerJoin(models, eq(models.id, devices.modelId))
    .leftJoin(flowStates, eq(flowStates.id, devices.currentStateId));

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          Each panel on your network, and what it is showing right now. Open one to change how it
          decides.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line p-12 text-center">
          <MonitorSmartphone size={22} className="mx-auto text-faint" />
          <p className="mt-4 text-[14px] text-muted">
            No devices yet. A panel registers itself the first time it calls{" "}
            <code className="font-mono text-[13px] text-ink">/api/setup</code>.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((device) => (
            <Link
              key={device.id}
              href={`/devices/${device.id}`}
              className="rounded-panel border border-line bg-surface p-3 transition-colors hover:border-line-strong"
            >
              {device.screenId ? (
                <ScreenPreview
                  src={`/api/preview/screen/${device.screenId}?modelId=${device.modelId}`}
                  width={device.width}
                  height={device.height}
                  alt={`${device.name} is showing ${device.stateName}`}
                  className="paper-shadow"
                />
              ) : (
                <div
                  className="grid place-items-center rounded-md border border-dashed border-line text-[12px] text-faint"
                  style={{ aspectRatio: `${device.width} / ${device.height}` }}
                >
                  Nothing set up yet
                </div>
              )}

              <div className="px-1 pt-3 pb-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="truncate text-[14px] font-medium">{device.name}</h2>
                  <span className="shrink-0 text-[11px] text-faint">{device.modelLabel}</span>
                </div>

                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-faint">
                  {device.stateName && (
                    <span className="flex items-center gap-1 text-live">
                      <span className="h-1.5 w-1.5 rounded-full bg-live" />
                      {device.stateName}
                    </span>
                  )}
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
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
