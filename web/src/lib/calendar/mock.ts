import { DAY, MINUTE, startOfDay } from "@/lib/clock";
import type { Meeting } from "./day";

/**
 * A plausible day, until the Google sign-in flow exists.
 *
 * Mock data has to *move* and it has to be awkward. Frozen data gets designs
 * tuned against one snapshot; tidy data gets designs that fall over the first
 * time two meetings overlap. So this has a day that is half spent, a meeting
 * running right now, a double booking after lunch, an all-day event that must
 * not count as sixteen hours of busy, one thing declined, and a long gap in
 * the afternoon that a day view ought to make obvious.
 *
 * Laid out against the local day rather than against `now`, so the ribbon and
 * the "how much is done" figures change through the day the way real ones do.
 */

interface Draft {
  title: string;
  /** Minutes since local midnight. */
  from: number;
  minutes: number;
  location?: string;
  remote?: boolean;
  response?: Meeting["response"];
  allDay?: boolean;
  organiser?: string;
  attendees?: number;
  /** Days from today. */
  day?: number;
}

const CALENDARS: Record<string, Draft[]> = {
  primary: [
    { title: "Gym", from: 7 * 60, minutes: 60, location: "Virgin Active", attendees: 1 },
    { title: "Design review", from: 10 * 60 + 30, minutes: 45, location: "Sala 4", attendees: 6, organiser: "Ana Ferrari" },
    { title: "Standup", from: 11 * 60 + 30, minutes: 15, location: "Meet", remote: true, attendees: 9 },
    { title: "Lunch with Marco", from: 13 * 60, minutes: 60, location: "Trattoria Milanese", attendees: 2 },
    { title: "Vendor call", from: 15 * 60, minutes: 30, location: "Zoom", remote: true, attendees: 4 },
    { title: "Quarterly planning", from: 15 * 60 + 15, minutes: 90, location: "Sala 2", attendees: 12, organiser: "Priya Raman" },
    { title: "School run", from: 17 * 60, minutes: 30, response: "tentative", attendees: 1 },
    { title: "Ana on leave", from: 0, minutes: 1440, allDay: true },
    { title: "Dentist", from: 8 * 60 + 30, minutes: 45, location: "Via Meravigli 12", day: 1 },
    { title: "Board meeting", from: 10 * 60, minutes: 120, location: "Sala 1", attendees: 8, day: 1 },
    { title: "Retro", from: 16 * 60, minutes: 60, location: "Meet", remote: true, day: 2 },
    { title: "Flight to Berlin", from: 6 * 60 + 40, minutes: 110, location: "MXP T1", day: 3 },
  ],
  work: [
    { title: "Standup", from: 9 * 60 + 30, minutes: 15, location: "Meet", remote: true, attendees: 9 },
    { title: "Pairing on the renderer", from: 10 * 60, minutes: 120, location: "Meet", remote: true, attendees: 2 },
    { title: "Design review", from: 13 * 60 + 30, minutes: 45, location: "Sala 4", attendees: 6 },
    { title: "Interview: back end", from: 16 * 60, minutes: 60, location: "Meet", remote: true, attendees: 3 },
    { title: "All hands", from: 17 * 60 + 30, minutes: 45, response: "declined", remote: true },
    { title: "Release window", from: 0, minutes: 1440, allDay: true },
    { title: "Sprint planning", from: 9 * 60 + 30, minutes: 90, location: "Sala 2", attendees: 11, day: 1 },
  ],
  family: [
    { title: "Swimming", from: 8 * 60, minutes: 60, location: "Piscina Cozzi", attendees: 2 },
    { title: "Elena's recital", from: 18 * 60, minutes: 90, location: "Teatro Dal Verme", attendees: 4 },
    { title: "Half term", from: 0, minutes: 1440, allDay: true },
    { title: "Grandparents visiting", from: 12 * 60, minutes: 180, day: 2 },
  ],
};

/** The meetings a calendar holds around an instant. */
export function mockMeetings(now: Date, timezone: string, calendar: string): Meeting[] {
  const drafts = CALENDARS[calendar] ?? CALENDARS.primary;
  const midnight = startOfDay(now, timezone).getTime();

  return drafts.map((draft, index) => {
    const startsAt = new Date(midnight + (draft.day ?? 0) * DAY + draft.from * MINUTE);

    return {
      id: `${calendar}-${index}`,
      title: draft.title,
      startsAt,
      endsAt: new Date(startsAt.getTime() + draft.minutes * MINUTE),
      location: draft.location ?? "",
      remote: draft.remote ?? false,
      response: draft.response ?? "accepted",
      allDay: draft.allDay ?? false,
      organiser: draft.organiser ?? "",
      attendees: draft.attendees ?? 0,
      calendar,
    };
  });
}
