/**
 * Which places and operators Dither can answer for.
 *
 * Adding a city is an entry here plus a provider beside it. Nothing else knows
 * about Milan - not the extension, not the settings form, not the dashboard.
 *
 * Capabilities matter because operators differ. A journey planner takes a
 * destination; a departure board does not. A field that asks for something the
 * chosen operator cannot use is worse than a missing field, because it looks
 * like it works.
 */
export type Capability =
  | "journey"            // from *and* to; otherwise it is a board from one stop
  | "searchable_stations"
  | "platforms"
  | "alerts"
  | "live_delays";

export interface Provider {
  code: string;
  label: string;
  mode: string;
  description: string;
  capabilities: Capability[];
  /** Answering with stand-in data until the real client is ported. */
  mocked: boolean;
}

export interface City {
  code: string;
  label: string;
  timezone: string;
  providers: Provider[];
}

export interface Country {
  code: string;
  label: string;
  cities: City[];
}

export const COUNTRIES: Country[] = [
  {
    code: "it",
    label: "Italy",
    cities: [
      {
        code: "milan",
        label: "Milan",
        timezone: "Europe/Rome",
        providers: [
          {
            code: "trenord",
            label: "Trenord",
            mode: "rail",
            description: "Regional and suburban trains across Lombardy.",
            capabilities: ["journey", "searchable_stations", "platforms", "alerts", "live_delays"],
            mocked: false,
          },
          {
            code: "atm",
            label: "ATM",
            mode: "metro",
            description: "Milan's metro, trams and buses.",
            // A metro board is a stop, not a journey: no destination, no platform.
            capabilities: ["searchable_stations", "live_delays"],
            mocked: true,
          },
        ],
      },
    ],
  },
];

export const countries = () => COUNTRIES;

export const country = (code: string) => COUNTRIES.find((entry) => entry.code === code);

export const cities = (countryCode: string) => country(countryCode)?.cities ?? [];

export const city = (countryCode: string, cityCode: string) =>
  cities(countryCode).find((entry) => entry.code === cityCode);

export const providers = (countryCode: string, cityCode: string) =>
  city(countryCode, cityCode)?.providers ?? [];

export const provider = (countryCode: string, cityCode: string, providerCode: string) =>
  providers(countryCode, cityCode).find((entry) => entry.code === providerCode);

/** What the chosen operator can do, so the form can hide what it cannot. */
export function capabilitiesFor(settings: Record<string, unknown>): Capability[] {
  const chosen = provider(
    String(settings.country ?? ""),
    String(settings.city ?? ""),
    String(settings.provider ?? ""),
  );

  return chosen?.capabilities ?? [];
}
