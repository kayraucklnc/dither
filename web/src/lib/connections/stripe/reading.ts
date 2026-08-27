import type { Account } from "@/lib/connections/provider";
import { convertMinor } from "@/lib/exchange";
import type { Entry } from "./metrics";

/**
 * One account's answer, and how several become one.
 *
 * A Stripe key is one account, and a person can have several: a company and a
 * side project, a euro business and a dollar one. Each is read on its own -
 * every figure in that account's own settlement currency, because that is the
 * only currency its balance transactions are in - and then carried into one
 * currency and added up.
 *
 * The two halves are kept apart on purpose. Reading talks to Stripe and cannot
 * be tested without it; this can be, and it is the half where a mistake is a
 * wrong number rather than a failed request. Adding dollars to yen is the one
 * error a revenue panel must never make quietly, so the conversion refuses
 * rather than guesses and the addition refuses rather than assumes.
 */

/** One payment, as it will be shown: a name, an amount, and when. */
export interface Purchase {
  at: Date;
  /** Minor units of `currency`. */
  minor: number;
  /** Usually the display currency; its own where no rate could carry it. */
  currency: string;
  name: string;
  /** Which account took it, for a panel adding several up. */
  account: string;
}

/** Which accounts a figure was added up from. */
export interface AccountRef {
  account: string;
  label: string;
  /** What that account settles in, which is not always what is displayed. */
  currency: string;
}

/**
 * Everything one account has to say, in minor units of one currency.
 *
 * Deliberately raw: entries rather than totals, so the windows, the buckets
 * and the charts downstream are computed once over the merged stream instead
 * of being summed per account and added up seven different ways.
 */
export interface Reading {
  /** The currency every minor figure here is counted in. */
  currency: string;
  sources: AccountRef[];

  gross: Entry[];
  net: Entry[];
  fees: number;

  ever: Entry[];
  allTime: number;
  since: Date | null;
  lifetimeCapped: boolean;
  movementsCapped: boolean;

  mrr: number;
  subscribers: number;
  trialing: number;
  unpriced: number;
  subscriptionsCapped: boolean;
  nextRenewal: { at: Date; amount: number; customer: string } | null;
  /** When recent subscriptions started, which is what a forecast is built on. */
  signups: Date[];

  succeededToday: number;
  failedToday: number;
  newCustomersToday: number;
  customers: number;
  customersCapped: boolean;

  purchases: Purchase[];
}

/** The reserved answer meaning "whatever the account settles in". */
export const OWN_CURRENCY = "account";

/**
 * What to show the figures in.
 *
 * Asked for, or the account's own. Where several accounts are added up and
 * they agree, their shared currency is still "their own"; where they disagree
 * there is no such thing, and the first one wins rather than the biggest -
 * a panel whose currency changed the day one account out-traded another would
 * be a panel nobody could read.
 */
export function chooseCurrency(wanted: string, readings: Reading[]): string {
  const asked = wanted.trim().toLowerCase();
  if (asked && asked !== OWN_CURRENCY) return asked;

  const currencies = [...new Set(readings.map((one) => one.currency.toLowerCase()))];
  return currencies.length === 1 ? currencies[0] : (currencies[0] ?? "usd");
}

/** How much of `display` one unit of another currency buys, or nothing. */
export type RateFor = (currency: string) => number | undefined;

/**
 * One account's figures, carried into another currency.
 *
 * Every figure, not just the headline: fees, MRR and the next renewal are as
 * much money as the takings are, and a payload where one of them stayed behind
 * is a payload that reports a euro figure with a pound sign in front of it.
 */
export function convertReading(reading: Reading, display: string, rateFor: RateFor): Reading {
  const from = reading.currency.toLowerCase();
  const to = display.toLowerCase();

  // Payments are presented in whatever currency the customer was charged in,
  // which is not always the account's - so they are carried one at a time, and
  // one the table cannot reach keeps its own currency and its own symbol
  // rather than being dropped from the list or silently relabelled.
  const purchases = reading.purchases.map((purchase) => {
    if (purchase.currency.toLowerCase() === to) return purchase;

    const rate = rateFor(purchase.currency);
    if (rate === undefined) return purchase;

    return {
      ...purchase,
      minor: convertMinor(purchase.minor, purchase.currency, to, rate),
      currency: to,
    };
  });

  if (from === to) return { ...reading, purchases };

  const rate = rateFor(from);
  if (rate === undefined) {
    throw new Error(
      `No exchange rate from ${from.toUpperCase()} to ${to.toUpperCase()}, so these accounts cannot be added up.`,
    );
  }

  const carry = (minor: number) => convertMinor(minor, from, to, rate);
  const carryEntries = (entries: Entry[]) =>
    entries.map((entry) => ({ at: entry.at, amount: carry(entry.amount) }));

  return {
    ...reading,
    currency: to,
    gross: carryEntries(reading.gross),
    net: carryEntries(reading.net),
    fees: carry(reading.fees),
    ever: carryEntries(reading.ever),
    allTime: carry(reading.allTime),
    mrr: carry(reading.mrr),
    nextRenewal: reading.nextRenewal
      ? { ...reading.nextRenewal, amount: carry(reading.nextRenewal.amount) }
      : null,
    purchases,
  };
}

/**
 * Several accounts as one.
 *
 * Every one has to be in the same currency first, and this refuses if they are
 * not - the check is cheap and the failure it prevents is a total that means
 * nothing. Movements are concatenated rather than summed so that every window,
 * bucket and chart downstream is computed once over the whole stream.
 */
export function mergeReadings(readings: Reading[]): Reading {
  if (readings.length === 1) return readings[0];

  const currencies = [...new Set(readings.map((one) => one.currency.toLowerCase()))];
  if (currencies.length > 1) {
    throw new Error(`Cannot add up accounts in ${currencies.join(" and ").toUpperCase()}: one currency is needed.`);
  }

  const sum = (pick: (one: Reading) => number) =>
    readings.reduce((total, one) => total + pick(one), 0);
  const any = (pick: (one: Reading) => boolean) => readings.some(pick);

  const renewals = readings
    .map((one) => one.nextRenewal)
    .filter((renewal): renewal is NonNullable<Reading["nextRenewal"]> => renewal !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const starts = readings
    .map((one) => one.since)
    .filter((since): since is Date => since !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    currency: currencies[0] ?? "usd",
    sources: readings.flatMap((one) => one.sources),

    gross: readings.flatMap((one) => one.gross),
    net: readings.flatMap((one) => one.net),
    fees: sum((one) => one.fees),

    ever: readings.flatMap((one) => one.ever),
    allTime: sum((one) => one.allTime),
    since: starts[0] ?? null,
    lifetimeCapped: any((one) => one.lifetimeCapped),
    movementsCapped: any((one) => one.movementsCapped),

    mrr: sum((one) => one.mrr),
    subscribers: sum((one) => one.subscribers),
    trialing: sum((one) => one.trialing),
    unpriced: sum((one) => one.unpriced),
    subscriptionsCapped: any((one) => one.subscriptionsCapped),
    nextRenewal: renewals[0] ?? null,
    signups: readings.flatMap((one) => one.signups),

    succeededToday: sum((one) => one.succeededToday),
    failedToday: sum((one) => one.failedToday),
    newCustomersToday: sum((one) => one.newCustomersToday),
    customers: sum((one) => one.customers),
    customersCapped: any((one) => one.customersCapped),

    // One stream, newest first: what a person wants from "recent payments" is
    // the last few things that happened, not the last few per account.
    purchases: readings
      .flatMap((one) => one.purchases)
      .sort((a, b) => b.at.getTime() - a.at.getTime()),
  };
}

/**
 * Which accounts this widget is asking about.
 *
 * Nothing chosen means every one that is linked, which is what makes "the
 * total across all my keys" the default rather than a thing to go and
 * configure. A choice that names an account which is no longer linked is
 * refused rather than quietly dropped: the alternative is a total that is
 * missing an account and looks exactly like a bad month.
 */
export function pickAccounts(settings: Record<string, unknown>, linked: Account[]): Account[] {
  const wanted = (Array.isArray(settings.accounts) ? settings.accounts : [])
    .map((one) => String(one))
    .filter(Boolean);

  if (!wanted.length) return linked;

  const missing = wanted.filter((one) => !linked.some((account) => account.account === one));
  if (missing.length) {
    throw new Error(
      `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} no longer linked under Connections.`,
    );
  }

  return linked.filter((account) => wanted.includes(account.account));
}

/** Whether anything here has to cross a currency to be shown. */
export function needsRates(readings: Reading[], display: string): boolean {
  return readings.some(
    (one) =>
      one.currency.toLowerCase() !== display ||
      one.purchases.some((purchase) => purchase.currency.toLowerCase() !== display),
  );
}
