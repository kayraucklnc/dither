import { accessToken, forget } from "./oauth";

/**
 * The two Calendar endpoints this needs, and nothing else.
 *
 * `googleapis` is a package that bundles every Google API there is; pulling it
 * in to read one list of events would add tens of megabytes to a server whose
 * job is to draw a 800x480 picture. Two typed fetches are the whole surface.
 */

const BASE = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendar {
  id: string;
  summary?: string;
  summaryOverride?: string;
  description?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
  timeZone?: string;
  deleted?: boolean;
}

export interface GoogleEventTime {
  /** Set on a timed event. RFC 3339, with an offset. */
  dateTime?: string;
  /** Set on an all-day event. "2026-08-27", with no zone at all. */
  date?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string; label?: string }[];
    conferenceSolution?: { name?: string };
  };
  attendees?: { self?: boolean; responseStatus?: string; organizer?: boolean }[];
  organizer?: { self?: boolean };
  transparency?: string;
  eventType?: string;
}

interface Page<T> {
  items?: T[];
  nextPageToken?: string;
  /** On an events page: the calendar's own title and zone. */
  summary?: string;
  timeZone?: string;
}

async function get<T>(
  path: string,
  params: Record<string, string>,
  credentials: Record<string, unknown>,
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const token = await accessToken(credentials);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 401) {
    // The held access token was rejected - revoked mid-life, or minted before
    // a scope changed. Drop it so the next attempt does not reuse it, and say
    // something a person can act on rather than "401".
    forget(credentials);
    throw new Error("Google rejected the stored authorisation. Reconnect the account under Connections.");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    };

    const reason = body.error?.errors?.[0]?.reason ?? "";
    if (response.status === 404) throw new Error("That calendar is not on the linked Google account.");
    if (reason === "rateLimitExceeded" || response.status === 429) {
      throw new Error("Google is rate limiting this account. The last answer stays on screen.");
    }

    throw new Error(body.error?.message ?? `Google Calendar answered ${response.status}.`);
  }

  return (await response.json()) as T;
}

/**
 * Every calendar on the account.
 *
 * Paged, but bounded: an account with more than a few hundred calendars is
 * one where a picker is the wrong idea anyway, and an unbounded loop here is
 * a settings form that hangs.
 */
const CALENDAR_PAGES = 4;

export async function calendars(credentials: Record<string, unknown>): Promise<GoogleCalendar[]> {
  const found: GoogleCalendar[] = [];
  let pageToken = "";

  for (let page = 0; page < CALENDAR_PAGES; page += 1) {
    const body = await get<Page<GoogleCalendar>>(
      "/users/me/calendarList",
      { maxResults: "250", showDeleted: "false", showHidden: "false", ...(pageToken ? { pageToken } : {}) },
      credentials,
    );

    found.push(...(body.items ?? []));
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }

  return found.filter((calendar) => !calendar.deleted);
}

/** Google's own cap on one page. Asking for more is an error, not a bigger page. */
const MAX_RESULTS = 250;

export interface EventsResult {
  events: GoogleEvent[];
  /** The calendar's title, which the same response already carries. Asking
      `calendarList` for it would double the requests every render makes. */
  name: string;
  /** The bound hit, so a count can say it is a floor rather than a total. */
  truncated: boolean;
}

/**
 * What is on one calendar between two instants.
 *
 * `singleEvents` expands a recurring event into the occurrences that actually
 * fall in the window - without it a weekly standup arrives once, as a rule,
 * with a start date months ago, and every screen shows a meeting that is
 * either permanently overdue or missing. It is also what makes `orderBy`
 * legal, and a timeline drawn from an unordered list is not a timeline.
 *
 * `timeMin` filters on an event's *end*, so something that started twenty
 * minutes ago and runs for an hour is still returned. That is deliberate: the
 * meeting you are in is the most relevant thing on the panel.
 */
export async function events(
  calendarId: string,
  from: Date,
  to: Date,
  credentials: Record<string, unknown>,
): Promise<EventsResult> {
  const body = await get<Page<GoogleEvent>>(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "false",
      maxResults: String(MAX_RESULTS),
    },
    credentials,
  );

  return {
    events: body.items ?? [],
    name: body.summary ?? "",
    truncated: Boolean(body.nextPageToken),
  };
}
