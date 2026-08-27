import { count, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { MonitorSmartphone, Usb } from "lucide-react";

import { DeviceCard } from "@/components/device-card";
import { db } from "@/lib/db";
import { decisionNodes, devices, models, notices } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * What every panel is showing, right now.
 *
 * Each card renders the device's decision for real - the tree walked, the
 * notices evaluated, the same renderer - rather than a stand-in. If it is on
 * this page it is on the wall.
 *
 * There is no "add a device" button and there is not going to be one. A panel
 * puts itself on this page by calling /api/setup, because the one thing that
 * identifies it - its MAC address - is known to the panel and to nobody else.
 * What a person can do from here is the opposite: forget one.
 */
export default async function DevicesPage() {
  // Counted in the database rather than joined, because a device with eleven
  // rules and eight notices would otherwise come back eighty-eight times.
  const ruleCounts = db
    .select({ deviceId: decisionNodes.deviceId, rules: count().as("rules") })
    .from(decisionNodes)
    .groupBy(decisionNodes.deviceId)
    .as("rule_counts");

  const noticeCounts = db
    .select({ deviceId: notices.deviceId, alerts: count().as("alerts") })
    .from(notices)
    .groupBy(notices.deviceId)
    .as("notice_counts");

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
      ruleCount: sql<number>`coalesce(${ruleCounts.rules}, 0)`.mapWith(Number),
      noticeCount: sql<number>`coalesce(${noticeCounts.alerts}, 0)`.mapWith(Number),
    })
    .from(devices)
    .innerJoin(models, eq(models.id, devices.modelId))
    .leftJoin(decisionNodes, eq(decisionNodes.id, devices.currentNodeId))
    .leftJoin(ruleCounts, eq(ruleCounts.deviceId, devices.id))
    .leftJoin(noticeCounts, eq(noticeCounts.deviceId, devices.id))
    .orderBy(devices.id);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
            Every panel on your network and what it is showing. These are real renders, not
            approximations — the same picture the device would be handed if it woke up now.
          </p>
        </div>

        <Link
          href="/devices/new"
          className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <Usb size={15} className="text-faint" />
          Add a panel
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line p-12 text-center">
          <MonitorSmartphone size={22} className="mx-auto text-faint" />
          <p className="mt-4 text-[14px] text-muted">
            No devices yet. A panel registers itself the first time it calls{" "}
            <code className="font-mono text-[13px] text-ink">/api/setup</code>.
          </p>
          <Link
            href="/devices/new"
            className="mt-4 inline-block text-[13px] text-accent-bright hover:underline"
          >
            How to get one talking to this server
          </Link>
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
