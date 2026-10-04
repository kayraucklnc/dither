// Which accounts a calendar widget shows, and which calendar of each.

import { useEffect, useState } from "react";
import type { Lane } from "@/extensions/google-calendar";
import { listCalendars } from "@/extensions/google-calendar/oauth";
import type { GoogleLink } from "@/project/schema";
import { useProject } from "@/state/project-store";
import { Select } from "../kit";

function AccountRow({ link, lane, onChange }: { link: GoogleLink; lane: Lane | undefined; onChange: (l: Lane | null) => void }) {
  const [calendars, setCalendars] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    listCalendars(link).then((c) => !cancelled && setCalendars(c), (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [link]);
  return (
    <div className="space-y-1.5 rounded-md border border-line bg-raised p-2.5">
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" checked={Boolean(lane)} className="accent-[var(--accent)]"
          onChange={(e) => onChange(e.target.checked ? { account: link.id, calendar: "primary", name: "" } : null)} />
        {link.label || link.email}
        <span className="truncate text-[12px] font-normal text-muted">{link.label ? link.email : ""}</span>
      </label>
      {lane && calendars && (
        <Select value={lane.calendar} options={calendars.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(id) => onChange({ ...lane, calendar: id, name: calendars.find((c) => c.id === id)?.name ?? "" })} />
      )}
      {lane && error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

export function CalendarsField({ value, onChange }: { value: Lane[]; onChange: (lanes: Lane[]) => void }) {
  const { project } = useProject();
  const links = project.accounts.google;
  if (links.length === 0) return <p className="text-[13px] text-muted">Link a Google account under Panel → Accounts.</p>;
  return (
    <div className="space-y-2">
      {links.map((link) => (
        <AccountRow key={link.id} link={link} lane={value.find((l) => l.account === link.id)}
          onChange={(lane) => {
            // Keep the order accounts are listed in, so lanes do not jump around.
            const others = value.filter((l) => l.account !== link.id);
            const next = lane ? [...others, lane] : others;
            onChange(links.flatMap((a) => next.filter((l) => l.account === a.id)));
          }} />
      ))}
    </div>
  );
}
