import { decrypt } from "./cipher";

/**
 * Trenord's unauthenticated backend-for-frontend.
 *
 * Two endpoints, two shapes. The journey planner answers AES encrypted bytes;
 * the station registry answers plain JSON. Neither needs a token, but both sit
 * behind Akamai, so the browser-ish headers stay.
 */
const JOURNEYS = "https://www.trenord.it/mia/bff/hafas/v2";

const DEFAULTS = { products: "tickets", live_data: "true", with_routes: "true" };

const USER_AGENT =
  "Mozilla/5.0 (compatible; Dither/1.0; +https://github.com/kayraucklnc/dither)";

export function headers(language: string): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    Referer: "https://www.trenord.it/store/",
    "User-Agent": USER_AGENT,
    "X-3N-Language": language,
  };
}

export interface JourneyQuery {
  origin: string;
  destination: string;
  /** Local wall clock at the origin, already shifted into the station's zone. */
  departsAt: Date;
  transfers: number;
  language: string;
}

const stamp = (at: Date) =>
  `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;

const hour = (at: Date) =>
  `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

export interface JourneyPayload {
  solutions?: unknown[];
  hafas_alerts?: unknown[];
}

export async function journeys(query: JourneyQuery): Promise<JourneyPayload> {
  const params = new URLSearchParams({
    orig: query.origin,
    dest: query.destination,
    departure_date: stamp(query.departsAt),
    departure_hour: hour(query.departsAt),
    transfers: String(query.transfers),
    language: query.language,
    ...DEFAULTS,
  });

  const response = await fetch(`${JOURNEYS}?${params}`, {
    headers: headers(query.language),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Trenord answered ${response.status} for its journey planner.`);
  }

  // The body is ciphertext, not text: read the bytes.
  return decrypt(Buffer.from(await response.arrayBuffer())) as JourneyPayload;
}
