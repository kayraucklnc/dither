import type { Manifest } from "@/lib/extensions/manifest";

/**
 * Connections are accounts you link once and every widget can use.
 *
 * An extension that names a connection does not carry credentials in its
 * settings - it says "I need Google" and the linked account answers for every
 * placement of it. That is what keeps a screen's settings about *what to show*
 * rather than about how to authenticate.
 *
 * Providers here are mocked. They answer plausible, moving data so screens and
 * triggers can be designed and tested before any OAuth exists; replacing a mock
 * with a real client changes this file and nothing above it.
 */

export interface Provider {
  id: string;
  label: string;
  description: string;
  /** What linking it unlocks, for the connections page. */
  unlocks: string;
  /** True while the real integration is not written yet. */
  mocked: boolean;
  fetch(settings: Record<string, unknown>, now: Date): Promise<Record<string, unknown>>;
}

const MEETINGS = [
  { title: "Design review", location: "Milano Centrale, Sala 4", remote: false, minutes: 24, length: 45 },
  { title: "Standup", location: "Meet", remote: true, minutes: 84, length: 15 },
  { title: "1:1 with Ana", location: "Sala 2", remote: false, minutes: 294, length: 30 },
  { title: "Sprint planning", location: "Zoom", remote: true, minutes: 380, length: 60 },
];

const clock = (from: Date, minutes: number) => {
  const at = new Date(from.getTime() + minutes * 60_000);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
};

const google: Provider = {
  id: "google",
  label: "Google",
  description: "Calendar events from a Google account.",
  unlocks: "Calendar",
  mocked: true,

  async fetch(settings, now) {
    const horizon = Number(settings.horizon_hours ?? 12) * 60;

    const events = MEETINGS.filter((meeting) => meeting.minutes <= horizon).map((meeting) => ({
      title: meeting.title,
      start: clock(now, meeting.minutes),
      end: clock(now, meeting.minutes + meeting.length),
      location: meeting.location,
      remote: meeting.remote,
      minutes_until: meeting.minutes,
      accepted: true,
    }));

    const next = events[0];

    return {
      calendar: {
        empty: events.length === 0,
        remaining_today: events.length,
        // Minutes of clear air before the next thing starts.
        free_minutes: next ? next.minutes_until : 480,
        next: next ?? null,
        events,
      },
    };
  },
};

const PROVIDERS = new Map<string, Provider>([[google.id, google]]);

export function provider(id: string): Provider | undefined {
  return PROVIDERS.get(id);
}

export function allProviders(): Provider[] {
  return [...PROVIDERS.values()];
}

/** The connection an extension needs, if any. */
export function requiredBy(manifest: Manifest): Provider | undefined {
  return manifest.connection ? provider(manifest.connection) : undefined;
}
