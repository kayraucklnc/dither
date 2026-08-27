import Stripe from "stripe";

import { DAY, dateLabel, startOfMonth, whenInWords } from "@/lib/clock";
import { changePercent, formatMoney, symbolFor, toMajorUnits } from "@/lib/money";
import type { FetchContext, Provider, Verification } from "@/lib/connections/provider";
import {
  ROLLING_DAYS,
  WINDOWS,
  afterDiscounts,
  milestoneOf,
  bucketByDay,
  bucketByHour,
  runningTotal,
  forecastNext,
  monthlyValue,
  sumBetween,
  sumSince,
  windowStarts,
  type Entry,
  type WindowKey,
} from "./metrics";

/**
 * The real Stripe connection.
 *
 * Everything on a revenue widget comes from here, and every number is answered
 * by one of five questions asked of the API:
 *
 *   balance transactions   what money actually moved, and when
 *   charges today          how many payments, and how many failed
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
 * bites, the payload says so rather than quietly reporting a smaller number
 * than the truth.
 */

const SECRET_KEY = "secret_key";

/* How far each bounded list is allowed to page. */
const LIMITS = {
  /** 30 days of movements. 5000 is a busy shop's month. */
  balanceTransactions: 5000,
  /** Today's payments only. */
  chargesToday: 1000,
  activeSubscriptions: 2000,
  /**
   * Everything the account has ever taken - bounded, because "ever" is not a
   * quantity anybody can promise to page through on a display's refresh.
   *
   * Three thousand movements is thirty requests at worst and one at best, and
   * covers a self-hosted shop's whole history several times over. Past that the
   * figure is a floor and says so: the payload carries `all_time_capped`, the
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
const FORECAST_DAYS = 30;

/** How much history the day-by-day chart holds. */
const HISTORY_DAYS = 30;

function client(credentials: Record<string, unknown>): Stripe {
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

async function collect<T>(
  list: Stripe.ApiListPromise<T>,
  limit: number,
): Promise<Bounded<T>> {
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
      .map((discount) =>
        typeof discount === "string" ? undefined : discount.source?.coupon,
      )
      .map((coupon) =>
        typeof coupon === "string" ? coupons.get(coupon) : (coupon ?? undefined),
      )
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

async function accountCurrency(stripe: Stripe): Promise<{ currency: string; name: string }> {
  try {
    // `null` is how stripe-node asks for the account behind the key itself.
    const account = await stripe.accounts.retrieve(null);
    return {
      currency: account.default_currency ?? "usd",
      name: account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? "",
    };
  } catch {
    // A restricted key may not be allowed to read the account. The balance is
    // readable by anything that can read charges, and carries the settlement
    // currency, which is the part that actually matters here.
    const balance = await stripe.balance.retrieve();
    return { currency: balance.available[0]?.currency ?? "usd", name: "" };
  }
}

async function verify(credentials: Record<string, unknown>): Promise<Verification> {
  try {
    const stripe = client(credentials);
    const { currency, name } = await accountCurrency(stripe);

    return {
      ok: true,
      label: name ? `${name} (${currency.toUpperCase()})` : `Stripe (${currency.toUpperCase()})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

/* -------------------------------------------------------------------------- */

async function fetchRevenue(
  settings: Record<string, unknown>,
  now: Date,
  context: FetchContext,
): Promise<Record<string, unknown>> {
  const stripe = client(context.credentials);
  const { timezone, locale } = context;

  const starts = windowStarts(now, timezone);
  const historyFrom = new Date(now.getTime() - HISTORY_DAYS * DAY);
  const forecastFrom = new Date(now.getTime() - FORECAST_DAYS * DAY);
  const monthFrom = startOfMonth(now, timezone);

  // The oldest thing any window needs. One list serves every window, which is
  // the whole reason the windows are cheap to add.
  const oldest = Math.min(historyFrom.getTime(), monthFrom.getTime());

  const [
    account,
    movements,
    chargesToday,
    activeSubscriptions,
    recentSubscriptions,
    customersToday,
    customers,
    coupons,
    lifetime,
  ] = await Promise.all([
    accountCurrency(stripe),
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

  const currency = account.currency;
  const { gross, net, fees } = entriesFrom(movements.items);

  /* Everything ever, as far back as the bound reaches. */
  const ever = entriesFrom(lifetime.items).gross;
  const allTime = ever.reduce((total, entry) => total + entry.amount, 0);
  const since = ever.reduce(
    (earliest, entry) => (entry.at < earliest ? entry.at : earliest),
    now,
  );

  const live = activeSubscriptions.items.filter(
    (one) => one.status === "active" || one.status === "trialing",
  );
  const couponsById = new Map(coupons.items.map((coupon) => [coupon.id, coupon]));
  const subscriptions = summariseSubscriptions(live, couponsById, activeSubscriptions.capped);

  const days = bucketByDay(gross, timezone, locale, HISTORY_DAYS, now);
  const week = days.slice(-7);

  /* -- the windows, in minor units ---------------------------------------- */

  const minor: Record<WindowKey, number> = {
    today: sumSince(gross, starts.today),
    yesterday: sumBetween(gross, starts.yesterday, starts.today),
    last_24h: sumSince(gross, starts.last24h),
    last_7d: sumSince(gross, new Date(now.getTime() - 7 * DAY)),
    last_15d: sumSince(gross, new Date(now.getTime() - 15 * DAY)),
    last_30d: sumSince(gross, new Date(now.getTime() - 30 * DAY)),
    month_to_date: sumSince(gross, monthFrom),
    all_time: allTime,
  };

  const succeeded = chargesToday.items.filter((charge) => charge.status === "succeeded");
  const failed = chargesToday.items.filter((charge) => charge.status === "failed");
  const succeededToday = succeeded.length;

  const sign = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

  /**
   * Every figure in both lengths, because how long a number is drawn is the
   * widget's business and not the account's.
   *
   * This used to read `settings.compact_figures` and format one way, which
   * quietly made "shorten large numbers" a *question* rather than a style: two
   * revenue widgets that disagreed about it asked Stripe twice for the same
   * numbers. Sending both costs a dozen bytes and buys a screenful of widgets
   * one fetch between them.
   */
  const money = (amount: number) => {
    const major = toMajorUnits(amount, currency);
    const short = formatMoney(major, currency, locale, { compact: true });
    const full = formatMoney(major, currency, locale, { compact: false });

    return { ...short, figure_full: full.figure, text_full: full.text };
  };

  const windows = Object.fromEntries(
    WINDOWS.map((window) => {
      const amount = minor[window.key];
      const before = ROLLING_DAYS[window.key];

      // A window compares against the window before it: 30 days against the
      // 30 before those, today against yesterday. Without that a figure is a
      // number with no direction, which is the least useful thing a dashboard
      // can show.
      const previous =
        window.key === "all_time"
          ? 0
          : window.key === "today"
          ? minor.yesterday
          : before !== undefined
            ? sumBetween(
                gross,
                new Date(now.getTime() - 2 * before * DAY),
                new Date(now.getTime() - before * DAY),
              )
            : sumBetween(
                gross,
                startOfMonth(new Date(monthFrom.getTime() - 1), timezone),
                monthFrom,
              );

      const delta = changePercent(amount, previous);

      /**
       * A lifetime figure that hit the page bound is a floor, not a total, and
       * says so with a "+" - the same way the customer count does. A number
       * that quietly means "at least" is the one kind of wrong figure a
       * dashboard can never be forgiven for.
       */
      const figures = money(amount);
      const floor = window.key === "all_time" && lifetime.capped;
      const atLeast = (value: string) => (floor ? `${value}+` : value);

      return [
        window.key,
        {
          key: window.key,
          label: window.label,
          short: window.short,
          ...figures,
          figure: atLeast(figures.figure),
          text: atLeast(figures.text),
          figure_full: atLeast(figures.figure_full),
          text_full: atLeast(figures.text_full),
          amount: toMajorUnits(amount, currency),
          previous: toMajorUnits(previous, currency),
          change_percent: delta,
          rising: amount >= previous,
          // The same shape every card has, so one template draws all of them.
          caption: window.label,
          detail:
            window.key === "today"
              ? `${succeededToday} payment${succeededToday === 1 ? "" : "s"}`
              : window.key === "all_time"
                ? `since ${dateLabel(since, timezone, locale)}${lifetime.capped ? ", and more before that" : ""}`
                : `against ${money(previous).text_full} ${window.against}`,
          delta: delta === null ? null : `${sign(delta)}% on ${window.against}`,
          // The same figure with nothing after it, for a box too small to hold
          // the sentence. A design should be able to drop the words without
          // dropping the direction.
          delta_short: delta === null ? null : `${sign(delta)}%`,
          bars: window.key === "today" || window.key === "yesterday" || window.key === "last_7d" ? "week" : "days",
        },
      ];
    }),
  );

  /**
   * The last seven days against the seven before, both as running totals.
   *
   * Two jagged daily lines on one chart are a pair of scribbles. Two running
   * totals are a race, and a race is readable across a room: either this week's
   * line is above last week's or it is not.
   *
   * Seven against seven rather than this month against last, because the fetch
   * only reaches back thirty days - a month-against-month comparison would be
   * built on data that is not there for most of the month, and a chart missing
   * half its history is worse than a chart of a shorter period.
   */
  const paceDays = days.slice(-14);
  const before = runningTotal(paceDays.slice(0, 7).map((bucket) => bucket.amount));
  const lately = runningTotal(paceDays.slice(7).map((bucket) => bucket.amount));

  const pace = {
    label: "the last 7 days",
    against: "the 7 before",
    ahead: (lately[lately.length - 1] ?? 0) >= (before[before.length - 1] ?? 0),
    change_percent: changePercent(lately[lately.length - 1] ?? 0, before[before.length - 1] ?? 0),
    current: paceDays.slice(7).map((bucket, index) => ({
      day: bucket.day,
      date: bucket.date,
      amount: toMajorUnits(bucket.amount, currency),
      total: toMajorUnits(lately[index], currency),
    })),
    previous: paceDays.slice(0, 7).map((bucket, index) => ({
      day: bucket.day,
      date: bucket.date,
      amount: toMajorUnits(bucket.amount, currency),
      total: toMajorUnits(before[index], currency),
    })),
  };

  /* -- subscribers -------------------------------------------------------- */

  const forecast = forecastNext(
    recentSubscriptions.items.map((one) => new Date(one.created * 1000)),
    FORECAST_DAYS,
    now,
  );

  const renewal = subscriptions.nextRenewal;

  const mrr = toMajorUnits(subscriptions.mrr, currency);

  /**
   * The milestones, one per figure that has one.
   *
   * Money is measured in major units here rather than in Stripe's minor ones,
   * because a milestone is a round number to a person and 2,500,000 cents is
   * not a round number to anybody.
   */
  const perDay = toMajorUnits(minor.last_30d, currency) / 30;

  const milestones = {
    all_time: milestoneOf(toMajorUnits(minor.all_time, currency), perDay),
    month_to_date: milestoneOf(toMajorUnits(minor.month_to_date, currency), perDay),
    today: milestoneOf(toMajorUnits(minor.today, currency)),
    last_7d: milestoneOf(toMajorUnits(minor.last_7d, currency), perDay),
    last_30d: milestoneOf(toMajorUnits(minor.last_30d, currency), perDay),
    mrr: milestoneOf(mrr),
    customers: milestoneOf(customers.items.length),
    subscribers: milestoneOf(subscriptions.subscribers, forecast.perWeek / 7),
  };

  /**
   * Every metric, in one shape.
   *
   * A design should not have to know that MRR is a currency and subscribers is
   * a count and the next signup is a date. It asks for the card the widget was
   * pointed at and draws a caption, a figure, a line of detail and maybe a
   * delta - so adding a metric is a card here and nothing in five templates,
   * and adding a design is a design and nothing in five metrics.
   *
   * Built here rather than from the widget's settings on purpose: an answer is
   * cached by the question that produced it, and the question is the account,
   * not the widget. Two revenue widgets showing two different metrics have to
   * share one trip to Stripe.
   */
  const plain = (value: number) => new Intl.NumberFormat(locale).format(value);

  const cards = {
    mrr: {
      key: "mrr",
      caption: "Monthly recurring",
      figure: money(subscriptions.mrr).figure,
      symbol: symbolFor(currency),
      detail:
        `${money(subscriptions.mrr * 12).text_full} a year` +
        (subscriptions.unpriced ? `, ${subscriptions.unpriced} usage-priced left out` : ""),
      delta: null as string | null,
      delta_short: null as string | null,
      rising: true,
      bars: "",
    },
    subscribers: {
      key: "subscribers",
      caption: "Subscribers",
      figure: plain(subscriptions.subscribers) + (subscriptions.capped ? "+" : ""),
      symbol: "",
      detail: subscriptions.trialing
        ? `${plain(subscriptions.trialing)} on trial`
        : `${money(subscriptions.mrr).text_full} a month between them`,
      delta: null as string | null,
      delta_short: null as string | null,
      rising: true,
      bars: "",
    },
    customers: {
      key: "customers",
      caption: "Customers",
      figure: plain(customers.items.length) + (customers.capped ? "+" : ""),
      symbol: "",
      detail: customersToday.items.length
        ? `${plain(customersToday.items.length)} new today`
        : "none new today",
      delta: null as string | null,
      delta_short: null as string | null,
      rising: true,
      bars: "",
    },
    next_subscriber: {
      key: "next_subscriber",
      caption: "Next subscriber",
      figure: forecast.expectedAt ? whenInWords(forecast.expectedAt.getTime() - now.getTime()) : "—",
      symbol: "",
      detail: forecast.sample
        ? `${forecast.perWeek} a week over the last ${FORECAST_DAYS} days — ${forecast.confidence}`
        : `no signups in ${FORECAST_DAYS} days`,
      delta: null as string | null,
      delta_short: null as string | null,
      rising: forecast.sample > 0,
      bars: "",
    },
    next_renewal: {
      key: "next_renewal",
      caption: "Next renewal",
      figure: renewal ? whenInWords(renewal.at.getTime() - now.getTime()) : "—",
      symbol: "",
      detail: renewal
        ? `${money(renewal.amount).text_full}${renewal.customer ? ` from ${renewal.customer}` : ""}`
        : "nothing scheduled",
      delta: null as string | null,
      delta_short: null as string | null,
      rising: true,
      bars: "",
    },
  };

  return {
    revenue: {
      cards,
      connected: true,
      account: account.name,
      currency: currency.toUpperCase(),

      /* Every window, addressable by name from a template. */
      windows,
      /* The default window's figure, so a simple template needs no lookup. */
      ...money(minor.today),
      symbol: symbolFor(currency),
      today: toMajorUnits(minor.today, currency),
      yesterday: toMajorUnits(minor.yesterday, currency),
      last_24h: toMajorUnits(minor.last_24h, currency),
      last_7d: toMajorUnits(minor.last_7d, currency),
      last_15d: toMajorUnits(minor.last_15d, currency),
      last_30d: toMajorUnits(minor.last_30d, currency),
      month_to_date: toMajorUnits(minor.month_to_date, currency),
      change_percent: changePercent(minor.today, minor.yesterday) ?? 0,

      net_30d: toMajorUnits(sumSince(net, new Date(now.getTime() - 30 * DAY)), currency),
      fees_30d: toMajorUnits(fees, currency),

      payments_today: succeeded.length,
      failed_today: failed.length,
      new_customers: customersToday.items.length,

      customers: customers.items.length,
      customers_capped: customers.capped,
      subscribers: subscriptions.subscribers,
      trialing: subscriptions.trialing,
      subscribers_capped: subscriptions.capped,

      mrr,
      mrr_text: money(subscriptions.mrr).text,
      mrr_figure: money(subscriptions.mrr).figure,
      arr: mrr * 12,
      arr_text: money(subscriptions.mrr * 12).text,
      /* Usage-based prices cannot be turned into a monthly figure, and a
         dashboard that hides that is a dashboard reporting a number it knows
         is short. */
      mrr_excludes: subscriptions.unpriced,

      next_subscriber: {
        expected_at: forecast.expectedAt?.toISOString() ?? null,
        in_words: forecast.expectedAt
          ? whenInWords(forecast.expectedAt.getTime() - now.getTime())
          : "not enough history",
        in_days: forecast.expectedAt
          ? Math.round(((forecast.expectedAt.getTime() - now.getTime()) / DAY) * 10) / 10
          : null,
        per_week: forecast.perWeek,
        sample: forecast.sample,
        confidence: forecast.confidence,
        window_days: FORECAST_DAYS,
      },

      next_renewal: renewal
        ? {
            at: renewal.at.toISOString(),
            in_words: whenInWords(renewal.at.getTime() - now.getTime()),
            in_days: Math.round(((renewal.at.getTime() - now.getTime()) / DAY) * 10) / 10,
            customer: renewal.customer,
            ...money(renewal.amount),
            amount: toMajorUnits(renewal.amount, currency),
          }
        : null,

      /**
       * Where each figure sits on the way to a round number.
       *
       * The one thing on a revenue panel that is not a measurement: it is
       * there to be looked forward to. Keyed the same way the windows and the
       * cards are, so a design shows the milestone for whatever the widget was
       * already pointed at rather than asking a second question.
       *
       * The days remaining only appear where a real rate stands behind them -
       * the last thirty days for money, the signup rate for subscribers.
       * Nothing is invented for a figure that has no rate.
       */
      milestones,

      all_time: toMajorUnits(minor.all_time, currency),
      all_time_capped: lifetime.capped,
      first_payment_at: ever.length ? since.toISOString() : null,

      /* Charts. `week` is the last seven of `days`, so a design can take
         either without a second fetch, and `hours` is today alone - the one
         series that can say whether a quiet day is quiet because it is nine in
         the morning. */
      hours: bucketByHour(gross, timezone, starts.today, now).map((bucket) => ({
        ...bucket,
        amount: toMajorUnits(bucket.amount, currency),
      })),
      pace,
      week: week.map((bucket) => ({
        day: bucket.day,
        date: bucket.date,
        amount: toMajorUnits(bucket.amount, currency),
      })),
      days: days.map((bucket) => ({
        day: bucket.day,
        date: bucket.date,
        amount: toMajorUnits(bucket.amount, currency),
      })),

      truncated: movements.capped || activeSubscriptions.capped || customers.capped,
    },
  };
}

export const stripe: Provider = {
  id: "stripe",
  label: "Stripe",
  description: "What you took, what recurs, and who is subscribing.",
  unlocks: "Revenue",
  icon: "card",
  mocked: false,
  help: {
    label: "Stripe API keys",
    url: "https://dashboard.stripe.com/apikeys",
  },
  credentials: [
    {
      key: SECRET_KEY,
      label: "Secret key",
      help:
        "A restricted key with read access to Balance, Charges, Customers and Subscriptions " +
        "is enough, and is what you should use. It is stored on this server and never leaves it.",
      placeholder: "rk_live_… or sk_live_…",
      secret: true,
    },
  ],
  verify,
  fetch: fetchRevenue,
};
