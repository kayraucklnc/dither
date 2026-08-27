import { between, clockOf, duration, minutesUntil, shift } from "@/lib/transit/clock";
import { offsetMinutes } from "@/lib/settings";
import { journeys, type JourneyPayload } from "./client";

/**
 * Turning Trenord's journey planner into a departure board.
 *
 * Trenord ships two different stop vocabularies. Trains with live data carry
 * their whole run, with platforms and actual times; trains without it carry
 * only the legs of your journey, with neither. Both are matched on station
 * code, because position in the list is not reliable.
 */

export interface TrenordSettings {
  origin: string;
  destination: string;
  limit: number;
  leadTime: number;
  transfers: number;
  language: string;
  hideCancelled: boolean;
  timezone: string;
}

type Bag = Record<string, unknown>;

const bag = (value: unknown): Bag =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Bag) : {};

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const text = (value: unknown): string => {
  const stripped = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#3[49];/g, "'");

  return stripped.replace(/\s+/g, " ").trim();
};

/**
 * A Date whose *local* fields read as the wall clock at the station.
 *
 * Operators quote local times and a self-hosted server usually runs somewhere
 * else. Asking Trenord for "21:28" from a box in Istanbul silently returns
 * trains from two hours ago.
 */
export function zoned(at: Date, timezone: string): Date {
  return new Date(at.getTime() + (offsetMinutes(timezone, at) + at.getTimezoneOffset()) * 60_000);
}

/**
 * The stop a journey actually starts from.
 *
 * A train carrying live data ships its whole run, so the stop you board at can
 * be anywhere in the list.
 */
function originStop(solution: Bag): Bag {
  const leg = bag(list(solution.journey_list)[0]);
  const stops = list(leg.pass_list);
  const code = bag(bag(solution.dep_station)).station_id;

  return bag(stops.find((stop) => bag(bag(stop).station).station_id === code) ?? stops[0]);
}

export interface Departure {
  line: string;
  number: string;
  direction: string;
  scheduled: string;
  expected: string;
  minutes_until: number | null;
  delay: number;
  delayed: boolean;
  platform: string;
  platform_actual: boolean;
  arrival: string;
  duration: string;
  changes: number;
  direct: boolean;
  cancelled: boolean;
  live: boolean;
  day_offset: number;
  status: string;
  /** When it leaves, so a rule can be exact however stale the answer is. */
  departs_iso: string;
}

/**
 * One solution, one departure - or nothing, when the train is not worth
 * showing: no legs at all, or already gone by the time the board is read.
 */
export function departureFrom(
  solution: Bag,
  settings: TrenordSettings,
  now: Date,
): Departure | null {
  if (!list(solution.journey_list).length) return null;

  const stop = originStop(solution);
  const iso = String(stop.dep_date_time ?? "");
  const leaves = iso ? new Date(iso) : undefined;

  // HAFAS likes to include the train that just left. Nobody can catch it, and
  // lead time exists precisely to say how much earlier than that a board stops
  // being useful.
  const cutoff = new Date(now.getTime() + settings.leadTime * 60_000);
  if (leaves && !Number.isNaN(leaves.getTime()) && leaves < cutoff) return null;

  const train = bag(bag(list(solution.journey_list)[0]).train);
  const live = bag(stop.actual_data);

  const scheduled = clockOf(solution.dep_time) ?? "";
  const reported = Number(solution.delay ?? train.delay ?? 0) || 0;

  // Trenord publishes an actual time once a train is running and an estimate
  // before that. Either beats adding the delay by hand.
  const actual = clockOf(live.dep_actual_time) ?? clockOf(live.dep_estimated_time);
  const expected = actual ?? (reported === 0 ? scheduled : shift(scheduled, reported));

  // A train can carry an estimated time without a reported delay. The board
  // would then show a later clock while claiming to be on time.
  const delay =
    reported > 0 ? reported : scheduled && expected ? between(scheduled, expected) : 0;

  // Trenord's own day offset is relative to the solution's date, not to the day
  // the board is being read on. Counting calendar days in the station's zone is
  // the only reading that survives a query made just before midnight.
  const dayOffset =
    leaves && !Number.isNaN(leaves.getTime())
      ? Math.round(
          (zoned(leaves, settings.timezone).setHours(0, 0, 0, 0) -
            zoned(now, settings.timezone).setHours(0, 0, 0, 0)) /
            86_400_000,
        )
      : 0;

  const cancelled = solution.cancelled === true || train.status === "S";
  const changes = Number(solution.change ?? 0) || 0;

  return {
    line: String(train.line ?? train.train_category ?? ""),
    number: String(train.train_name ?? train.train_id ?? ""),
    direction: String(train.direction ?? ""),
    scheduled,
    expected,
    minutes_until: minutesUntil(expected, zoned(now, settings.timezone), dayOffset),
    delay,
    delayed: delay > 0,
    platform: String(stop.platform ?? "").trim(),
    platform_actual: stop.is_actual_platform === true,
    arrival: clockOf(solution.arr_time) ?? "",
    duration: duration(solution.duration) ?? "",
    changes,
    direct: changes === 0,
    cancelled,
    live: train.has_live_info === true,
    day_offset: dayOffset,
    status: cancelled ? "CANCELLED" : delay > 0 ? "DELAYED" : train.has_live_info ? "ON TIME" : "SCHEDULED",
    departs_iso: iso,
  };
}

function stationName(solutions: unknown[], key: string, fallback: string): string {
  for (const solution of solutions) {
    const name = bag(bag(solution)[key]).station_ori_name;
    if (name) return String(name);
  }

  return fallback;
}

function alerts(payload: JourneyPayload, language: string) {
  return list(payload.hafas_alerts).map((raw) => {
    const alert = bag(raw);

    return {
      severity: String(alert.severity ?? "INFO"),
      title: text(alert[`title_${language}`] ?? alert.title_en),
      message: text(alert[`message_${language}`] ?? alert.message_en),
    };
  });
}

/**
 * The planner answers roughly five journeys per call, so a board asking for
 * more has to walk forward in time. Each page starts a minute after the last
 * journey it saw, and the walk stops as soon as there is enough. A
 * default-sized board never pages.
 */
const MAX_PAGES = 4;

function nextMoment(payload: JourneyPayload, from: Date): Date | undefined {
  const last = bag(list(payload.solutions).at(-1));
  if (!Object.keys(last).length) return undefined;

  const iso = String(originStop(last).dep_date_time ?? "");
  if (!iso) return undefined;

  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return undefined;

  const following = new Date(at.getTime() + 60_000);
  return following > from ? following : undefined;
}

/** Journeys repeat across pages, so identity is the train and when it runs. */
function signature(solution: unknown): string {
  const one = bag(solution);
  const trains = list(one.journey_list).map((leg) => bag(bag(leg).train).train_name);

  return JSON.stringify([one.date, one.dep_time, trains]);
}

export async function trenordBoard(
  settings: TrenordSettings,
  now = new Date(),
): Promise<Record<string, unknown>> {
  if (!settings.origin) throw new Error("Choose a station to depart from.");
  if (!settings.destination) {
    // The journey planner is a planner: it needs somewhere to plan to. A
    // stop-board without a destination is a different endpoint we have not
    // ported, and saying so beats an empty screen with no explanation.
    throw new Error(
      "Trenord's planner needs a destination as well as an origin. Choose one under To.",
    );
  }

  const start = zoned(new Date(now.getTime() + settings.leadTime * 60_000), settings.timezone);
  const pages: JourneyPayload[] = [];
  const seen = new Set<string>();
  const solutions: unknown[] = [];

  let at = start;
  let departures: Departure[] = [];

  const usable = () =>
    solutions
      .map((solution) => departureFrom(bag(solution), settings, now))
      .filter((one): one is Departure => one !== null)
      .filter((one) => !(settings.hideCancelled && one.cancelled));

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await journeys({
      origin: settings.origin,
      destination: settings.destination,
      departsAt: at,
      transfers: settings.transfers,
      language: settings.language,
    });

    pages.push(payload);

    // Journeys repeat across pages, so identity is the train and when it runs.
    for (const solution of list(payload.solutions)) {
      const key = signature(solution);
      if (seen.has(key)) continue;

      seen.add(key);
      solutions.push(solution);
    }

    // Count what *survives* - the trains that have already gone, and the
    // cancelled ones when they are hidden, do not fill the board. Counting raw
    // solutions stops early and leaves a board short of what was asked for.
    departures = usable();
    if (departures.length >= settings.limit) break;

    const following = nextMoment(payload, at);
    if (!following) break;

    at = zoned(following, settings.timezone);
  }

  departures = departures.slice(0, settings.limit);

  const said = alerts(pages[0] ?? {}, settings.language);
  const local = zoned(now, settings.timezone);

  return {
    transit: {
      origin: stationName(solutions, "dep_station", settings.origin),
      destination: stationName(solutions, "arr_station", settings.destination),
      provider: "trenord",
      provider_label: "Trenord",
      city: "milan",
      country: "it",
      mocked: false,
      empty: departures.length === 0,
      queried_at: `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`,
      departures,
      alerts: said,
      alert: said[0]?.title ?? "",
    },
  };
}
