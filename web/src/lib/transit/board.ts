import { city, provider } from "@/lib/transit/catalog";
import { trenordBoard } from "@/lib/transit/trenord";

/**
 * A departure board.
 *
 * Trenord answers for itself - see trenord/. Operators without a client yet get
 * a board generated from the settings, which at least respects what it was
 * asked and moves with the clock, so the same minute renders the same way
 * twice. A stand-in that ignores its inputs is worse than none: it reads as a
 * bug in the settings rather than an absent integration, which is exactly how
 * the last one behaved.
 */
export interface Departure {
  line: string;
  number: string;
  direction: string;
  scheduled: string;
  expected: string;
  minutes_until: number;
  delay: number;
  delayed: boolean;
  platform: string;
  arrival: string;
  duration: number;
  changes: number;
  direct: boolean;
  cancelled: boolean;
  live: boolean;
  status: string;
}

const LINES = ["S1", "S3", "S4", "R14", "RE2", "S9", "R25"];

const clock = (from: Date, minutes: number) => {
  const at = new Date(from.getTime() + minutes * 60_000);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
};

/** Stable per station name, so one route does not reshuffle on every fetch. */
function seedOf(value: string): number {
  let seed = 0;
  for (const character of value) seed = (seed * 31 + character.charCodeAt(0)) % 9973;
  return seed;
}

export async function board(
  settings: Record<string, unknown>,
  now = new Date(),
): Promise<Record<string, unknown>> {
  const origin = String(settings.origin ?? "").trim();
  const destination = String(settings.destination ?? "").trim();
  const countryCode = String(settings.country ?? "it");
  const cityCode = String(settings.city ?? "milan");
  const providerCode = String(settings.provider ?? "trenord");

  const chosen = provider(countryCode, cityCode, providerCode);
  const where = city(countryCode, cityCode);

  if (!chosen) {
    throw new Error(
      `No operator called "${providerCode}" answers for ${where?.label ?? cityCode}.`,
    );
  }

  if (!origin) throw new Error("Choose a station to depart from.");

  // A real client answers for its own operator. Everything else gets a board
  // built from the settings, which at least respects what it was asked.
  if (!chosen.mocked) {
    return trenordBoard(
      {
        origin,
        destination,
        limit: Math.max(1, Math.min(12, Number(settings.limit ?? 5))),
        leadTime: Math.max(0, Number(settings.lead_time ?? 0)),
        transfers: Math.max(0, Number(settings.transfers ?? 1)),
        language: String(settings.language ?? "en"),
        hideCancelled: settings.hide_cancelled === true || settings.hide_cancelled === "true",
        timezone: where?.timezone ?? "Europe/Rome",
      },
      now,
    );
  }

  const limit = Math.max(1, Math.min(12, Number(settings.limit ?? 5)));
  const lead = Math.max(0, Number(settings.lead_time ?? 0));
  const hideCancelled = settings.hide_cancelled === true || settings.hide_cancelled === "true";
  const platforms = chosen.capabilities.includes("platforms");

  const seed = seedOf(origin + destination + providerCode);
  const minutes = now.getHours() * 60 + now.getMinutes();

  // A train every few minutes, offset by the route, first one soon.
  const spacing = 9 + (seed % 8);
  const first = ((minutes + seed) % spacing) + 2;

  const departures: Departure[] = [];

  for (let index = 0; index < limit + 3; index += 1) {
    const away = first + index * spacing;

    // Someone standing at the platform cannot catch a train they cannot reach.
    if (away < lead) continue;

    const delay = (seed + index * 7 + minutes) % 11 === 0 ? 3 + ((seed + index) % 6) : 0;
    const cancelled = (seed + index * 13 + minutes) % 47 === 0;
    if (cancelled && hideCancelled) continue;

    const travel = 22 + ((seed + index) % 18);

    departures.push({
      line: LINES[(seed + index) % LINES.length],
      number: String(20_000 + ((seed * 7 + index * 13) % 9000)),
      direction: destination || ["Como Lago", "Saronno", "Varese", "Bergamo"][(seed + index) % 4],
      scheduled: clock(now, away - delay),
      expected: clock(now, away),
      minutes_until: away,
      delay,
      delayed: delay > 0,
      platform: platforms ? String(1 + ((seed + index) % 8)) : "",
      arrival: clock(now, away + travel),
      duration: travel,
      changes: destination && (seed + index) % 5 === 0 ? 1 : 0,
      direct: !(destination && (seed + index) % 5 === 0),
      cancelled,
      live: true,
      status: cancelled ? "CANCELLED" : delay > 0 ? "DELAYED" : "ON TIME",
    });

    if (departures.length >= limit) break;
  }

  // An alert now and then, because a board that never has one is a board whose
  // alert strip nobody ever sees.
  const alerts =
    chosen.capabilities.includes("alerts") && (seed + Math.floor(minutes / 37)) % 4 === 0
      ? [{ title: "Reduced service", detail: `Engineering work near ${origin}.` }]
      : [];

  return {
    transit: {
      origin,
      destination,
      provider: providerCode,
      provider_label: chosen.label,
      city: cityCode,
      country: countryCode,
      mocked: chosen.mocked,
      empty: departures.length === 0,
      departures,
      alerts,
      alert: alerts[0]?.title ?? "",
    },
  };
}
