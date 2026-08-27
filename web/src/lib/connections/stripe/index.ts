import { DAY, dateLabel, dayKey, dayLabel, startOfMonth, wallClock, whenInWords } from "@/lib/clock";
import { changePercent, formatMoney, symbolFor, toMajorUnits } from "@/lib/money";
import { rateBetween, rates, type Rates } from "@/lib/exchange";
import type { FetchContext, Provider, Verification } from "@/lib/connections/provider";
import {
  ROLLING_DAYS,
  WINDOWS,
  milestoneOf,
  bucketByDay,
  bucketByHour,
  runningTotal,
  forecastNext,
  sumBetween,
  sumSince,
  windowStarts,
  type WindowKey,
} from "./metrics";
import { FORECAST_DAYS, HISTORY_DAYS, SECRET_KEY, identify, readAccount } from "./read";
import { chooseCurrency, convertReading, mergeReadings, needsRates, pickAccounts } from "./reading";

/**
 * The real Stripe connection.
 *
 * One key is one account, and a person can have several - a company and a side
 * project, a euro business and a dollar one. Each is read on its own by
 * `read.ts`, carried into one currency and added up by `reading.ts`, and
 * presented here. What is left in this file is the half a template sees: the
 * cards, the windows, the charts and the words around them.
 *
 * How many payments a design shows is the design's business, but somebody has
 * to say how many are carried. A dozen is more than any panel draws at once
 * and small enough to cost nothing.
 */
const PURCHASES_CARRIED = 12;


/**
 * Whether a key works, and whose account it is.
 *
 * The account's own id comes back too, because with several keys linked it is
 * what the row is filed under and what a widget's settings name. Checked
 * before anything is stored: pasting a typo and being told "linked" is how you
 * end up debugging a blank widget an hour later.
 */
async function verify(credentials: Record<string, unknown>): Promise<Verification> {
  try {
    const { id, currency, name } = await identify(credentials);

    return {
      ok: true,
      account: id,
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
  const { timezone, locale } = context;

  const chosen = pickAccounts(settings, context.accounts);
  if (!chosen.length) throw new Error("No Stripe account is linked. Add a key under Connections.");

  /*
   * Every account at once. They are independent, so the slowest of them is the
   * whole fetch either way, and reading them one after another would make a
   * third key three times the wait.
   */
  const readings = await Promise.all(
    chosen.map((account) => readAccount(account, now, timezone)),
  );

  const currency = chooseCurrency(String(settings.currency ?? ""), readings);

  /*
   * Rates, but only if a figure has to cross a currency to be shown.
   *
   * One account displayed in its own currency is the common case and it costs
   * nothing extra: nothing is converted, so nothing is fetched. Where a rate
   * *is* needed and cannot be had, this throws - and the widget draws a fault
   * rather than a total that added dollars to yen.
   */
  let table: Rates | undefined;
  if (needsRates(readings, currency)) table = await rates(currency, now);

  const rateFor = (code: string) =>
    code.toLowerCase() === currency ? 1 : table ? rateBetween(table, code, currency) : undefined;

  const merged = mergeReadings(readings.map((one) => convertReading(one, currency, rateFor)));

  const { gross, net, fees } = merged;
  const allTime = merged.allTime;
  const since = merged.since ?? now;

  const starts = windowStarts(now, timezone);
  const monthFrom = startOfMonth(now, timezone);

  const subscriptions = {
    mrr: merged.mrr,
    subscribers: merged.subscribers,
    trialing: merged.trialing,
    unpriced: merged.unpriced,
    capped: merged.subscriptionsCapped,
    nextRenewal: merged.nextRenewal,
  };

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

  const succeededToday = merged.succeededToday;

  const sign = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

  /**
   * A figure in both lengths, because how long a number is drawn is the
   * widget's business and not the account's.
   *
   * This used to read `settings.compact_figures` and format one way, which
   * quietly made "shorten large numbers" a *question* rather than a style: two
   * revenue widgets that disagreed about it asked Stripe twice for the same
   * numbers. Sending both costs a dozen bytes and buys a screenful of widgets
   * one fetch between them.
   *
   * `exact` is for a single payment. An aggregate has no pennies worth showing
   * and rounds, which is why every headline here is whole - but £24.50 is what
   * somebody paid, and £25 is not, and a tape of individual payments rounded
   * to the pound is a tape that does not add up to the total above it.
   */
  const moneyIn = (amount: number, code: string, exact = false) => {
    const major = toMajorUnits(amount, code);
    const short = formatMoney(major, code, locale, { compact: true });
    const full = formatMoney(major, code, locale, { compact: false, decimals: exact });

    return { ...short, figure_full: full.figure, text_full: full.text };
  };

  const money = (amount: number) => moneyIn(amount, currency);

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
      const floor = window.key === "all_time" && merged.lifetimeCapped;
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
                ? `since ${dateLabel(since, timezone, locale)}${merged.lifetimeCapped ? ", and more before that" : ""}`
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

  const forecast = forecastNext(merged.signups, FORECAST_DAYS, now);

  const renewal = subscriptions.nextRenewal;

  const mrr = toMajorUnits(subscriptions.mrr, currency);

  /**
   * The milestones, one per figure that has one.
   *
   * Money is measured in major units here rather than in Stripe's minor ones,
   * because a milestone is a round number to a person and 2,500,000 cents is
   * not a round number to anybody.
   *
   * Climbed in whole units, because a milestone belongs to the figure printed
   * beside it and every figure here is whole - `formatMoney` rounds unless it
   * is asked for decimals, and nothing asks. Handed the pennies instead, the
   * ladder measured a gap the panel never showed: a card reading GBP 526 sat
   * beside "GBP 224.04999999999995 to go", which is 750 less 525.95 as a
   * double and what a person actually found on their wall.
   */
  const perDay = toMajorUnits(minor.last_30d, currency) / 30;
  const whole = (amount: number) => Math.round(toMajorUnits(amount, currency));

  const milestones = {
    all_time: milestoneOf(whole(minor.all_time), perDay),
    month_to_date: milestoneOf(whole(minor.month_to_date), perDay),
    today: milestoneOf(whole(minor.today)),
    last_7d: milestoneOf(whole(minor.last_7d), perDay),
    last_30d: milestoneOf(whole(minor.last_30d), perDay),
    mrr: milestoneOf(Math.round(mrr)),
    customers: milestoneOf(merged.customers),
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
      figure: plain(merged.customers) + (merged.customersCapped ? "+" : ""),
      symbol: "",
      detail: merged.newCustomersToday
        ? `${plain(merged.newCustomersToday)} new today`
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

  /**
   * The last few payments, as a person would read them out.
   *
   * A name, an amount and a time - which is all "who just paid" is - and a
   * share of the biggest of them, so a design can give the run of payments a
   * shape without drawing a chart. The time is a clock time rather than "four
   * minutes ago": a panel is handed one picture and keeps it for a quarter of
   * an hour, so a relative phrase is wrong for most of its life, while
   * "14:32" is still 14:32 tomorrow.
   */
  const two = (value: number) => String(value).padStart(2, "0");
  const todayKey = dayKey(now, timezone);
  const yesterdayKey = dayKey(new Date(starts.today.getTime() - 1), timezone);

  const shown = merged.purchases.slice(0, PURCHASES_CARRIED);
  const biggest = shown.reduce((most, one) => Math.max(most, Math.abs(one.minor)), 0);
  const several = merged.sources.length > 1;

  const purchases = shown.map((purchase) => {
    const clock = wallClock(purchase.at, timezone);
    const key = dayKey(purchase.at, timezone);
    const from = merged.sources.find((one) => one.account === purchase.account);

    return {
      name: purchase.name,
      ...moneyIn(purchase.minor, purchase.currency, true),
      /* Its own currency where no rate could carry it, so a mixed list says so
         with a symbol rather than by quietly relabelling a figure. */
      currency: purchase.currency.toUpperCase(),
      converted: purchase.currency.toLowerCase() === currency,
      at: purchase.at.toISOString(),
      at_text: `${two(clock.hour)}:${two(clock.minute)}`,
      day:
        key === todayKey
          ? "Today"
          : key === yesterdayKey
            ? "Yesterday"
            : dayLabel(purchase.at, timezone, locale),
      today: key === todayKey,
      /* Nothing when there is only one account: naming it on every line is
         noise on a panel that has no second account to tell it apart from. */
      account: several ? (from?.label ?? "") : "",
      share: biggest ? Math.round((Math.abs(purchase.minor) / biggest) * 100) : 0,
    };
  });

  return {
    revenue: {
      cards,
      connected: true,
      purchases,
      purchase_count: purchases.length,
      /* Who was added up, and whether that was more than one. */
      accounts: merged.sources.map((one) => ({
        account: one.account,
        label: one.label,
        currency: one.currency.toUpperCase(),
      })),
      account:
        merged.sources.length === 1
          ? merged.sources[0].label
          : `${merged.sources.length} accounts`,
      account_count: merged.sources.length,
      currency: currency.toUpperCase(),
      /* Whether these figures were carried across a rate, and how old it is.
         A converted total is an estimate and a panel showing one should be
         able to say so. */
      converted: Boolean(table),
      rates_at: table ? table.fetchedAt.toISOString() : null,

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

      payments_today: merged.succeededToday,
      failed_today: merged.failedToday,
      new_customers: merged.newCustomersToday,

      customers: merged.customers,
      customers_capped: merged.customersCapped,
      subscribers: subscriptions.subscribers,
      trialing: subscriptions.trialing,
      subscribers_capped: merged.subscriptionsCapped,

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
      all_time_capped: merged.lifetimeCapped,
      first_payment_at: merged.since ? merged.since.toISOString() : null,

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

      truncated: merged.movementsCapped || merged.subscriptionsCapped || merged.customersCapped,
    },
  };
}

export const stripe: Provider = {
  id: "stripe",
  label: "Stripe",
  description: "What you took, what recurs, and who is subscribing. Add a key per account.",
  unlocks: "Revenue",
  icon: "card",
  mocked: false,
  /*
   * One key is one account, so holding several is how a person with a company
   * and a side project sees both - and how a widget adds them up. Each key is
   * filed under the account it turns out to belong to rather than under this
   * installation, because that id is what a widget's settings name.
   */
  multiple: true,
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
        "is enough, and is what you should use. It is stored on this server and never leaves it. " +
        "Add one key per Stripe account; a widget can show any of them or the total of all.",
      placeholder: "rk_live_… or sk_live_…",
      secret: true,
    },
  ],
  verify,
  fetch: fetchRevenue,
};
