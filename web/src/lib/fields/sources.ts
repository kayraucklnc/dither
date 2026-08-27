import { calendars } from "@/lib/connections/google/api";
import { feedValue } from "@/lib/connections/google/feeds";
import { readyAccounts } from "@/lib/connections/link";
import { OWN_CURRENCY } from "@/lib/connections/stripe/reading";
import { provider } from "@/lib/connections";
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
     * Every Stripe account linked, so a widget can name one - or leave them
     * all ticked and see the total.
     *
     * The value is the account's own id rather than anything this side made
     * up, because that is what the connection is filed under and what survives
     * the same key being pasted again.
     */
    id: "stripe.accounts",
    async list() {
      const accounts = await readyAccounts("stripe");

      if (!accounts.length) {
        throw new Error("Add a Stripe key under Connections to choose an account.");
      }

      return accounts.map((account) => ({
        value: account.account,
        label: account.label || account.account,
        hint: account.account,
      }));
    },
  },
  {
    /**
     * What to show the money in.
     *
     * The account's own comes first and is the default, because that is the
     * figure Stripe would show you and the one that needs no rate behind it.
     * Everything after it is every currency this runtime knows the name of,
     * which is more than Stripe settles in and costs nothing to offer - a
     * rate exists or it does not, and the fetch says so either way.
     */
    id: "money.currencies",
    searchable: true,
    async list(_settings, query) {
      const names = new Intl.DisplayNames(["en"], { type: "currency" });
      const wanted = query.trim().toLowerCase();

      const own = { value: OWN_CURRENCY, label: "The account's own", hint: "No conversion" };

      const all = Intl.supportedValuesOf("currency").map((code) => ({
        value: code.toLowerCase(),
        label: code,
        hint: names.of(code) ?? "",
      }));

      // The handful anybody is likely to want, before three hundred they are
      // not - a list this long is only usable if the top of it is a shortlist.
      const common = ["usd", "eur", "gbp", "jpy", "aud", "cad", "chf", "sek", "inr", "try"];
      const ranked = [
        ...common.map((code) => all.find((one) => one.value === code)).filter(Boolean),
        ...all.filter((one) => !common.includes(one.value)),
      ] as Choice[];

      const matches = (choice: Choice) =>
        !wanted ||
        choice.value.includes(wanted) ||
        choice.label.toLowerCase().includes(wanted) ||
        (choice.hint ?? "").toLowerCase().includes(wanted);

      return [own, ...ranked].filter(matches);
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
