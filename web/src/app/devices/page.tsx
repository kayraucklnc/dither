import { eq } from "drizzle-orm";
import Link from "next/link";
import { Battery, MonitorSmartphone, Wifi } from "lucide-react";

import { DeviceCard } from "@/components/device-card";
import { db } from "@/lib/db";
import { decisionNodes, devices, models } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * What every panel is showing, right now.
 *
 * Each card renders the device's decision for real - the tree walked, the
 * notices evaluated, the same renderer - rather than a stand-in. If it is on
 * this page it is on the wall.
 */
export default async function DevicesPage() {
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      macAddress: devices.macAddress,
      percentCharged: devices.percentCharged,
      rssi: devices.rssi,
      lastSeenAt: devices.lastSeenAt,
      refreshRate: devices.refreshRate,
      modelLabel: models.label,
      width: models.width,
      height: models.height,
      showing: decisionNodes.label,
    })
    .from(devices)
    .innerJoin(models, eq(models.id, devices.modelId))
    .leftJoin(decisionNodes, eq(decisionNodes.id, devices.currentNodeId));

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          Every panel on your network and what it is showing. These are real renders, not
          approximations — the same picture the device would be handed if it woke up now.
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
        <div className="grid gap-6 lg:grid-cols-2">
          {rows.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}
    </div>
  );
}
