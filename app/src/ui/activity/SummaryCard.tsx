// The card on top of Panel activity: the latest wake at a glance.

import type { ReactNode } from "react";
import { formatDuration, type ActivitySummary, type Labels, type SourceSummary, type Wake } from "@/device/activity";

function Tile({ label, value, detail, tone }: { label: string; value: ReactNode; detail: ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="min-w-0 space-y-0.5 p-4">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`truncate text-[17px] font-semibold ${tone === "bad" ? "text-danger" : ""}`}>{value}</div>
      <div className={`text-[13px] ${tone ? "text-danger" : "text-muted"}`}>{detail}</div>
    </div>
  );
}

/** "2 min ago" / "just now" for what happened; "in 3 min" / "any moment now" for what is expected. */
export function relative(ms: number, now: number, kind: "past" | "future"): string {
  const s = Math.round((ms - now) / 1000);
  if (kind === "past") return s > -20 ? "just now" : `${formatDuration(-s)} ago`;
  return s < 20 ? (s < 0 ? `${formatDuration(-s)} ago` : "any moment now") : `in ${formatDuration(s)}`;
}

function screenTile(last: Wake, lastRedraw: Wake | null, labels: Labels) {
  const name = last.screen !== undefined ? `“${labels.screen(last.screen)}”` : "—";
  if (last.state === "not-set-up") return <Tile label="Screen" value="Not set up" detail={last.notSetUp ?? "No design on it yet. Flash one."} tone="bad" />;
  if (last.state === "quiet") return <Tile label="Screen" value="Quiet hours" detail={`Left as it was until ${last.quietUntil}`} />;
  if (last.frame === "updated") return <Tile label="Screen" value={name} detail="Redrawn" />;
  if (last.frame === "failed") return <Tile label="Screen" value={name} detail="The panel did not take the new picture" tone="bad" />;
  if (last.frame === "same") {
    const since = lastRedraw ? `; last redrawn ${labels.time(lastRedraw.at)}` : "";
    return <Tile label="Screen" value={name} detail={`Unchanged — left alone${since}`} />;
  }
  return <Tile label="Screen" value={name} detail="Deciding…" />;
}

function nextTile(summary: ActivitySummary, now: number, labels: Labels) {
  const { last, nextWakeAt } = summary;
  if (last?.state === "running") return <Tile label="Next wake" value="Awake now" detail="Working through this wake" />;
  if (nextWakeAt === null) return <Tile label="Next wake" value="—" detail="Known once a wake finishes" />;
  const late = now - nextWakeAt > 90_000;
  return (
    <Tile label="Next wake" value={`≈ ${labels.time(nextWakeAt)}`} tone={late ? "warn" : undefined}
      detail={late ? `Expected ${relative(nextWakeAt, now, "past")} — unplugged or asleep?` : relative(nextWakeAt, now, "future")} />
  );
}

function wifiTile(summary: ActivitySummary, labels: Labels) {
  const { last, lastNetwork } = summary;
  if (!last) return null;
  const earlier = lastNetwork && lastNetwork !== last ? lastNetwork.wifi.find((w) => w.joined) : undefined;
  if (last.network === "skipped") {
    return <Tile label="Wi-Fi" value="Stayed off" detail={earlier && lastNetwork ? `Nothing was due; joined ${earlier.ssid} at ${labels.time(lastNetwork.at)}` : "Nothing was due this wake"} />;
  }
  const joined = last.wifi.find((w) => w.joined === true);
  if (joined) return <Tile label="Wi-Fi" value="Joined" detail={`${joined.ssid}${joined.rssi !== undefined ? ` · ${joined.rssi} dBm` : ""}`} />;
  const failed = last.wifi.filter((w) => w.joined === false);
  if (failed.length > 0) return <Tile label="Wi-Fi" value="Failed" tone="bad" detail={`Could not join ${failed.map((w) => w.ssid).join(" or ")}`} />;
  if (last.wifi.length > 0) return <Tile label="Wi-Fi" value="Joining…" detail={last.wifi[last.wifi.length - 1].ssid} />;
  if (last.state === "ran" && last.online === false) return <Tile label="Wi-Fi" value="Offline" tone="warn" detail="No network is set, or none answered" />;
  return <Tile label="Wi-Fi" value="—" detail="Not needed this wake" />;
}

const CHIP: Record<string, string> = {
  ok: "bg-accent-soft text-accent",
  bad: "bg-danger-soft text-danger",
  muted: "bg-ink/5 text-muted",
};

function SourceRow({ s, labels }: { s: SourceSummary; labels: Labels }) {
  const tried = s.lastAttempt;
  const [chip, tone] =
    s.latest === "offline" ? ["Offline", "bad"]
    : s.latest === "noclock" ? ["Waiting for the clock", "bad"]
    : tried?.outcome === "fail" ? ["Failed", "bad"]
    : tried?.outcome === "ok" ? ["OK", "ok"]
    : ["Not due yet", "muted"];
  const detail =
    tried?.outcome === "fail" ? <>at {labels.time(tried.at)}: <span className="font-mono text-[12px] text-ink">{tried.error ?? "no reason given"}</span></>
    : tried?.outcome === "ok" ? `fetched ${labels.time(tried.at)}${tried.ms !== undefined ? ` in ${tried.ms} ms` : ""}${s.latest === "wait" ? " · not due again yet" : ""}`
    : "not fetched since you connected; the panel draws what it fetched before";
  return (
    <li className="grid grid-cols-[minmax(0,180px)_auto_minmax(0,1fr)] items-baseline gap-3 py-2">
      <span className="truncate font-medium" title={s.id}>{labels.source(s.id)}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[tone]}`}>{chip}</span>
      <span className="min-w-0 break-words text-[13px] text-muted">{detail}</span>
    </li>
  );
}

export function SummaryCard({ summary, labels, now }: { summary: ActivitySummary; labels: Labels; now: number }) {
  const { last, lastRedraw, sources } = summary;
  if (!last) return null;
  return (
    <section className="rounded-lg border border-line bg-raised" aria-label="Latest wake">
      <div className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
        <Tile label="Last wake" value={labels.time(last.at)} detail={`${last.number !== null ? `#${last.number} · ` : ""}${relative(last.at, now, "past")}`} />
        {screenTile(last, lastRedraw, labels)}
        {nextTile(summary, now, labels)}
        {wifiTile(summary, labels)}
      </div>
      {sources.length > 0 && (
        <div className="border-t border-line px-4 py-2">
          <ul className="divide-y divide-line">
            {sources.map((s) => <SourceRow key={s.id} s={s} labels={labels} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
