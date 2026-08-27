/**
 * Naming one calendar on one account.
 *
 * With two Google accounts linked, "primary" is ambiguous - it is a calendar
 * on both of them - so a widget's selection has to carry the account as well.
 * They travel as one string because that is what a settings field holds and
 * what gets hashed into the key an answer is cached under; a pair of fields
 * would have to be kept in step by every caller.
 *
 * The separator is a pipe, which cannot appear in either half: an account is
 * an email address and a calendar id is an email address or a
 * `...@group.v.calendar.google.com`, and neither may contain one.
 */

const SEPARATOR = "|";

export interface Feed {
  /** The Google account's address, or "" for a selection made before accounts. */
  account: string;
  /** The calendar id on that account. */
  calendar: string;
}

export const feedValue = (account: string, calendar: string): string =>
  `${account}${SEPARATOR}${calendar}`;

/**
 * Read a selection back.
 *
 * A value with no separator is one saved when there could only be one account,
 * and means "that calendar, on whichever account is linked" - resolved by the
 * caller rather than guessed here.
 */
export function parseFeed(value: string): Feed {
  const at = value.indexOf(SEPARATOR);
  if (at === -1) return { account: "", calendar: value };

  return { account: value.slice(0, at), calendar: value.slice(at + 1) };
}

/** The most feeds one widget will read. Every calendar is a request. */
export const MAX_FEEDS = 8;

/**
 * Which feeds a widget was pointed at.
 *
 * Sorted and deduplicated because the settings become the key an answer is
 * cached under, and "work then family" must not be a different question from
 * "family then work". A string is what a widget saved before any of this
 * holds, and still means one calendar.
 */
export function selectedFeeds(settings: Record<string, unknown>): string[] {
  const raw = settings.calendar;
  const listed = Array.isArray(raw) ? raw : [raw];

  const values = [
    ...new Set(listed.map((one) => String(one ?? "").trim()).filter((one) => one.length > 0)),
  ].sort();

  return (values.length ? values : ["primary"]).slice(0, MAX_FEEDS);
}

/**
 * Attach each selection to the account that will answer it.
 *
 * A selection naming an account that is no longer linked is dropped rather
 * than guessed at - showing somebody else's calendar because the addresses
 * sorted that way would be worse than showing nothing. A selection from before
 * accounts existed has no account, and goes to the first one.
 */
export function resolveFeeds(
  values: string[],
  accounts: string[],
): { resolved: { account: string; calendar: string }[]; unknown: string[] } {
  const known = new Set(accounts);
  const resolved: { account: string; calendar: string }[] = [];
  const unknown: string[] = [];

  for (const value of values) {
    const feed = parseFeed(value);

    if (!feed.account) {
      if (accounts.length) resolved.push({ account: accounts[0], calendar: feed.calendar });
      else unknown.push(value);
      continue;
    }

    if (known.has(feed.account)) resolved.push(feed);
    else unknown.push(value);
  }

  return { resolved, unknown };
}
