import type { FetchContext, Provider, Verification } from "@/lib/connections/provider";

import { dayShape } from "@/lib/calendar/day";

import { toMeetings } from "./agenda";
import { calendars, events, type EventsResult } from "./api";
import { resolveFeeds, selectedFeeds } from "./feeds";
import { horizonHours, windowFor } from "./range";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  REFRESH_TOKEN,
  SCOPES,
  authorizeUrl,
  complete,
  exchangeCode,
} from "./oauth";

/**
 * The real Google Calendar connection.
 *
 * Linking is two steps rather than one, and it has to be: Google will not let
 * an unpublished application ask for `calendar.readonly`, and a self-hosted
 * server has no published application. So the installation registers its own
 * OAuth client - which takes about four minutes in the Google Cloud console -
 * pastes the client ID and secret here, and then goes through the ordinary
 * consent screen. See `oauth.ts` for why that is the honest arrangement
 * rather than a missing feature, and `docs/google-calendar.md` for the four
 * minutes.
 *
 * One request per refresh. The events response already carries the calendar's
 * own title, so nothing here asks `calendarList` at render time; that list is
 * only read when the settings form needs a picker, and when a freshly linked
 * account is being named.
 */

/** The address of the account itself, which is the primary calendar's id. */
async function accountName(credentials: Record<string, unknown>): Promise<string> {
  const list = await calendars(credentials);
  const primary = list.find((calendar) => calendar.primary);

  return primary?.id ?? primary?.summary ?? "";
}

/* -------------------------------------------------------------------------- */

/**
 * What can be checked at the point it is pasted.
 *
 * Before the handshake there is nothing to ask Google - a client ID and secret
 * are only proved by using them - so this checks the one thing a typo reliably
 * breaks and lets the redirect do the rest. Whose account it turned out to be
 * is answered afterwards, by the exchange.
 */
async function verify(credentials: Record<string, unknown>): Promise<Verification> {
  const id = String(credentials[CLIENT_ID] ?? "").trim();

  if (!id.endsWith(".apps.googleusercontent.com")) {
    return {
      ok: false,
      error:
        "That does not look like a Google client ID. It ends in .apps.googleusercontent.com " +
        "and is on the credential you created in the Google Cloud console.",
    };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */

/** One feed that answered, and one that did not. */
interface Read extends EventsResult {
  account: string;
  calendar: string;
}

interface Missed {
  account: string;
  calendar: string;
  failed: string;
}

const isRead = (answer: Read | Missed): answer is Read => !("failed" in answer);

/**
 * What to call a feed on screen.
 *
 * The calendar's own title is enough until two accounts are in play, at which
 * point "Family" is two different calendars and the account has to be said.
 */
const feedLabel = (feed: Read, acrossAccounts: boolean): string => {
  const name = feed.name || feed.calendar;
  return acrossAccounts ? `${name} · ${feed.account}` : name;
};

async function fetchCalendar(
  settings: Record<string, unknown>,
  now: Date,
  context: FetchContext,
): Promise<Record<string, unknown>> {
  const { timezone, locale, accounts } = context;

  // Which calendar, on which account. With two accounts linked "primary" is
  // ambiguous, so a selection carries both - and one naming an account that is
  // no longer linked is dropped rather than guessed at.
  const { resolved, unknown } = resolveFeeds(
    selectedFeeds(settings),
    accounts.map((one) => one.account),
  );

  if (!resolved.length) {
    throw new Error(
      unknown.length
        ? "The calendars this widget names are on an account that is no longer linked."
        : "No Google account is linked.",
    );
  }

  // "The rest of today" is a boundary in a place, not a duration - so the
  // window is resolved against the installation's zone before anything is
  // asked of Google. It decides what is *fetched*; how much of it a given
  // design draws is the design's business.
  const window = windowFor(settings, now, timezone, locale);
  const byAccount = new Map(accounts.map((one) => [one.account, one]));

  const answers = await Promise.all(
    resolved.map(async (feed): Promise<Read | Missed> => {
      const owner = byAccount.get(feed.account)!;

      try {
        const answered = await events(feed.calendar, window.from, window.to, owner.credentials);
        return { ...feed, ...answered };
      } catch (error) {
        return { ...feed, failed: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  const read = answers.filter(isRead);
  const missing = answers.filter((answer): answer is Missed => !isRead(answer));

  // Every one of them failed, so there is nothing to draw and the reason is
  // worth having. One of several failing is different: a shared calendar
  // somebody stopped sharing should not blank the four that still work.
  if (!read.length) throw new Error(missing[0]?.failed ?? "No calendar answered.");

  // Several feeds, or one calendar drawn from two accounts - either way the
  // entries need saying apart. With a single feed the label is noise.
  const many = read.length > 1;
  /** Whether the label has to name the account as well as the calendar. */
  const acrossAccounts = new Set(read.map((one) => one.account)).size > 1;

  const meetings = read.flatMap((feed) =>
    toMeetings(
      feed.events.map((event) => ({
        ...event,
        calendarName: many ? feedLabel(feed, acrossAccounts) : undefined,
      })),
      timezone,
      `${feed.account}-${feed.calendar}`,
    ),
  );

  // Everything a design can ask, from one list. The payload carries every
  // answer and the design chooses among them, so six calendar widgets on one
  // screen cost one trip to Google between them.
  const shape = dayShape(meetings, now, {
    timezone,
    locale,
    horizonHours: horizonHours(settings),
    hideDeclined: settings.hide_declined !== false,
    daysAhead: window.daysAhead,
    ...minutesFromSettings(settings),
  });

  return {
    calendar: {
      ...shape,
      name: read.map((feed) => feedLabel(feed, acrossAccounts)).join(", "),
      names: read.map((feed) => feedLabel(feed, acrossAccounts)),
      accounts: [...new Set(read.map((one) => one.account))],
      /** True when a feed was asked for and did not answer. */
      incomplete: missing.length > 0,
      unread: missing.length,
      many,
      across_accounts: acrossAccounts,
      /* What was asked for, so an empty panel can say which question it
         answered - "Nothing this week" rather than "Nothing scheduled".
         `empty` on its own is about *today*, which is the right thing for a
         design drawing today and the wrong thing to hang this label on: a week
         with nothing until Friday is not "nothing this week". */
      range: window.key,
      range_label: window.label,
      empty_label: window.emptyLabel,
      spans_days: window.spansDays,
      /** Nothing anywhere in the window that was fetched. */
      window_empty: meetings.every(
        (meeting) => settings.hide_declined !== false && meeting.response === "declined",
      ),
    },
  };
}

/**
 * The day view's own start and end, which are wall-clock times in settings.
 *
 * Left out entirely when unset, so `dayShape` keeps its own defaults rather
 * than being handed a NaN.
 */
function minutesFromSettings(settings: Record<string, unknown>): {
  openMinute?: number;
  closeMinute?: number;
} {
  const read = (value: unknown): number | undefined => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
    if (!match) return undefined;

    return Number(match[1]) * 60 + Number(match[2]);
  };

  const open = read(settings.day_start);
  const close = read(settings.day_end);

  return { ...(open === undefined ? {} : { openMinute: open }), ...(close === undefined ? {} : { closeMinute: close }) };
}

export const google: Provider = {
  id: "google",
  label: "Google Calendar",
  description: "What is next in your day, from a Google account.",
  unlocks: "Calendar",
  icon: "calendar",
  mocked: false,
  multiple: true,
  help: {
    label: "Google Cloud credentials",
    url: "https://console.cloud.google.com/apis/credentials",
  },
  credentials: [
    {
      key: CLIENT_ID,
      label: "Client ID",
      help:
        "From an OAuth client of type Web application, created in the Google Cloud console. " +
        "Add the redirect URI shown below to that client before continuing.",
      placeholder: "1234567890-abc.apps.googleusercontent.com",
      secret: false,
    },
    {
      key: CLIENT_SECRET,
      label: "Client secret",
      help: "Issued alongside the client ID. Stored on this server and never sent to a browser.",
      placeholder: "GOCSPX-…",
      secret: true,
    },
  ],
  handshake: {
    scopes: SCOPES,
    authorizeUrl,
    complete,
    async exchange(code, credentials, redirectUri) {
      const tokens = await exchangeCode(code, credentials, redirectUri);

      if (!tokens.refresh_token) {
        // Google issues a refresh token per grant, not per handshake. Without
        // `prompt=consent` a re-authorisation of an account that has already
        // said yes comes back with an access token and nothing durable, and
        // the link would quietly stop working in an hour.
        throw new Error(
          "Google did not return a refresh token. Remove Dither from the account's third-party " +
            "access at myaccount.google.com/permissions and connect again.",
        );
      }

      // Enough to ask Google who this is, once. The client credentials are not
      // kept here - they live on the installation's own row, and copying them
      // onto every account would make rotating a secret an N-row job.
      const usable = {
        [CLIENT_ID]: credentials[CLIENT_ID],
        [CLIENT_SECRET]: credentials[CLIENT_SECRET],
        [REFRESH_TOKEN]: tokens.refresh_token,
      };

      // Named by the account it turned out to be, which is worth one extra
      // request exactly once - a card reading "kayra@ratel.sh" is how you tell
      // you linked the right one of three Google accounts, and it is what a
      // widget's settings name from then on.
      const address = await accountName(usable).catch(() => "");
      if (!address) {
        throw new Error(
          "Google would not say which account that was, so it cannot be told apart from another. " +
            "Check the Calendar API is enabled and try again.",
        );
      }

      return {
        account: address,
        label: address,
        grant: { [REFRESH_TOKEN]: tokens.refresh_token },
      };
    },
  },
  verify,
  fetch: fetchCalendar,
};
