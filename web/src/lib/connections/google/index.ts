import type { FetchContext, Provider, Verification } from "@/lib/connections/provider";

import { agenda } from "./agenda";
import { calendars, events, type EventsResult } from "./api";
import { windowFor } from "./range";
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

/**
 * Which feeds a widget was pointed at.
 *
 * One widget can show several - work and family on one panel is the ordinary
 * case, and two overlapping widgets is not how anybody would ask for it. The
 * list is sorted and deduplicated because the settings become the key an
 * answer is cached under, and "work then family" must not be a different
 * question from "family then work".
 *
 * A string is what a widget saved before this holds, and still means one
 * calendar.
 */
const MAX_CALENDARS = 8;

export function calendarIds(settings: Record<string, unknown>): string[] {
  const raw = settings.calendar;
  const listed = Array.isArray(raw) ? raw : [raw];

  const ids = [
    ...new Set(
      listed
        .map((one) => String(one ?? "").trim())
        .filter((one) => one.length > 0),
    ),
  ].sort();

  // Every calendar is a request, and a person who ticked forty of them wants
  // a wall of text rather than a panel. Bounded, and the bound is reported.
  return (ids.length ? ids : ["primary"]).slice(0, MAX_CALENDARS);
}

/** One feed that answered, and one that did not. */
interface Feed extends EventsResult {
  id: string;
}

interface Missed {
  id: string;
  failed: string;
}

const isFeed = (answer: Feed | Missed): answer is Feed => !("failed" in answer);

async function fetchCalendar(
  settings: Record<string, unknown>,
  now: Date,
  context: FetchContext,
): Promise<Record<string, unknown>> {
  const ids = calendarIds(settings);
  const { timezone, locale } = context;

  // "The rest of today" is a boundary in a place, not a duration - so the
  // window is resolved against the installation's zone before anything is
  // asked of Google.
  const window = windowFor(settings, now, timezone, locale);

  const answers = await Promise.all(
    ids.map(async (id): Promise<Feed | Missed> => {
      try {
        const answered = await events(id, window.from, window.to, context.credentials);
        return { id, ...answered };
      } catch (error) {
        return { id, failed: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  const read = answers.filter(isFeed);
  const missing = answers.filter((answer): answer is Missed => !isFeed(answer));

  // Every one of them failed, so there is nothing to draw and the reason is
  // worth having. One of several failing is different: a shared calendar
  // somebody stopped sharing should not blank the four that still work.
  if (!read.length) throw new Error(missing[0]?.failed ?? "No calendar answered.");

  const many = read.length > 1;

  const day = agenda(
    read.flatMap((feed) =>
      feed.events.map((event) => ({
        ...event,
        // Only when there are several. Labelling every event with the name of
        // the one calendar it could possibly be from is noise.
        calendarName: many ? feed.name || feed.id : undefined,
      })),
    ),
    {
      now,
      timezone,
      locale,
      window,
      hideDeclined: settings.hide_declined !== false,
      truncated: read.some((feed) => feed.truncated),
    },
  );

  const names = read.map((answer) => answer.name || answer.id);

  return {
    calendar: {
      ...day,
      connected: true,
      name: names.join(", "),
      names,
      /** True when a feed was asked for and did not answer. */
      incomplete: missing.length > 0,
      unread: missing.length,
      /** More than one feed is being shown, so a design may want to say which. */
      many,
    },
  };
}

/* -------------------------------------------------------------------------- */

export const google: Provider = {
  id: "google",
  label: "Google Calendar",
  description: "What is next in your day, from a Google account.",
  unlocks: "Calendar",
  icon: "calendar",
  mocked: false,
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

      const stored = {
        [CLIENT_ID]: credentials[CLIENT_ID],
        [CLIENT_SECRET]: credentials[CLIENT_SECRET],
        [REFRESH_TOKEN]: tokens.refresh_token,
      };

      // Named by the account it turned out to be, which is worth one extra
      // request exactly once - a card reading "kayra@ratel.sh" is how you tell
      // you linked the right one of three Google accounts.
      const name = await accountName(stored).catch(() => "");

      return { credentials: stored, label: name || "Google Calendar" };
    },
  },
  verify,
  fetch: fetchCalendar,
};
