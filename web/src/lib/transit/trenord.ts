/**
 * Trenord's station registry.
 *
 * A few hundred stations that change about never, fetched once and searched in
 * memory. Searching remotely on every keystroke would be slower, ruder to
 * Trenord, and no more correct.
 *
 * The endpoint is unauthenticated but sits behind Akamai, so the browser-ish
 * headers stay.
 */
export interface Station {
  code: string;
  name: string;
  town: string;
  province: string;
}

const REGISTRY = "https://www.trenord.it/mia/v2/stazioni_v2/";

const PARAMS = new URLSearchParams({
  _p: "NomeGeoStazioni,CodiceMIR,Comune,Regione,country,platforms,MetaStazione",
  _s: "NomeGeoStazioni",
  ignore_during_search: "false",
});

interface Raw {
  CodiceMIR?: string;
  NomeGeoStazioni?: string;
  Comune?: string;
  Prov?: string;
}

let cached: { at: number; stations: Station[] } | undefined;
let loading: Promise<Station[]> | undefined;

const DAY = 24 * 60 * 60 * 1000;

/** Title case, because the registry shouts: "MILANO CADORNA". */
const titled = (value: string) =>
  value
    .toLowerCase()
    .replace(/(^|[\s'\-/.])([a-zà-ÿ])/g, (_match, before, letter) => before + letter.toUpperCase());

async function load(): Promise<Station[]> {
  const response = await fetch(`${REGISTRY}?${PARAMS}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Dither/1.0; +https://github.com/kayraucklnc/dither)",
      "Accept-Language": "it",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`Trenord answered ${response.status} for its station list.`);

  const raw = (await response.json()) as Raw[];

  return raw
    .filter((entry) => entry.NomeGeoStazioni && entry.CodiceMIR)
    .map((entry) => ({
      code: String(entry.CodiceMIR),
      name: titled(String(entry.NomeGeoStazioni)),
      town: titled(String(entry.Comune ?? "")),
      province: String(entry.Prov ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function stations(): Promise<Station[]> {
  if (cached && Date.now() - cached.at < DAY) return cached.stations;

  // Concurrent callers share one fetch rather than each pulling 300KB.
  loading ??= load()
    .then((list) => {
      cached = { at: Date.now(), stations: list };
      loading = undefined;
      return list;
    })
    .catch((error) => {
      loading = undefined;
      // A dead registry should leave the last good list in place.
      if (cached) return cached.stations;
      throw error;
    });

  return loading;
}

export async function search(query: string, limit = 20): Promise<Station[]> {
  const all = await stations();
  const needle = query.trim().toLowerCase();

  if (!needle) return all.slice(0, limit);

  // Matches at the start of a name first: typing "mil" should reach Milano
  // before Sesto San Giovanni Milano.
  const starts: Station[] = [];
  const contains: Station[] = [];

  for (const station of all) {
    const name = station.name.toLowerCase();
    if (name.startsWith(needle)) starts.push(station);
    else if (name.includes(needle) || station.town.toLowerCase().includes(needle)) {
      contains.push(station);
    }

    if (starts.length >= limit) break;
  }

  return [...starts, ...contains].slice(0, limit);
}
