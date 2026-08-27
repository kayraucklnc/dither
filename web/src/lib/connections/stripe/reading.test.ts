import { describe, expect, it } from "vitest";

import {
  chooseCurrency,
  convertReading,
  mergeReadings,
  pickAccounts,
  type Reading,
} from "./reading";

const at = (hour: number) => new Date(Date.UTC(2026, 7, 27, hour));

/** One account's answer, in its own currency, with only what a test needs set. */
const reading = (over: Partial<Reading> & { currency: string }): Reading => ({
  sources: [{ account: `acct_${over.currency}`, label: over.currency.toUpperCase(), currency: over.currency }],
  gross: [],
  net: [],
  fees: 0,
  ever: [],
  allTime: 0,
  since: null,
  lifetimeCapped: false,
  movementsCapped: false,
  mrr: 0,
  subscribers: 0,
  trialing: 0,
  unpriced: 0,
  subscriptionsCapped: false,
  nextRenewal: null,
  signups: [],
  succeededToday: 0,
  failedToday: 0,
  newCustomersToday: 0,
  customers: 0,
  customersCapped: false,
  purchases: [],
  ...over,
});

describe("which currency the figures are shown in", () => {
  it("uses the account's own when nothing was asked for", () => {
    expect(chooseCurrency("", [reading({ currency: "gbp" })])).toBe("gbp");
  });

  it("keeps that answer when every account agrees", () => {
    expect(chooseCurrency("", [reading({ currency: "eur" }), reading({ currency: "eur" })])).toBe("eur");
  });

  it("falls to the first account when they disagree, because a total needs one", () => {
    // Deterministic rather than clever: two accounts settling differently have
    // no shared answer, and picking the busiest would move the whole panel the
    // day trading shifted.
    expect(chooseCurrency("", [reading({ currency: "gbp" }), reading({ currency: "jpy" })])).toBe("gbp");
  });

  it("obeys a currency that was asked for, however it was spelled", () => {
    expect(chooseCurrency("USD", [reading({ currency: "eur" })])).toBe("usd");
  });

  it("treats the reserved word as no answer at all", () => {
    expect(chooseCurrency("account", [reading({ currency: "eur" })])).toBe("eur");
  });

  it("has something to say even with nothing linked", () => {
    expect(chooseCurrency("", [])).toBe("usd");
  });
});

describe("carrying one account into another currency", () => {
  const euros = reading({
    currency: "eur",
    gross: [{ at: at(9), amount: 1000 }],
    net: [{ at: at(9), amount: 950 }],
    fees: 50,
    ever: [{ at: at(9), amount: 1000 }],
    allTime: 1000,
    mrr: 2000,
    nextRenewal: { at: at(12), amount: 500, customer: "Ada" },
    purchases: [{ at: at(9), minor: 1000, currency: "eur", name: "Ada", account: "acct_eur" }],
  });

  it("moves every figure, not just the headline", () => {
    const carried = convertReading(euros, "gbp", () => 0.8);

    expect(carried.currency).toBe("gbp");
    expect(carried.gross[0].amount).toBe(800);
    expect(carried.net[0].amount).toBe(760);
    expect(carried.fees).toBe(40);
    expect(carried.ever[0].amount).toBe(800);
    expect(carried.allTime).toBe(800);
    expect(carried.mrr).toBe(1600);
    expect(carried.nextRenewal?.amount).toBe(400);
  });

  it("leaves the account alone when it is already in that currency", () => {
    const same = convertReading(euros, "eur", () => {
      throw new Error("no rate should have been asked for");
    });

    expect(same.gross[0].amount).toBe(1000);
    expect(same.mrr).toBe(2000);
  });

  it("refuses rather than adding two currencies together", () => {
    // The one thing that must never happen quietly. A missing rate means the
    // total cannot be known, and a total that cannot be known is not a total.
    expect(() => convertReading(euros, "gbp", () => undefined)).toThrow(/rate/i);
  });

  it("keeps a payment in its own currency when only that one cannot be carried", () => {
    // A charge presented in a currency the table has never heard of is still a
    // real payment, and dropping it from the list would be a quieter lie than
    // showing it with its own symbol beside it.
    const mixed = reading({
      currency: "eur",
      purchases: [
        { at: at(9), minor: 1000, currency: "eur", name: "Ada", account: "acct_eur" },
        { at: at(10), minor: 500, currency: "xyz", name: "Bo", account: "acct_eur" },
      ],
    });

    const carried = convertReading(mixed, "gbp", (currency) => (currency === "eur" ? 0.8 : undefined));

    expect(carried.purchases[0]).toMatchObject({ minor: 800, currency: "gbp" });
    expect(carried.purchases[1]).toMatchObject({ minor: 500, currency: "xyz" });
  });
});

describe("adding accounts up", () => {
  const one = reading({
    currency: "eur",
    gross: [{ at: at(9), amount: 1000 }],
    allTime: 4000,
    fees: 30,
    mrr: 2000,
    subscribers: 3,
    trialing: 1,
    customers: 40,
    succeededToday: 2,
    failedToday: 1,
    newCustomersToday: 1,
    since: at(8),
    nextRenewal: { at: at(20), amount: 500, customer: "Ada" },
    signups: [at(7)],
    purchases: [{ at: at(9), minor: 1000, currency: "eur", name: "Ada", account: "a" }],
  });

  const two = reading({
    currency: "eur",
    gross: [{ at: at(11), amount: 250 }],
    allTime: 900,
    fees: 8,
    mrr: 700,
    subscribers: 1,
    customers: 12,
    succeededToday: 1,
    since: at(6),
    nextRenewal: { at: at(15), amount: 900, customer: "Bo" },
    signups: [at(5)],
    customersCapped: true,
    purchases: [{ at: at(11), minor: 250, currency: "eur", name: "Bo", account: "b" }],
  });

  it("adds the money and the counts", () => {
    const all = mergeReadings([one, two]);

    expect(all.allTime).toBe(4900);
    expect(all.fees).toBe(38);
    expect(all.mrr).toBe(2700);
    expect(all.subscribers).toBe(4);
    expect(all.trialing).toBe(1);
    expect(all.customers).toBe(52);
    expect(all.succeededToday).toBe(3);
    expect(all.failedToday).toBe(1);
    expect(all.newCustomersToday).toBe(1);
  });

  it("keeps every movement, so a window sums them all", () => {
    expect(mergeReadings([one, two]).gross).toHaveLength(2);
  });

  it("reaches back to the earliest account, because that is when trading started", () => {
    expect(mergeReadings([one, two]).since).toEqual(at(6));
  });

  it("takes the soonest renewal, whichever account it is on", () => {
    expect(mergeReadings([one, two]).nextRenewal?.customer).toBe("Bo");
  });

  it("carries a bound that bit on any account, so a floor is still a floor", () => {
    expect(mergeReadings([one, two]).customersCapped).toBe(true);
  });

  it("names every account it added up", () => {
    expect(mergeReadings([one, two]).sources).toHaveLength(2);
  });

  it("puts the payments in one stream, newest first", () => {
    const all = mergeReadings([one, two]);

    expect(all.purchases.map((purchase) => purchase.name)).toEqual(["Bo", "Ada"]);
  });

  it("refuses to add figures that are not in one currency", () => {
    expect(() => mergeReadings([one, { ...two, currency: "gbp" }])).toThrow(/currency/i);
  });

  it("hands back the one reading unchanged when there is only one", () => {
    expect(mergeReadings([one]).allTime).toBe(4000);
  });
});

describe("which accounts a widget is asking about", () => {
  const account = (name: string) => ({ account: name, label: name, credentials: {} });
  const linked = [account("acct_one"), account("acct_two"), account("acct_three")];

  it("means every one when none is ticked", () => {
    // The default, and what makes "the total across all my keys" something you
    // get rather than something you go and configure.
    expect(pickAccounts({}, linked)).toHaveLength(3);
    expect(pickAccounts({ accounts: [] }, linked)).toHaveLength(3);
  });

  it("takes exactly the ones ticked", () => {
    const chosen = pickAccounts({ accounts: ["acct_two"] }, linked);

    expect(chosen.map((one) => one.account)).toEqual(["acct_two"]);
  });

  it("refuses when a chosen account is no longer linked", () => {
    // Quietly dropping it would leave a total missing an account, which looks
    // exactly like a bad month and is the one figure nobody can catch by eye.
    expect(() => pickAccounts({ accounts: ["acct_two", "acct_gone"] }, linked)).toThrow(/acct_gone/);
  });

  it("ignores an answer that is not a list at all", () => {
    expect(pickAccounts({ accounts: "acct_two" }, linked)).toHaveLength(3);
  });
});
