// Panel activity: what the real panel did, wake by wake, read from its log.
// The editor's preview is a simulation; this is the panel speaking.

import { useEffect, useMemo, useState } from "react";
import { AlarmClock, Cable, Copy, Loader2, Unplug } from "lucide-react";
import { describeWake, formatDuration, summarize, type Labels, type Step, type Wake } from "@/device/activity";
import { Button, Note } from "../kit";
import type { ActivityNames } from "./labels";
import { SummaryCard } from "./SummaryCard";
import type { Link, PanelActivity } from "./usePanelActivity";

const MAX_SHOWN = 60;
const TICK_MS = 15_000;

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const clockSeconds = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ConnectionBar({ link, onConnect, onStop, onWake, refresh }: { link: Link; onConnect: () => void; onStop: () => void; onWake: () => Promise<void>; refresh: string }) {
  switch (link.kind) {
    case "idle":
      return (
        <div className="flex items-start gap-4 rounded-lg border border-line bg-raised p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Cable size={20} /></span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">Plug the panel into this computer and connect.</p>
            <p className="text-[13px] text-muted">
              While a computer is attached, the panel stays awake between wakes instead of sleeping, so every wake shows up here —
              at most {refresh} apart, or press Wake now. Dither only listens and asks for wakes; nothing on the panel changes.
            </p>
          </div>
          <Button variant="primary" icon={<Cable size={15} />} onClick={onConnect}>Connect</Button>
        </div>
      );
    case "connecting":
      return <p className="flex items-center gap-2 text-muted"><Loader2 size={15} className="animate-spin text-accent" /> Opening the panel's port…</p>;
    case "watching":
      return (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium">Listening to the panel</span>
          <span className="text-muted">since {clock(link.since)}</span>
          <Button size="sm" className="ml-auto" icon={<AlarmClock size={14} />} onClick={() => void onWake().catch(() => undefined)} title="The panel wakes now as it would on its own: fetches what is due, draws, and redraws only if something changed.">
            Wake now
          </Button>
          <Button size="sm" variant="ghost" icon={<Unplug size={14} />} onClick={onStop}>Stop listening</Button>
        </div>
      );
    case "paused":
      return <Note>Paused while the Flash dialog uses the panel. Listening starts again when it closes.</Note>;
    case "lost":
      return (
        <Note tone="warn">
          <div className="flex items-center gap-3">
            <span className="flex-1">The panel went away — unplugged, restarting after a flash, or asleep. Plug it back in and this page picks it up by itself.</span>
            <Button size="sm" onClick={onConnect}>Connect</Button>
          </div>
        </Note>
      );
    case "error":
      return (
        <Note tone="warn">
          <div className="flex items-center gap-3">
            <span className="flex-1">{link.message}</span>
            {link.reason !== "unsupported" && <Button size="sm" onClick={onConnect}>Try again</Button>}
          </div>
        </Note>
      );
  }
}

const STEP_TONE: Record<Step["tone"], string> = {
  ok: "text-ink",
  info: "text-ink",
  muted: "text-muted",
  warn: "text-danger",
  bad: "text-danger font-medium",
};

function WakeRow({ wake, labels }: { wake: Wake; labels: Labels }) {
  const steps = describeWake(wake, labels);
  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-3">
      <time className="font-semibold tabular-nums" dateTime={new Date(wake.at).toISOString()}>{clock(wake.at)}</time>
      <div className="min-w-0">
        <p className="font-medium">
          {wake.number !== null ? <>Woke up <span className="text-muted">#{wake.number}</span></> : "Already awake when you connected"}
          {wake.state === "running" && <span className="ml-2 text-[12px] font-normal text-muted">working…</span>}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed">
          {steps.map((s, i) => (
            <span key={i}>
              {i > 0 && <span className="text-muted/60"> · </span>}
              <span className={STEP_TONE[s.tone]}>{s.text}</span>
            </span>
          ))}
        </p>
      </div>
    </li>
  );
}

function RawLog({ lines }: { lines: PanelActivity["activity"]["raw"] }) {
  const text = lines.map((l) => `${clockSeconds(l.at)}  ${l.text}`).join("\n");
  return (
    <details className="group rounded-lg border border-line bg-raised">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[13px] font-medium select-none">
        Raw log <span className="font-normal text-muted">· {lines.length} lines, for bug reports</span>
      </summary>
      <div className="space-y-2 border-t border-line p-3">
        <pre className="max-h-80 overflow-auto rounded-md bg-bezel p-3 text-[12px] leading-relaxed text-paper">{text || "Nothing yet."}</pre>
        <Button size="sm" variant="ghost" icon={<Copy size={14} />} disabled={!text} onClick={() => void navigator.clipboard?.writeText(text)}>Copy</Button>
      </div>
    </details>
  );
}

export function ActivityView({ panel, names, compiledCrc, refreshSeconds }: {
  panel: PanelActivity;
  names: ActivityNames;
  /** The CRC of what the editor would flash, to tell whether the panel runs the same design. */
  compiledCrc: number | null;
  refreshSeconds: number | null;
}) {
  const now = useNow();
  const { link, activity } = panel;
  const summary = useMemo(() => summarize(activity), [activity]);
  const labels: Labels = useMemo(() => ({
    source: (id) => names.sources.get(id) ?? id,
    screen: (i) => names.screens[i] ?? `Screen ${i + 1}`,
    time: clock,
  }), [names]);
  const wakes = useMemo(() => [...activity.wakes].reverse().slice(0, MAX_SHOWN), [activity.wakes]);
  const refresh = refreshSeconds ? formatDuration(refreshSeconds) : "few minutes";
  const panelCrc = [...activity.wakes].reverse().find((w) => w.blob)?.blob;
  const different = panelCrc && compiledCrc !== null && panelCrc.crc !== compiledCrc;

  return (
    <div className="mx-auto max-w-[920px] space-y-5 p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Panel activity</h1>
          <p className="mt-1 max-w-[64ch] text-muted">
            What your panel really did, read from its own log over USB: when it woke, what it fetched, and whether it redrew.
            The editor's preview is a simulation in this browser; this is the panel.
          </p>
        </div>
        {activity.raw.length > 0 && <Button size="sm" variant="ghost" onClick={panel.clear}>Clear</Button>}
      </header>

      <ConnectionBar link={link} onConnect={panel.connect} onStop={panel.disconnect} onWake={panel.wakeNow} refresh={refresh} />

      {link.kind === "watching" && activity.wakes.length === 0 && (
        <Note>Connected. The panel writes here each time it wakes; the next one is at most {refresh} away. Leave this open.</Note>
      )}

      {different && (
        <Note tone="warn">
          The panel runs a different version of this design (flashed {new Date(panelCrc.builtAt * 1000).toLocaleString()}). Names below come from
          the editor and may not match — flash to bring the panel up to date.
        </Note>
      )}

      <SummaryCard summary={summary} labels={labels} now={now} />

      {wakes.length > 0 && (
        <section aria-label="Timeline">
          <h2 className="text-[13px] font-semibold text-muted">Every wake, newest first</h2>
          <ol className="divide-y divide-line">
            {wakes.map((w, i) => <WakeRow key={`${w.at}-${w.number ?? "x"}-${i}`} wake={w} labels={labels} />)}
          </ol>
        </section>
      )}

      {activity.raw.length > 0 && <RawLog lines={activity.raw} />}
    </div>
  );
}
