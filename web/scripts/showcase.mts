/*
 * One device, set up the way somebody would really set one up.
 *
 * `seed.mts` proves the model works: a device, four screens, a tree with three
 * questions in it. This is the other thing you want from a fixture - what a
 * panel looks like after a month of living with it. Six screens that each earn
 * their place, widgets that use the *styles* rather than accepting whatever
 * fits, a rule set deep enough that priority-is-depth means something, and the
 * notices that ride on top of all of it.
 *
 * It is additive on purpose. It removes its own device and its own screens and
 * leaves everything else in the database alone, so running it does not cost you
 * whatever you were in the middle of.
 *
 *   npx tsx --env-file=.env.local scripts/showcase.mts
 */

import { eq, inArray } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  decisionNodes,
  devices,
  models,
  notices,
  screens,
  triggers,
  widgets,
} from "../src/lib/db/schema";
import { refreshTrigger } from "../src/lib/extensions/fetcher";
import { layout } from "../src/lib/flow/layout";
import { CLOCK_SOURCE, DEVICE_SOURCE } from "../src/lib/flow/sources";
import type { Node } from "../src/lib/flow/tree";

const DEVICE_NAME = "Hallway";
const MAC = "DE:5C:0F:11:AA:01";

/* -- the questions, asked once each ---------------------------------------- */

/*
 * A widget and a source configured identically share one answer, so these
 * objects are used for both. Change one and the pair stops sharing - which is
 * the failure this shape exists to make impossible to write by accident.
 */

const TRANSIT = {
  country: "it",
  city: "milan",
  provider: "trenord",
  origin: "Milano Certosa",
  destination: "Pioltello Limito",
  lead_time: 4,
  limit: 6,
  show_platform: true,
  hide_cancelled: false,
};

const WEATHER = {
  place: "Milan",
  latitude: "45.4642",
  longitude: "9.19",
  units: "celsius",
  style: "rich",
  show_hours: 12,
};

/** Both accounts, merged. Sorted, because the settings are hashed into a key. */
const CALENDARS = ["kayra@ratel.sh|primary", "kayraucklnc@gmail.com|primary"].sort();

const CALENDAR_TODAY = {
  calendar: CALENDARS,
  range: "today",
  horizon_hours: 12,
  hide_declined: true,
};

const REVENUE = { metric: "taken", window: "today", basis: "forecast" };

/* -- helpers --------------------------------------------------------------- */

type Placement = {
  extension: string;
  label: string;
  settings: Record<string, unknown>;
  design?: string;
  at: [column: number, row: number, columns: number, rows: number];
  hostsNotices?: boolean;
};

const screenNamed = async (name: string, description: string, placements: Placement[]) => {
  const [screen] = await db.insert(screens).values({ name, description }).returning();

  await db.insert(widgets).values(
    placements.map((one) => ({
      screenId: screen.id,
      extension: one.extension,
      label: one.label,
      settings: one.settings,
      design: one.design ?? "",
      column: one.at[0],
      row: one.at[1],
      columnSpan: one.at[2],
      rowSpan: one.at[3],
      hostsNotices: one.hostsNotices ?? false,
    })),
  );

  return screen;
};

/* -- clear out a previous run ---------------------------------------------- */

const SCREEN_NAMES = [
  "The day",
  "Leaving now",
  "What is next",
  "Wet weather",
  "The business",
  "Overnight",
];

const [panel] = await db.select().from(models).where(eq(models.name, "og_plus"));
if (!panel) throw new Error("No og_plus model. Load scripts/models.sql first.");

const [existing] = await db.select().from(devices).where(eq(devices.macAddress, MAC));
if (existing) {
  // Nodes, notices and logs are cascaded by the device; the screens are not,
  // because a screen belongs to nobody.
  await db.delete(devices).where(eq(devices.id, existing.id));
}

/*
 * The screens this fixture made last time - and only those.
 *
 * Matching on the name alone is not safe: `seed.mts` also calls one of its
 * screens "Leaving now" and another "Wet weather", and a leaf on another
 * device points at each. A screen deleted out from under a leaf does not take
 * the leaf with it - `screenId` is `on delete set null` - so that device keeps
 * a rule that lands on nothing, which is the worst of both endings. A screen
 * goes only if it carries one of our names *and* no tree outside this fixture
 * refers to it.
 */
const named = await db.select().from(screens).where(inArray(screens.name, SCREEN_NAMES));

if (named.length) {
  const shown = new Set(
    (await db.select().from(decisionNodes))
      .map((node) => node.screenId)
      .filter((id): id is number => id !== null),
  );

  const ours = named.filter((one) => !shown.has(one.id));
  const kept = named.length - ours.length;

  if (ours.length) await db.delete(screens).where(inArray(screens.id, ours.map((one) => one.id)));
  if (kept) console.log(`  left ${kept} screen${kept === 1 ? "" : "s"} alone - another device shows them`);
}

/*
 * The sources this fixture made last time, and nothing else has claimed.
 *
 * Sources belong to nobody, which is the whole point of them - so deleting the
 * device cannot take them with it, and three runs of this script would
 * otherwise leave twelve identical entries in the sources list. Matching on the
 * label alone is not enough either: `seed.mts` also calls one "Milan weather",
 * and a check on another device reads from it. So a source goes only if it
 * carries one of our names *and* nothing that is left refers to it.
 */
const SOURCE_LABELS = ["Certosa departures", "Milan weather", "My day", "Stripe"];

const sourceIdsIn = (condition: unknown, found: Set<string>): Set<string> => {
  if (!condition || typeof condition !== "object") return found;
  const node = condition as Record<string, unknown>;

  if (node.kind === "fact" && typeof node.sourceId === "string") found.add(node.sourceId);
  if (Array.isArray(node.conditions)) node.conditions.forEach((one) => sourceIdsIn(one, found));

  return found;
};

const spokenFor = new Set<string>();
for (const node of await db.select().from(decisionNodes)) sourceIdsIn(node.condition, spokenFor);
for (const rule of await db.select().from(notices)) sourceIdsIn(rule.condition, spokenFor);

const orphans = (
  await db.select().from(triggers).where(inArray(triggers.label, SOURCE_LABELS))
).filter((one) => !spokenFor.has(String(one.id)));

if (orphans.length) {
  await db.delete(triggers).where(
    inArray(triggers.id, orphans.map((one) => one.id)),
  );
  console.log(`  swept ${orphans.length} unused source${orphans.length === 1 ? "" : "s"} from a previous run`);
}

/* -- the screens ------------------------------------------------------------
 *
 * Six, and each one answers a different question about the day. Sizes are free
 * on a 12x12 grid; what is not free is the design, so every widget below sits
 * inside a range some template actually declared.
 */

/*
 * The default. A shallow calendar band across the top so the day is legible
 * from the doorway, the departure board where your eye goes next, and the
 * weather and a clock filling the right.
 */
const day = await screenNamed(
  "The day",
  "The one it shows most of the time: the day across the top, trains, weather, a clock.",
  [
    {
      extension: "google_calendar",
      label: "Today, in a band",
      design: "band",
      settings: { ...CALENDAR_TODAY, heading: "", day_start: "07:30", day_end: "20:00" },
      at: [1, 1, 12, 3],
    },
    {
      extension: "public_transport",
      label: "Certosa to Pioltello",
      // A short heading, because five columns is 333px and the route's own
      // name does not fit. It costs nothing: the heading is presentational, so
      // this board and the full-width one below are still one question.
      settings: { ...TRANSIT, heading: "Certosa" },
      at: [1, 4, 5, 9],
      // Pinned: a transit alert belongs on the board, and the board is the
      // widest thing here with room for one.
      hostsNotices: true,
    },
    {
      extension: "weather",
      label: "Milan",
      settings: WEATHER,
      at: [6, 4, 4, 9],
    },
    {
      extension: "clock",
      label: "The time",
      design: "column",
      settings: { heading: "", twenty_four_hour: true, show_date: true, show_window: true },
      at: [10, 4, 3, 9],
    },
  ],
);

/*
 * A train is close. The board takes two thirds of the panel and everything
 * else shrinks to what you would still glance at on the way out of the door.
 */
const leaving = await screenNamed(
  "Leaving now",
  "A train is worth running for. The board, big, and only what you would still read on the way out.",
  [
    {
      extension: "public_transport",
      label: "Certosa to Pioltello",
      settings: { ...TRANSIT, heading: "" },
      at: [1, 1, 8, 12],
      hostsNotices: true,
    },
    {
      extension: "clock",
      label: "The time",
      design: "digital",
      settings: { heading: "", twenty_four_hour: true, show_date: false },
      at: [9, 1, 4, 5],
    },
    {
      extension: "weather",
      label: "Outside",
      settings: WEATHER,
      at: [9, 6, 4, 7],
    },
  ],
);

/*
 * Two calendar widgets, same extension, different settings and different
 * designs. This is the distinction the whole model turns on: "what is next"
 * wants the next hours, the agenda beside it wants the whole day and keeps
 * what has already happened, struck through.
 */
const next = await screenNamed(
  "What is next",
  "One meeting large, the rest of the day listed beside it. Two widgets of one extension.",
  [
    {
      extension: "google_calendar",
      label: "What is next",
      design: "next",
      settings: {
        calendar: CALENDARS,
        range: "hours",
        horizon_hours: 12,
        hide_declined: true,
        heading: "",
        show_location: true,
      },
      at: [1, 1, 7, 8],
      hostsNotices: true,
    },
    {
      extension: "google_calendar",
      label: "The rest of the week",
      design: "agenda",
      // A genuinely different question from the widget beside it, not a
      // restyling of the same one: "what is next" reaches twelve hours, this
      // reaches Sunday. Two placements of one extension, two fetches, and that
      // is correct - the alternative is a column that is empty every clear
      // afternoon.
      settings: {
        calendar: CALENDARS,
        range: "week",
        horizon_hours: 12,
        hide_declined: true,
        heading: "This week",
        show_location: false,
        show_done: false,
        show_gaps: true,
      },
      at: [8, 1, 5, 12],
    },
    {
      extension: "clock",
      label: "How much day is left",
      design: "band",
      settings: { heading: "", show_window: true, day_start: "07:30", day_end: "23:00" },
      at: [1, 9, 7, 4],
    },
  ],
);

/*
 * Raining. The forecast takes the left; the arc and the next meeting fill the
 * right, because "it is raining" does not stop being a day with things in it.
 */
const wet = await screenNamed(
  "Wet weather",
  "The forecast, large, with the shape of the day and the next thing on it beside.",
  [
    {
      extension: "weather",
      label: "Milan",
      settings: WEATHER,
      at: [1, 1, 8, 12],
      hostsNotices: true,
    },
    {
      extension: "clock",
      label: "The day",
      design: "arc",
      settings: { heading: "", show_window: true, day_start: "07:30", day_end: "23:00" },
      at: [9, 1, 4, 7],
    },
    {
      extension: "google_calendar",
      label: "What is next",
      design: "next",
      settings: { ...CALENDAR_TODAY, heading: "", show_location: false },
      at: [9, 8, 4, 5],
    },
  ],
);

/*
 * Four revenue widgets and one trip to Stripe.
 *
 * Every field the revenue extension declares is presentational, so all four of
 * these ask the same question and share one answer. Four figures on a screen
 * that cost four API calls would be the bug; this screen is the proof it is
 * not happening.
 */
const business = await screenNamed(
  "The business",
  "A month of trading, the recurring figures beside it, and the windows along the bottom. One Stripe call.",
  [
    {
      extension: "revenue",
      label: "Taken this month",
      design: "graph",
      settings: {
        ...REVENUE,
        window: "month_to_date",
        heading: "",
        compare: true,
        compact_figures: true,
        chart: "month",
        line_style: "area",
        axis: true,
      },
      at: [1, 1, 8, 8],
      hostsNotices: true,
    },
    {
      extension: "revenue",
      label: "Recurring",
      design: "figure",
      settings: { ...REVENUE, metric: "mrr", heading: "MRR", compare: true, compact_figures: true },
      at: [9, 1, 4, 4],
    },
    {
      extension: "revenue",
      label: "Subscribers",
      design: "figure",
      settings: {
        ...REVENUE,
        metric: "subscribers",
        heading: "Subscribers",
        compare: true,
        compact_figures: false,
      },
      at: [9, 5, 4, 4],
    },
    {
      extension: "revenue",
      label: "The windows",
      design: "strip",
      settings: { ...REVENUE, heading: "", compare: true, compact_figures: true },
      at: [1, 9, 12, 4],
    },
  ],
);

/*
 * Overnight. Nothing here is precise, because nothing needs to be at 3am and a
 * face that claims a minute it cannot hold for is the thing the clock
 * extension exists to avoid.
 */
const night = await screenNamed(
  "Overnight",
  "Vague on purpose. The time in words, the first thing tomorrow, and what it is doing outside.",
  [
    {
      extension: "clock",
      label: "In words",
      design: "words",
      settings: { heading: "", show_window: true, day_start: "07:30", day_end: "23:00" },
      at: [1, 1, 12, 5],
      hostsNotices: true,
    },
    {
      extension: "google_calendar",
      label: "First thing",
      design: "next",
      settings: {
        calendar: CALENDARS,
        range: "tomorrow",
        horizon_hours: 24,
        hide_declined: true,
        heading: "",
        show_location: true,
      },
      at: [1, 6, 6, 7],
    },
    {
      extension: "weather",
      label: "Outside",
      settings: WEATHER,
      at: [7, 6, 6, 7],
    },
  ],
);

/* -- the device ------------------------------------------------------------ */

const [device] = await db
  .insert(devices)
  .values({
    name: DEVICE_NAME,
    macAddress: MAC,
    apiKey: "showcase-" + Math.random().toString(36).slice(2, 14),
    modelId: panel.id,
    width: panel.width,
    height: panel.height,
    refreshRate: 900,
    // Quiet from midnight to six: it keeps the overnight picture and wakes
    // once instead of twenty-four times.
    sleepStartMinute: 0,
    sleepStopMinute: 6 * 60,
    percentCharged: 71,
    batteryVoltage: 4.03,
    rssi: -58,
    wifiBand: "2.4",
    firmwareVersion: "1.5.2",
    updateSource: "Timer.",
    lastSeenAt: new Date(),
  })
  .returning();

/* -- the sources ----------------------------------------------------------- */

/*
 * Configured to match the widgets exactly, so watching a thing and drawing it
 * costs one fetch between them rather than two.
 */
const source = async (extension: string, label: string, settings: Record<string, unknown>) => {
  const [row] = await db.insert(triggers).values({ extension, label, settings }).returning();
  const result = await refreshTrigger(row);
  if (result.error) console.warn(`  ! ${label}: ${result.error}`);
  return row;
};

const trains = await source("public_transport", "Certosa departures", { ...TRANSIT, heading: "" });
const rain = await source("weather", "Milan weather", WEATHER);
const diary = await source("google_calendar", "My day", CALENDAR_TODAY);
const takings = await source("revenue", "Stripe", REVENUE);

/* -- the tree ---------------------------------------------------------------
 *
 * Priority is depth, so this reads top to bottom as a sentence: overnight
 * beats a train, a train beats a meeting, a meeting beats the weather, and the
 * weather beats going back to the default.
 */

const leaf = (label: string, screenId: number, refreshSeconds: number, holdSeconds = 0) =>
  db
    .insert(decisionNodes)
    .values({ deviceId: device.id, kind: "screen", label, screenId, refreshSeconds, holdSeconds })
    .returning()
    .then((rows) => rows[0]);

const check = (
  label: string,
  condition: Record<string, unknown>,
  yesNodeId: number,
  noNodeId: number,
) =>
  db
    .insert(decisionNodes)
    .values({ deviceId: device.id, kind: "question", label, condition, yesNodeId, noNodeId })
    .returning()
    .then((rows) => rows[0]);

const fact = (sourceId: string, factKey: string, operator: string, value?: unknown) =>
  value === undefined
    ? { kind: "fact", sourceId, factKey, operator }
    : { kind: "fact", sourceId, factKey, operator, value };

const dayLeaf = await leaf("The day", day.id, 900);
// Five minutes while a train is close, and held for five so a board that
// crosses the threshold and back does not flap the panel.
const leavingLeaf = await leaf("Leaving now", leaving.id, 300, 300);
const nextLeaf = await leaf("What is next", next.id, 300, 600);
// Twenty minutes, so a shower that stops and starts is not a redraw each time.
const wetLeaf = await leaf("Wet weather", wet.id, 900, 1200);
const businessLeaf = await leaf("The business", business.id, 1800);
const nightLeaf = await leaf("Overnight", night.id, 3600);

// Deepest first: the last thing asked, and so the lowest priority.
const eveningCheck = await check(
  "Evening, and nobody is about?",
  {
    kind: "all",
    conditions: [
      fact(CLOCK_SOURCE, "time_of_day", "between", ["19:00", "23:00"]),
      fact(diary.id.toString(), "meetings_left", "eq", 0),
    ],
  },
  businessLeaf.id,
  dayLeaf.id,
);

const rainCheck = await check(
  "Raining today?",
  fact(rain.id.toString(), "rain_chance", "gte", 60),
  wetLeaf.id,
  eveningCheck.id,
);

/*
 * A nested group: either you are sitting in a meeting now, or a video call is
 * close. Both want to be told what is next rather than told to leave, because
 * neither of them is somewhere you have to travel to. Not expressible as one
 * comparison, which is what `any` and `all` are for.
 */
const meetingCheck = await check(
  "In a call, or about to be?",
  {
    kind: "any",
    conditions: [
      fact(diary.id.toString(), "in_a_meeting", "is_true"),
      {
        kind: "all",
        conditions: [
          fact(diary.id.toString(), "next_meeting_in", "lt", 40),
          fact(diary.id.toString(), "next_meeting_is_remote", "is_true"),
        ],
      },
    ],
  },
  nextLeaf.id,
  rainCheck.id,
);

const trainCheck = await check(
  "A train worth running for?",
  {
    kind: "all",
    conditions: [
      fact(trains.id.toString(), "next_departure_in", "lt", 12),
      fact(CLOCK_SOURCE, "day_of_week", "is_one_of", [1, 2, 3, 4, 5]),
    ],
  },
  leavingLeaf.id,
  meetingCheck.id,
);

/*
 * Somewhere to be, within the hour.
 *
 * Three parts, and all three are load-bearing. "Any of my accounts" is not one
 * of them - the source names both primaries in its Calendars field and the
 * provider merges them into one list in time order, so `next` is already the
 * soonest across the two and the check never mentions an account.
 *
 * `location` alone would not do it either. A Google Meet reports a location -
 * the literal string "Meet" - so a video call has one, and a rule that fired on
 * that would send you to the station for a call you take at your desk. It is
 * the pair that means "a place": a location, and not a remote one.
 */
const somewhereCheck = await check(
  "Somewhere to be within the hour?",
  {
    kind: "all",
    conditions: [
      fact(diary.id.toString(), "next_meeting_in", "lt", 60),
      fact(diary.id.toString(), "next_meeting_is_remote", "is_false"),
      fact(diary.id.toString(), "next_meeting_location", "present"),
    ],
  },
  leavingLeaf.id,
  trainCheck.id,
);

// Asked first, so it wins over everything below it.
const nightCheck = await check(
  "Overnight?",
  fact(CLOCK_SOURCE, "time_of_day", "between", ["23:00", "06:30"]),
  nightLeaf.id,
  somewhereCheck.id,
);

await db.update(devices).set({ rootNodeId: nightCheck.id }).where(eq(devices.id, device.id));

/* -- lay the canvas out ----------------------------------------------------- */

const placedNodes = await db
  .select()
  .from(decisionNodes)
  .where(eq(decisionNodes.deviceId, device.id));

const positions = layout(placedNodes as unknown as Node[], nightCheck.id);

for (const [id, position] of positions) {
  await db.update(decisionNodes).set(position).where(eq(decisionNodes.id, id));
}

/* -- the notices ------------------------------------------------------------
 *
 * The additive half. The tree is exclusive - one screen at a time - and these
 * ride on whatever it landed on. `placement: source` puts a transit alert on
 * the departure board when the screen has one, rather than beside the weather.
 */

await db.insert(notices).values([
  {
    deviceId: device.id,
    label: "Service alert",
    condition: fact(trains.id.toString(), "alert", "present"),
    icon: "alert",
    level: "urgent",
    placement: "source",
    priority: 0,
    text: "{{ transit.alerts[0].headline | default: 'Service alert' }}",
  },
  {
    deviceId: device.id,
    label: "Next train cancelled",
    condition: fact(trains.id.toString(), "next_cancelled", "is_true"),
    icon: "close",
    level: "urgent",
    placement: "source",
    priority: 1,
    text: "{{ transit.origin | truncate: 18 }}: next train cancelled",
  },
  {
    deviceId: device.id,
    label: "Meeting about to start",
    condition: fact(diary.id.toString(), "next_meeting_in", "lt", 10),
    icon: "calendar",
    level: "urgent",
    placement: "screen",
    priority: 2,
    text: "{{ calendar.next.title | truncate: 28 }} at {{ calendar.next.start }}",
  },
  {
    deviceId: device.id,
    label: "Payments failing",
    condition: fact(takings.id.toString(), "failed_today", "gte", 3),
    icon: "alert",
    level: "urgent",
    placement: "screen",
    priority: 3,
    text: "{{ revenue.failed_today }} payments failed today",
  },
  {
    deviceId: device.id,
    label: "Double booked",
    condition: fact(diary.id.toString(), "conflicts_today", "gte", 1),
    icon: "alert",
    level: "warn",
    placement: "screen",
    priority: 4,
    text: "Two things at once today",
  },
  {
    deviceId: device.id,
    label: "Panel needs charging",
    condition: fact(DEVICE_SOURCE, "battery_percent", "lt", 20),
    icon: "alert",
    level: "warn",
    placement: "screen",
    priority: 5,
    text: "Battery low - put the panel on the cable",
  },
  {
    deviceId: device.id,
    label: "Running late",
    condition: fact(trains.id.toString(), "next_delay", "gte", 5),
    icon: "train",
    level: "info",
    placement: "source",
    priority: 6,
    text: "{{ transit.departures[0].line }} +{{ transit.departures[0].delay }} min",
  },
  {
    deviceId: device.id,
    label: "Rain likely",
    condition: fact(rain.id.toString(), "rain_chance", "gte", 60),
    icon: "umbrella",
    level: "info",
    placement: "screen",
    priority: 7,
    text: "Rain likely - {{ source_1.daily.precipitation_probability_max[0] }}%",
  },
]);

console.log(
  [
    ``,
    `  ${DEVICE_NAME}  device ${device.id}  root ${nightCheck.id}`,
    `  screens        ${[day, leaving, next, wet, business, night].map((one) => `${one.name} (${one.id})`).join(", ")}`,
    `  sources        ${[trains, rain, diary, takings].map((one) => `${one.label} (${one.id})`).join(", ")}`,
    `  nodes          ${placedNodes.length}   notices 8`,
    ``,
    `  open /devices/${device.id}`,
    ``,
  ].join("\n"),
);

process.exit(0);
