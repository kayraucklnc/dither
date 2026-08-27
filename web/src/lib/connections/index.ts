import type { Manifest } from "@/lib/extensions/manifest";

/**
 * Connections are accounts and services you link once, and every widget or
 * trigger that names one can use it.
 *
 * An extension that needs a connection does not carry credentials in its
 * settings - it says "I need Stripe" and the linked account answers for every
 * placement of it. That keeps a screen's settings about *what to show* rather
 * than about how to authenticate.
 *
 * Every provider here is mocked. They answer plausible, moving data so screens
 * and rules can be designed and tested before any sign-in flow exists;
 * replacing a mock with a real client changes this file and nothing above it.
 * Each says so, and the dashboard says so too - a stand-in that pretends to be
 * real is worse than no stand-in.
 */

export interface Provider {
  id: string;
  label: string;
  description: string;
  /** What linking it unlocks, for the connections page. */
  unlocks: string;
  icon: string;
  /** True while the real integration is not written yet. */
  mocked: boolean;
  fetch(settings: Record<string, unknown>, now: Date): Promise<Record<string, unknown>>;
}

const clock = (from: Date, minutes: number) => {
  const at = new Date(from.getTime() + minutes * 60_000);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
};

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

const MEETINGS = [
  { title: "Design review", location: "Milano Centrale, Sala 4", remote: false, minutes: 24, length: 45 },
  { title: "Standup", location: "Meet", remote: true, minutes: 84, length: 15 },
  { title: "1:1 with Ana", location: "Sala 2", remote: false, minutes: 294, length: 30 },
  { title: "Sprint planning", location: "Zoom", remote: true, minutes: 380, length: 60 },
];

const google: Provider = {
  id: "google",
  label: "Google",
  description: "Calendar events from a Google account.",
  unlocks: "Calendar",
  icon: "calendar",
  mocked: true,

  async fetch(settings, now) {
    const horizon = Number(settings.horizon_hours ?? 12) * 60;

    const events = MEETINGS.filter((meeting) => meeting.minutes <= horizon).map((meeting) => ({
      title: meeting.title,
      start: clock(now, meeting.minutes),
      end: clock(now, meeting.minutes + meeting.length),
      location: meeting.location,
      remote: meeting.remote,
      minutes_until: meeting.minutes,
      accepted: true,
    }));

    const next = events[0];

    return {
      calendar: {
        empty: events.length === 0,
        remaining_today: events.length,
        free_minutes: next ? next.minutes_until : 480,
        next: next ?? null,
        events,
      },
    };
  },
};

/* -------------------------------------------------------------------------- */

const stripe: Provider = {
  id: "stripe",
  label: "Stripe",
  description: "Payments, revenue and new customers.",
  unlocks: "Revenue",
  icon: "card",
  mocked: true,

  async fetch(settings, now) {
    const currency = String(settings.currency ?? "EUR");
    const symbol = ({ EUR: "€", USD: "$", GBP: "£" } as Record<string, string>)[currency] ?? "";

    // A day that fills up as it goes, so a morning screenshot differs from an
    // evening one the way a real dashboard would.
    const throughDay = (now.getHours() * 60 + now.getMinutes()) / 1440;
    const today = Math.round(4200 * throughDay + Math.abs(drift(now, 180)));

    const week = Array.from({ length: 7 }, (_, index) => ({
      day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
      amount: Math.round(3200 + drift(now, 900, index) + index * 140),
    }));

    const yesterday = week[5].amount;

    return {
      revenue: {
        currency,
        symbol,
        today,
        yesterday,
        change_percent: yesterday ? Math.round(((today - yesterday) / yesterday) * 100) : 0,
        month_to_date: Math.round(week.reduce((total, day) => total + day.amount, 0) * 3.4),
        payments_today: Math.max(1, Math.round(today / 78)),
        new_customers: Math.max(0, Math.round(6 + drift(now, 4, 3))),
        failed_today: Math.max(0, Math.round(1 + drift(now, 2, 5))),
        week,
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
