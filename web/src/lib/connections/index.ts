import { dayShape } from "@/lib/calendar/day";
import { mockMeetings } from "@/lib/calendar/mock";
import type { Manifest } from "@/lib/extensions/manifest";
import type { Provider } from "./provider";
import { stripe } from "./stripe";

export type { CredentialField, FetchContext, Provider, Verification } from "./provider";

/**
 * Connections are accounts and services you link once, and every widget or
 * trigger that names one can use it.
 *
 * An extension that needs a connection does not carry credentials in its
 * settings - it says "I need Stripe" and the linked account answers for every
 * placement of it. That keeps a screen's settings about *what to show* rather
 * than about how to authenticate.
 *
 * Stripe is real: it takes a key you paste once, checks it before storing it,
 * and answers with the account's own numbers. The others are still stand-ins,
 * answering plausible moving data so screens and rules can be designed before
 * their sign-in flows exist. Each says which it is, and the dashboard says so
 * too - a stand-in that pretends to be real is worse than no stand-in.
 */

/**
 * Mock data has to *move*, or every design gets tuned against one frozen
 * snapshot and falls apart the day real numbers arrive. These wander with the
 * clock rather than randomly, so the same minute always renders the same way.
 */
const drift = (now: Date, spread: number, seed = 0) => {
  const minutes = now.getHours() * 60 + now.getMinutes() + seed * 37;
  return Math.sin(minutes / 90) * spread;
};

/* -------------------------------------------------------------------------- */

/**
 * Calendar, from a Google account.
 *
 * The provider is still a stand-in - the sign-in flow does not exist yet - but
 * the *shape* of what it answers is the real thing, and it is worked out by
 * lib/calendar/day.ts rather than assembled here. That matters more than it
 * looks: everything a design can ask about a day (am I in something, when am I
 * next free, is anything double-booked, how full is tomorrow) is arithmetic on
 * intervals, it is easy to get quietly wrong, and it is tested there. Swapping
 * the mock for the real API means replacing `mockMeetings` with a list call
 * and nothing else.
 *
 * One payload answers every question the account can be asked, because an
 * answer is cached by the question and the question is the account. Six
 * calendar widgets on a screen - what is next, the whole day, the week - cost
 * one trip between them.
 */
const google: Provider = {
  id: "google",
  label: "Google",
  description: "Calendar events from a Google account.",
  unlocks: "Calendar",
  icon: "calendar",
  mocked: true,

  async fetch(settings, now, context) {
    const timezone = context?.timezone ?? "UTC";
    const locale = context?.locale ?? "en-GB";
    const which = String(settings.calendar ?? "primary");

    return {
      calendar: {
        account: "Stand-in account",
        name: which.charAt(0).toUpperCase() + which.slice(1),
        ...dayShape(mockMeetings(now, timezone, which), now, {
          timezone,
          locale,
          horizonHours: Number(settings.horizon_hours ?? 12),
          hideDeclined: settings.hide_declined !== false,
        }),
      },
    };
  },
};

/* -------------------------------------------------------------------------- */

const QUOTES: Record<string, { name: string; base: number }> = {
  AAPL: { name: "Apple", base: 231.4 },
  MSFT: { name: "Microsoft", base: 428.9 },
  NVDA: { name: "NVIDIA", base: 118.2 },
  GOOGL: { name: "Alphabet", base: 176.5 },
  BTC: { name: "Bitcoin", base: 64210 },
  ETH: { name: "Ethereum", base: 3180 },
  SPY: { name: "S&P 500", base: 561.3 },
};

const markets: Provider = {
  id: "markets",
  label: "Markets",
  description: "Share and crypto prices for a watchlist.",
  unlocks: "Markets",
  icon: "chart",
  mocked: true,

  async fetch(settings, now) {
    const symbol = String(settings.symbol ?? "AAPL").toUpperCase();
    const quote = QUOTES[symbol] ?? { name: symbol, base: 100 };

    const history = Array.from({ length: 12 }, (_, index) => {
      const value = quote.base * (1 + drift(now, 0.03, index) + (index - 6) * 0.002);
      return Math.round(value * 100) / 100;
    });

    const price = history[history.length - 1];
    const open = history[0];
    const change = price - open;

    return {
      market: {
        symbol,
        name: quote.name,
        price,
        open,
        change: Math.round(change * 100) / 100,
        change_percent: Math.round((change / open) * 10000) / 100,
        rising: change >= 0,
        high: Math.max(...history),
        low: Math.min(...history),
        history,
      },
    };
  },
};

/* -------------------------------------------------------------------------- */

const HOUSE: Record<string, { label: string; icon: string; on: boolean; detail: string }> = {
  laptop: { label: "Laptop", icon: "laptop", on: true, detail: "Docked, 82%" },
  desk_lamp: { label: "Desk lamp", icon: "bolt", on: true, detail: "Warm, 40%" },
  front_door: { label: "Front door", icon: "home", on: false, detail: "Locked" },
  living_room: { label: "Living room", icon: "home", on: true, detail: "21.4 degrees" },
  printer: { label: "Printer", icon: "laptop", on: false, detail: "Idle" },
};

const home: Provider = {
  id: "home",
  label: "Home",
  description: "Whether things around the house are on: a laptop, a lamp, a door.",
  unlocks: "Home status",
  icon: "home",
  mocked: true,

  async fetch(settings, now) {
    const chosen = String(settings.entity ?? "laptop");

    const entities = Object.entries(HOUSE).map(([key, entity], index) => ({
      key,
      label: entity.label,
      icon: entity.icon,
      // A couple of them flip through the day, so a rule built on "is on" can
      // be seen firing and clearing rather than sitting frozen.
      on: index % 2 === 0 ? drift(now, 1, index) > 0 : entity.on,
      detail: entity.detail,
      minutes_since_change: Math.abs(Math.round(drift(now, 90, index))) + 3,
    }));

    const entity = entities.find((candidate) => candidate.key === chosen) ?? entities[0];

    return {
      home: {
        entity,
        entities,
        anyone_home: entities.some((candidate) => candidate.on),
        on_count: entities.filter((candidate) => candidate.on).length,
      },
    };
  },
};

/* -------------------------------------------------------------------------- */

const PROVIDERS = new Map<string, Provider>(
  [google, stripe, markets, home].map((provider) => [provider.id, provider]),
);

export function provider(id: string): Provider | undefined {
  return PROVIDERS.get(id);
}

export function allProviders(): Provider[] {
  return [...PROVIDERS.values()];
}

/** The connection an extension needs, if any. */
export function requiredBy(manifest: Manifest): Provider | undefined {
  return manifest.connection ? provider(manifest.connection) : undefined;
}
