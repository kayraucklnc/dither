import { createHash } from "node:crypto";
import Stripe from "stripe";

import { DAY, startOfMonth } from "@/lib/clock";
import {
  afterDiscounts,
  monthlyValue,
  windowStarts,
  type Entry,
} from "./metrics";
import type { Purchase, Reading } from "./reading";

/**
 * One Stripe account, read.
 *
 * Everything a revenue widget shows comes from here, and every number is
 * answered by one of six questions asked of the API:
 *
 *   balance transactions   what money actually moved, and when
 *   charges today          how many payments, and how many failed
 *   recent charges         who paid, how much, and at what time
 *   active subscriptions   MRR, how many subscribers, when the next one renews
 *   recent subscriptions   the signup rate, which is what a forecast is
 *   customers              how many there are
 *
 * Balance transactions rather than charges for the money, because they are
 * already in the account's settlement currency: an account taking payments in
 * four currencies has one number for "what we made", and summing charges would
 * add dollars to yen. They also include refunds and disputes as they happen,
 * so the figure is what the account is actually up, not what was billed.
 *
 * Every list is bounded. An unbounded `autoPagingEach` over a busy account is
 * a fetch that takes minutes and a rate limit that takes the panel down, and a
 * screen refreshing every twenty minutes cannot afford either. Where a bound
 * bites, the reading says so rather than quietly reporting a smaller number
 * than the truth.
 */

export const SECRET_KEY = "secret_key";

/* How far each bounded list is allowed to page. */
const LIMITS = {
  /** 30 days of movements. 5000 is a busy shop's month. */
  balanceTransactions: 5000,
  /** Today's payments only. */
  chargesToday: 1000,
  /**
   * The last few payments, whenever they were.
   *
   * One page, because this is a list somebody reads down rather than a figure
   * anything is computed from - and a design showing more than a dozen of them
   * at panel size is a design nobody can read across a room.
   */
  recentCharges: 50,
  activeSubscriptions: 2000,
  /**
   * Everything the account has ever taken - bounded, because "ever" is not a
   * quantity anybody can promise to page through on a display's refresh.
   *
   * Three thousand movements is thirty requests at worst and one at best, and
   * covers a self-hosted shop's whole history several times over. Past that the
   * figure is a floor and says so: the reading carries `lifetimeCapped`, the
   * figure carries a "+", and a design that shows it says "at least".
   *
   * It overlaps the windows list on purpose. Deriving both from one call would
   * save a few requests for a small account and quietly truncate the thirty-day
   * window for a busy one, which is the wrong way round: the windows are what
   * people run their week on, and the lifetime figure is what they frame.
   */
  lifetime: 3000,
  recentSubscriptions: 1000,
  customers: 5000,
  coupons: 500,
};

/** The window the signup rate is measured over. */
export const FORECAST_DAYS = 30;

/** How much history the day-by-day chart holds. */
export const HISTORY_DAYS = 30;

export function client(credentials: Record<string, unknown>): Stripe {
  const key = String(credentials[SECRET_KEY] ?? "").trim();
  if (!key) throw new Error("No Stripe secret key is stored for this connection.");

  return new Stripe(key, {
    // Pinned rather than floating, so an API version rolling forward cannot
    // silently move a field out from under a template months from now.
    apiVersion: "2026-08-26.dahlia",
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Dither", url: "https://github.com/kayraucklnc/dither" },
  });
}

interface Bounded<T> {
  items: T[];
  /** True when the bound was reached, so the number below is a floor. */
  capped: boolean;
}

async function collect<T>(list: Stripe.ApiListPromise<T>, limit: number): Promise<Bounded<T>> {
  const items = await list.autoPagingToArray({ limit });
  return { items, capped: items.length >= limit };
}

/**
 * Which balance transactions count as money coming in.
 *
 * `charge` and `payment` are income. Refunds, reversals and disputes are
 * already negative amounts, so they simply subtract. Payouts and Stripe's own
 * fees are movements of money we already counted, and adding them would count
 * the same euro twice in opposite directions.
 */
const INCOME = new Set(["charge", "payment"]);
const OUTGOING = new Set([
  "refund",
  "payment_refund",
  "payment_failure_refund",
  "refund_failure",
  "adjustment",
  "contribution",
]);

function entriesFrom(transactions: Stripe.BalanceTransaction[]) {
  const gross: Entry[] = [];
  const net: Entry[] = [];
  let fees = 0;

  for (const transaction of transactions) {
    const at = new Date(transaction.created * 1000);

    if (INCOME.has(transaction.type)) {
      gross.push({ at, amount: transaction.amount });
      net.push({ at, amount: transaction.net });
      fees += transaction.fee;
      continue;
    }

    if (OUTGOING.has(transaction.type)) {
      net.push({ at, amount: transaction.net });
      // A refund reduces what we made, so it belongs in gross too - otherwise
      // "taken today" is a number that only ever goes up.
      gross.push({ at, amount: transaction.amount });
    }
  }

  return { gross, net, fees };
}

interface SubscriptionSummary {
  /** Minor units per month, after discounts. */
  mrr: number;
  subscribers: number;
  trialing: number;
  /** Subscriptions whose price is usage-based, so no MRR can be computed. */
  unpriced: number;
  capped: boolean;
  nextRenewal: { at: Date; amount: number; customer: string } | null;
}

/**
 * Stripe types `interval` as an open string union, so a value it has never
 * shipped would compile and then normalise to nothing. Anything unrecognised
 * is treated as monthly, which is the only reading that cannot silently make
 * MRR look better than it is.
 */
function intervalOf(interval: string): "day" | "week" | "month" | "year" {
  return interval === "day" || interval === "week" || interval === "year" ? interval : "month";
}

function summariseSubscriptions(
  subscriptions: Stripe.Subscription[],
  coupons: Map<string, Stripe.Coupon>,
  capped: boolean,
): SubscriptionSummary {
  let mrr = 0;
  let unpriced = 0;
  let trialing = 0;
  let nextRenewal: SubscriptionSummary["nextRenewal"] = null;

  for (const subscription of subscriptions) {
    if (subscription.status === "trialing") trialing += 1;

    // A discount arrives as an id, or as an object whose coupon is *also* an
    // id. Rather than nesting expands four deep - which Stripe caps, and which
    // would fail the whole fetch if it ever changed - the account's coupons
    // are listed once and looked up here.
    const discounts = subscription.discounts
      .map((discount) => (typeof discount === "string" ? undefined : discount.source?.coupon))
      .map((coupon) => (typeof coupon === "string" ? coupons.get(coupon) : (coupon ?? undefined)))
      .filter((coupon): coupon is Stripe.Coupon => coupon !== undefined)
      .map((coupon) => ({ percentOff: coupon.percent_off, amountOff: coupon.amount_off }));

    let subscriptionMonthly = 0;

    for (const item of subscription.items.data) {
      const price = item.price;
      const recurring = price?.recurring;

      // Tiered and metered prices have no unit amount until an invoice exists,
      // so they cannot be turned into a monthly figure here. Counted and
      // reported rather than treated as zero, because a silent zero makes MRR
      // look like it fell.
      if (!recurring || price.unit_amount === null || price.billing_scheme !== "per_unit") {
        unpriced += 1;
        continue;
      }

      subscriptionMonthly += monthlyValue({
        unitAmount: price.unit_amount,
        quantity: item.quantity ?? 1,
        interval: intervalOf(recurring.interval),
        intervalCount: recurring.interval_count,
      });

      const endsAt = item.current_period_end;
      if (endsAt && (!nextRenewal || endsAt * 1000 < nextRenewal.at.getTime())) {
        nextRenewal = {
          at: new Date(endsAt * 1000),
          amount: (price.unit_amount ?? 0) * (item.quantity ?? 1),
          customer:
            typeof subscription.customer === "string"
              ? ""
              : ((subscription.customer as Stripe.Customer)?.name ??
                (subscription.customer as Stripe.Customer)?.email ??
                ""),
        };
      }
    }

    // A trial contributes nothing this month, and counting it as MRR is the
    // single most common way a dashboard flatters itself.
    if (subscription.status === "active") {
      mrr += afterDiscounts(subscriptionMonthly, discounts);
    }
  }

  return {
    mrr: Math.round(mrr),
    subscribers: subscriptions.filter((one) => one.status === "active").length,
    trialing,
    unpriced,
    capped,
    nextRenewal,
  };
}

/* -------------------------------------------------------------------------- */

export interface Identity {
  /** Stripe's own id for the account, or something stable derived from the key. */
  id: string;
  currency: string;
  name: string;
}

/**
 * Whose account a key belongs to, and what it settles in.
 *
 * The id matters more than it used to: with several keys linked it is the name
 * a widget's settings hold, so it has to be stable and it has to be the
 * account's rather than something we made up per link. A restricted key may
 * not be allowed to read the account, and then there is no id to have - so one
 * is derived from the key itself, which is stable for as long as the key is
 * and reveals nothing about it.
 */
export async function identify(credentials: Record<string, unknown>): Promise<Identity> {
  const stripe = client(credentials);

  try {
    // `null` is how stripe-node asks for the account behind the key itself.
    const account = await stripe.accounts.retrieve(null);
    return {
      id: account.id,
      currency: account.default_currency ?? "usd",
      name: account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? "",
    };
  } catch {
    // The balance is readable by anything that can read charges, and carries
    // the settlement currency, which is the part that actually matters here.
    const balance = await stripe.balance.retrieve();

    return {
      id: derivedId(credentials),
      currency: balance.available[0]?.currency ?? "usd",
      name: "",
    };
  }
}

/** A stable name for a key whose account will not identify itself. */
export function derivedId(credentials: Record<string, unknown>): string {
  const key = String(credentials[SECRET_KEY] ?? "");
  return `key_${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

/** The best name a charge can be given, and never a blank one. */
function payerOf(charge: Stripe.Charge): string {
  const customer = typeof charge.customer === "string" ? undefined : charge.customer;

  const candidates = [
    customer && "name" in customer ? customer.name : undefined,
    customer && "email" in customer ? customer.email : undefined,
    charge.billing_details?.name,
    charge.billing_details?.email,
    charge.receipt_email,
  ];

  return candidates.find((one) => typeof one === "string" && one.trim())?.trim() ?? "Someone";
}

/**
 * Everything one account has to say, in its own currency.
 *
 * Nine lists in parallel, because they are independent and the slowest of them
 * is the whole fetch either way.
 */
export async function readAccount(
  reference: { account: string; label: string; credentials: Record<string, unknown> },
  now: Date,
  timezone: string,
): Promise<Reading> {
  const stripe = client(reference.credentials);
  const starts = windowStarts(now, timezone);
  const historyFrom = new Date(now.getTime() - HISTORY_DAYS * DAY);
  const forecastFrom = new Date(now.getTime() - FORECAST_DAYS * DAY);
  const monthFrom = startOfMonth(now, timezone);

  // The oldest thing any window needs. One list serves every window, which is
  // the whole reason the windows are cheap to add.
  const oldest = Math.min(historyFrom.getTime(), monthFrom.getTime());

  const [
    identity,
    movements,
    chargesToday,
    recentCharges,
    activeSubscriptions,
    recentSubscriptions,
    customersToday,
    customers,
    coupons,
    lifetime,
  ] = await Promise.all([
    identify(reference.credentials),
    collect(
      stripe.balanceTransactions.list({
        created: { gte: Math.floor(oldest / 1000) },
        limit: 100,
      }),
      LIMITS.balanceTransactions,
    ),
    collect(
      stripe.charges.list({
        created: { gte: Math.floor(starts.today.getTime() / 1000) },
        limit: 100,
      }),
      LIMITS.chargesToday,
    ),
    // Whenever they were, so a quiet morning still has something to show. The
    // customer is expanded because `billing_details` is only as filled in as
    // the checkout was, and a list of "Someone" is a list of nothing.
    collect(
      stripe.charges.list({ limit: LIMITS.recentCharges, expand: ["data.customer"] }),
      LIMITS.recentCharges,
    ),
    collect(
      stripe.subscriptions.list({
        status: "all",
        limit: 100,
        expand: ["data.discounts", "data.customer"],
      }),
      LIMITS.activeSubscriptions,
    ),
    collect(
      stripe.subscriptions.list({
        status: "all",
        created: { gte: Math.floor(forecastFrom.getTime() / 1000) },
        limit: 100,
      }),
      LIMITS.recentSubscriptions,
    ),
    collect(
      stripe.customers.list({
        created: { gte: Math.floor(starts.today.getTime() / 1000) },
        limit: 100,
      }),
      LIMITS.customers,
    ),
    collect(stripe.customers.list({ limit: 100 }), LIMITS.customers),
    collect(stripe.coupons.list({ limit: 100 }), LIMITS.coupons),
    collect(stripe.balanceTransactions.list({ limit: 100 }), LIMITS.lifetime),
  ]);

  const { gross, net, fees } = entriesFrom(movements.items);

  /* Everything ever, as far back as the bound reaches. */
  const ever = entriesFrom(lifetime.items).gross;
  const allTime = ever.reduce((total, entry) => total + entry.amount, 0);

  const live = activeSubscriptions.items.filter(
    (one) => one.status === "active" || one.status === "trialing",
  );
  const couponsById = new Map(coupons.items.map((coupon) => [coupon.id, coupon]));
  const subscriptions = summariseSubscriptions(live, couponsById, activeSubscriptions.capped);

  const purchases: Purchase[] = recentCharges.items
    .filter((charge) => charge.status === "succeeded")
    .map((charge) => ({
      at: new Date(charge.created * 1000),
      minor: charge.amount,
      currency: charge.currency,
      name: payerOf(charge),
      account: identity.id,
    }));

  return {
    currency: identity.currency,
    sources: [
      {
        account: identity.id,
        label: reference.label || identity.name || `Stripe (${identity.currency.toUpperCase()})`,
        currency: identity.currency,
      },
    ],

    gross,
    net,
    fees,

    ever,
    allTime,
    since: ever.reduce<Date | null>(
      (earliest, entry) => (!earliest || entry.at < earliest ? entry.at : earliest),
      null,
    ),
    lifetimeCapped: lifetime.capped,
    movementsCapped: movements.capped,

    mrr: subscriptions.mrr,
    subscribers: subscriptions.subscribers,
    trialing: subscriptions.trialing,
    unpriced: subscriptions.unpriced,
    subscriptionsCapped: subscriptions.capped,
    nextRenewal: subscriptions.nextRenewal,
    signups: recentSubscriptions.items.map((one) => new Date(one.created * 1000)),

    succeededToday: chargesToday.items.filter((charge) => charge.status === "succeeded").length,
    failedToday: chargesToday.items.filter((charge) => charge.status === "failed").length,
    newCustomersToday: customersToday.items.length,
    customers: customers.items.length,
    customersCapped: customers.capped,

    purchases,
  };
}
