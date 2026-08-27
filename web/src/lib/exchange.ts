import { minorUnitsPerMajor } from "@/lib/money";

/**
 * What one currency is worth in another, today.
 *
 * Two Stripe accounts settling in two currencies have no single total until
 * something says what a euro is worth in pounds, and a panel that adds them
 * without asking is reporting a number that means nothing. So a rate is
 * fetched, and where one is missing the total is refused rather than guessed -
 * a wrong total is the one figure a dashboard is never forgiven for.
 *
 * The source is exchangerate-api's open endpoint: no key, no sign-up, a
 * self-hosted box can reach it, and it publishes the 160-odd currencies Stripe
 * settles in. It updates daily, which is the right resolution for the job -
 * these are figures on a wall, not a trading screen.
 */
const ENDPOINT = "https://open.er-api.com/v6/latest";

/**
 * How long a table is kept.
 *
 * The upstream moves once a day, so anything under that is asking a question
 * whose answer cannot have changed. Six hours means a box that has been up for
 * a week is never showing a table more than a day old, and a panel refreshing
 * every twenty minutes costs four of these a day rather than seventy.
 */
const KEEP = 6 * 60 * 60 * 1000;

export interface Rates {
  /** The currency every rate below is quoted against, upper case. */
  base: string;
  /** How many of each currency one unit of the base buys. */
  rates: Record<string, number>;
  fetchedAt: Date;
}

/**
 * The rate from one currency to another, or nothing when it cannot be known.
 *
 * Nothing rather than 1: a missing rate that quietly means "no conversion"
 * adds dollars to yen and calls the result money. Every caller has to decide
 * what to do about a gap, so every caller is made to see it.
 */
export function rateBetween(table: Rates, from: string, to: string): number | undefined {
  const start = from.toUpperCase();
  const end = to.toUpperCase();

  // Exactly one, before the table is consulted. A figure converted to the
  // currency it is already in has to come back as the same figure, and a table
  // quoted to five decimal places does not promise that.
  if (start === end) return 1;

  const perBase = table.rates[start];
  const perTarget = table.rates[end];
  if (!perBase || !perTarget) return undefined;

  return perTarget / perBase;
}

/**
 * An amount in one currency's smallest unit, as the other currency's.
 *
 * The exponents have to be crossed as well as the rate: a thousand yen is a
 * thousand yen and a thousand cents is ten dollars, so converting the integers
 * directly is wrong by a hundred in one direction and by a hundred in the
 * other. Everything goes through major units and comes back.
 */
export function convertMinor(minor: number, from: string, to: string, rate: number): number {
  if (from.toLowerCase() === to.toLowerCase()) return Math.round(minor);

  const major = minor / minorUnitsPerMajor(from);
  return Math.round(major * rate * minorUnitsPerMajor(to));
}

/* -- fetching, and not fetching twice --------------------------------------- */

interface Held {
  at: number;
  table: Promise<Rates>;
}

/**
 * One table per base, held for as long as it is worth holding.
 *
 * The promise is cached rather than the result, so six revenue widgets waking
 * together make one request between them rather than six identical ones. A
 * failed fetch is dropped from the cache immediately, or one bad minute would
 * be remembered for six hours.
 */
const held = new Map<string, Held>();

async function download(base: string): Promise<Rates> {
  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(base)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Exchange rates are unavailable (${response.status}).`);
  }

  const body = (await response.json()) as {
    result?: string;
    "error-type"?: string;
    base_code?: string;
    rates?: Record<string, number>;
  };

  if (body.result !== "success" || !body.rates) {
    throw new Error(`Exchange rates are unavailable (${body["error-type"] ?? "no rates returned"}).`);
  }

  return {
    base: (body.base_code ?? base).toUpperCase(),
    rates: body.rates,
    fetchedAt: new Date(),
  };
}

/** Today's table, quoted against `base`. Cached, and shared while in flight. */
export function rates(base: string, now = new Date()): Promise<Rates> {
  const key = base.toUpperCase();
  const existing = held.get(key);

  if (existing && now.getTime() - existing.at < KEEP) return existing.table;

  const table = download(key).catch((error) => {
    // A refusal must not be remembered, or one bad minute lasts six hours.
    if (held.get(key)?.table === table) held.delete(key);
    throw error;
  });

  held.set(key, { at: now.getTime(), table });
  return table;
}

/** Forget everything held. For tests, and for a settings change worth obeying. */
export function forgetRates(): void {
  held.clear();
}
