import { calendars } from "@/lib/connections/google/api";
import { feedValue } from "@/lib/connections/google/feeds";
import { readyAccounts } from "@/lib/connections/link";
import { provider } from "@/lib/connections";
import { collections, pictures } from "@/lib/gallery/library";
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
    /**
     * Every calendar on every linked Google account.
     *
     * A calendar's id is an address - `en.uk#holiday@group.v.calendar.google.com`
     * or the address of whoever shared it with you - so listing them is the
     * difference between picking "Work" and remembering that. With two
     * accounts linked the value carries the account too, because "primary" is
     * a calendar on both of them; the account shows as the hint, so two
     * calendars both called "Family" can be told apart.
     */
    id: "google.calendars",
    async list() {
      const google = provider("google");
      if (!google) return [];

      const accounts = await readyAccounts("google");
      const linked = accounts.filter((one) => google.handshake!.complete(one.credentials));

      if (!linked.length) {
        throw new Error("Link a Google account under Connections to choose a calendar.");
      }

      const perAccount = await Promise.all(
        linked.map(async (account) => {
          try {
            return { account, found: await calendars(account.credentials) };
          } catch {
            // One account being unreachable should leave the others pickable.
            // The calendars already chosen on it still work.
            return { account, found: [] };
          }
        }),
      );

      const several = linked.length > 1;

      return perAccount.flatMap(({ account, found }) => [
        {
          value: feedValue(account.account, "primary"),
          label: several ? `Primary — ${account.account}` : "Primary",
          hint: several ? "" : account.account,
        },
        ...found
          .filter((one) => !one.primary)
          .map((one) => ({
            value: feedValue(account.account, one.id),
            label: one.summaryOverride?.trim() || one.summary?.trim() || one.id,
            hint: several ? account.account : one.accessRole === "owner" ? "" : "shared",
          })),
      ]);
    },
  },
  {
    /**
     * The folders of pictures in the gallery directory.
     *
     * There is no upload and no album table - a collection is a directory, so
     * this is a `readdir` and nothing else. Listing them is what makes the
     * bargain visible: put a folder of jpegs on disk, open the inspector, and
     * it is in the menu.
     */
    id: "gallery.collections",
    async list() {
      const found = await collections();

      if (!found.length) {
        throw new Error(
          "There are no pictures yet. Put some in the gallery folder - see docs/gallery.md.",
        );
      }

      const pictures = (count: number) => `${count} picture${count === 1 ? "" : "s"}`;
      const everything = found.reduce((total, one) => total + one.count, 0);

      return [
        { value: "", label: "Everything", hint: pictures(everything) },
        ...found.map((one) => ({ value: one.id, label: one.label, hint: pictures(one.count) })),
      ];
    },
  },
  {
    /** The pictures in the chosen collection, for pinning one of them. */
    id: "gallery.pictures",
    dependsOn: ["collection", "orientation"],
    async list(settings) {
      const held = await pictures(String(settings.collection ?? "") || undefined);
      const shape = String(settings.orientation ?? "any");

      // Narrowed the same way the widget will narrow it. Offering a portrait
      // to a widget set to landscape-only is offering a choice that silently
      // does nothing.
      const usable = shape === "any" ? held : held.filter((one) => one.orientation === shape);

      return usable.map((one, index) => ({
        value: one.id,
        label: one.title || `Untitled ${index + 1}`,
        hint: one.width ? `${one.width}×${one.height} ${one.orientation}` : one.collection,
      }));
    },
  },
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
