import { capabilitiesFor, cities, countries, providers } from "@/lib/transit/catalog";
import { search as searchStations } from "@/lib/transit/trenord";

/**
 * Where a settings field gets its choices from.
 *
 * A field can name a source here instead of listing options in its manifest.
 * That matters for anything the code already knows: which countries are
 * supported, which operators answer for a city, which stations exist. Typing
 * a station code from memory is not a settings form, it is a quiz.
 *
 * Sources are keyed by string so adding one is an entry here and a `options_from`
 * in a manifest - no dashboard change, which is the same bargain the rest of
 * the extension format makes.
 */
export interface Choice {
  value: string;
  label: string;
  hint?: string;
}

export interface Source {
  id: string;
  /** Settings keys whose values narrow this list; the form refetches when they change. */
  dependsOn?: string[];
  /** True when it expects to be typed into rather than opened. */
  searchable?: boolean;
  list(settings: Record<string, unknown>, query: string): Promise<Choice[]>;
}

const SOURCES: Source[] = [
  {
    id: "transit.countries",
    async list() {
      return countries().map((country) => ({ value: country.code, label: country.label }));
    },
  },
  {
    id: "transit.cities",
    dependsOn: ["country"],
    async list(settings) {
      return cities(String(settings.country ?? "")).map((city) => ({
        value: city.code,
        label: city.label,
        hint: city.timezone,
      }));
    },
  },
  {
    id: "transit.providers",
    dependsOn: ["country", "city"],
    async list(settings) {
      return providers(String(settings.country ?? ""), String(settings.city ?? "")).map(
        (provider) => ({
          value: provider.code,
          label: provider.label,
          hint: provider.description,
        }),
      );
    },
  },
  {
    id: "transit.stations",
    dependsOn: ["country", "city", "provider"],
    searchable: true,
    async list(settings, query) {
      // Only Trenord has a station registry so far. Another operator that does
      // is a branch here and nothing else.
      if (settings.provider !== "trenord") return [];

      return (await searchStations(query, 20)).map((station) => ({
        value: station.name,
        label: station.name,
        hint: station.town && station.town !== station.name ? station.town : station.code,
      }));
    },
  },
];

const BY_ID = new Map(SOURCES.map((source) => [source.id, source]));

export function source(id: string): Source | undefined {
  return BY_ID.get(id);
}

/**
 * What the current settings can do, so the form can hide fields the chosen
 * operator would ignore. A metro board has no destination and no platform.
 */
const CAPABILITIES: Record<string, (settings: Record<string, unknown>) => string[]> = {
  "transit.capabilities": (settings) => capabilitiesFor(settings),
};

export function capabilities(id: string, settings: Record<string, unknown>): string[] {
  return CAPABILITIES[id]?.(settings) ?? [];
}
