# Stripe

One key is one account. Dither holds as many as you paste, adds them up, and
will show the total in whatever currency you ask for.

## Linking an account

Connections → Stripe → paste a secret key → **Link**.

Use a **restricted** key with read access to Balance, Charges, Customers and
Subscriptions. That is everything the Revenue extension reads and nothing else;
Dither never writes to Stripe. The key is stored in this installation's own
database and is never sent to a browser — the page shows its last four
characters, which is enough to tell one key from another.

The key is checked before it is stored. Pasting a typo tells you so on the spot
rather than an hour later, when a blank widget is the only symptom.

### More than one

Paste another key and press **Add another account**. Each is filed under the
account it turns out to belong to — Stripe's own `acct_…` id — so a second key
is a second account rather than a replacement for the first.

A key restricted so tightly that it cannot read the account object has no id to
be filed under. It still works: Dither derives a stable name from the key
itself (`key_…`), which is the same for as long as the key is. Rotate that key
and you are linking a new account as far as Dither is concerned; a widget that
named it will say so rather than quietly showing you somebody else's figures.

## What a widget shows

Every revenue widget has two settings that come before all the others.

**Which accounts.** Leave every one unticked — the default — and the widget
adds up all of them, including any you link later. Tick some to show only
those. If a widget names an account that is no longer linked, it draws a fault
rather than a total that is quietly missing an account: a missing account and a
bad month look identical on a wall.

**Shown in.** The account's own currency by default, which is the figure Stripe
would show you and needs no rate behind it. Anything else is converted.

## Currencies, and what a converted figure means

Balance transactions arrive already in each account's settlement currency, so
one account is one currency and needs no conversion at all. Two accounts
settling differently have no single total until something says what a euro is
worth in pounds — so when a figure has to cross a currency, Dither fetches
today's rates from [exchangerate-api's open
endpoint](https://open.er-api.com/v6/latest/EUR): no key, no sign-up, 160-odd
currencies, updated once a day.

Rates are fetched **only when a figure actually has to cross a currency**. One
account displayed in its own currency never touches the network for this.

The table is held for six hours and shared between widgets, so a screenful of
revenue widgets costs one request between them at most.

**A rate that cannot be had is refused, never guessed.** If the accounts on a
widget cannot all be carried into one currency, the widget draws a fault. Adding
dollars to yen is the one error a revenue panel must never make quietly.

The payload says whether a figure was converted (`revenue.converted`) and when
the table was published (`revenue.rates_at`), so a design can say "at today's
rate" rather than implying a figure is exact.

A payment presented in a currency the table has never heard of keeps its own
currency and its own symbol on the recent-payments tape, rather than being
dropped from the list or silently relabelled.

## What is asked of Stripe

Six bounded lists per account, in parallel:

| list | what it answers |
| --- | --- |
| balance transactions (30 days) | what money moved, and when |
| balance transactions (unfiltered) | the lifetime figure, to 3000 movements |
| charges today | how many payments, and how many failed |
| charges (latest 50) | who paid, how much, at what time |
| subscriptions | MRR, subscribers, the next renewal |
| customers | how many there are |

Every one is bounded, because an unbounded page through a busy account is a
fetch that takes minutes and a rate limit that takes the panel down. Where a
bound bites the payload says so, the figure carries a `+`, and a design that
shows it says "at least".

An answer is cached by the **question** — the extension and the settings that
decide what is fetched — not by the widget. Six revenue widgets showing six
different numbers cost one trip between them.

Two settings are deliberately *not* presentational, so they do split the
question: **which accounts** and **shown in**. Both change the numbers rather
than the drawing of them, and a widget showing one account's takings must never
be handed the answer that was fetched for all three. A screen with a euro
widget and a dollar widget on it costs two fetches, which is the right way
round.

## Recent payments

The `purchases` design is the ledger tape: the newest payment as the hero, the
rest running underneath, led across from the time to the figure by dots whose
solid part is how big that payment was against the largest on screen.

Times are **clock times**, never "four minutes ago". A panel is handed one
picture and keeps it for a quarter of an hour, so a relative phrase is wrong for
most of its life; 14:32 is still 14:32 tomorrow. Where the tape crosses
midnight it draws the day it has crossed into, or yesterday's evening reads as
being after this morning.

Names come from the customer record where there is one, then the billing
details, then the receipt address. A payment with none of those is "Someone" —
which is true, and better than a blank line.

## Upgrading an installation that linked Stripe before this

```bash
cd web && npx tsx --env-file=.env.local scripts/stripe-accounts.mts
```

A key linked before multiple accounts existed is filed under the installation
rather than under an account, and nothing lists it — every revenue widget would
report that nothing is linked. The script moves it, and fills in the two new
settings on widgets and sources that predate them. It is idempotent; run it
twice and the second run says there was nothing to do.
