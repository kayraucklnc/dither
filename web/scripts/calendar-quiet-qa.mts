/**
 * Every calendar design, on a day that is over.
 *
 * The manifest's sample is a busy Thursday, which is the right thing to design
 * against and means the branch that runs from six o'clock until midnight is
 * the one nobody ever looks at. This builds days the sample cannot - today
 * finished with a week still ahead, today finished with only today asked for,
 * and a day with nothing on it at all - and draws every design at both ends of
 * its range.
 *
 * The clock is real: templates work their countdowns out from `"now"` at the
 * moment of drawing, so the days here are laid out relative to this instant
 * rather than against a fixed hour. Run it at any time of day.
 *
 *   cd web && npx tsx scripts/calendar-quiet-qa.mts [out-dir]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { dayShape, type Meeting } from "../src/lib/calendar/day";
import { DAY, MINUTE, startOfDay } from "../src/lib/clock";
import { defaultSettings, find } from "../src/lib/extensions/registry";
import { DEFAULT_PANEL } from "../src/lib/panel";
import { renderSolo } from "../src/lib/render";
import { closeBrowser } from "../src/lib/render/browser";
import { environment } from "../src/lib/settings";

// The installation's own zone, not UTC. The templates work `now` out from the
// clock the renderer is given, which is this one; a payload laid out against a
// different midnight puts the day three hours away from the rule that says
// where you are in it, and every picture is quietly wrong.
const ZONE = (await environment()).timezone;
const out = process.argv[2] ?? "/tmp/dither-quiet";
const now = new Date();
const midnight = startOfDay(now, ZONE).getTime();
const minutesToday = Math.round((now.getTime() - midnight) / MINUTE);

let counter = 0;

/** One meeting, placed by minutes since a local midnight `day` days from now. */
function at(day: number, from: number, minutes: number, overrides: Partial<Meeting> = {}): Meeting {
  counter += 1;
  const startsAt = new Date(midnight + day * DAY + from * MINUTE);

  return {
    id: `q${counter}`,
    title: "Something",
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * MINUTE),
    location: "",
    remote: false,
    response: "accepted",
    allDay: false,
    ...overrides,
  };
}

/**
 * A day already behind you, whatever time it is now.
 *
 * Spread across the part of the day that has actually happened and finishing
 * short of now, so nothing is running and nothing is upcoming. Before about
 * half past nine there is no such day, and the answer is honestly none - which
 * is a case worth drawing too.
 */
function daySoFar(): Meeting[] {
  // Forty-five minutes of clearance, not five: this script renders fifty-odd
  // pictures and the templates read the wall clock at the moment each one is
  // drawn, so a day that only just finished is a day that is still running by
  // the time the last design gets to it.
  const ends = minutesToday - 45;
  const start = Math.max(7 * 60, ends - 8 * 60);
  const span = ends - start;
  if (span < 150) return [];

  /** Where each one sits in the part of the day that happened, and how long. */
  const drafts: [string, number, number, string][] = [
    ["Gym", 0, 60, "Virgin Active"],
    ["Design review", 26, 45, "Sala 4"],
    ["Standup", 48, 15, "Meet"],
    ["Lunch with Marco", 62, 60, "Trattoria Milanese"],
    ["Quarterly planning", 84, 90, "Sala 2"],
  ];

  return drafts.map(([title, percent, minutes, location]) => {
    const from = start + Math.round((span * percent) / 100);
    return at(0, from, Math.max(15, Math.min(minutes, ends - from)), {
      title,
      location,
      attendees: 4,
    });
  });
}

const ahead: Meeting[] = [
  at(1, 8 * 60 + 30, 45, { title: "Dentist", location: "Via Meravigli 12" }),
  at(1, 10 * 60, 120, { title: "Board meeting", location: "Sala 1", attendees: 8 }),
  at(2, 16 * 60, 60, { title: "Retro", location: "Meet", remote: true }),
  at(4, 6 * 60 + 40, 110, { title: "Flight to Berlin", location: "MXP T1" }),
];

const allDay = at(0, 0, 1440, { title: "Ana on leave", allDay: true });

interface Scene {
  key: string;
  label: string;
  meetings: Meeting[];
  daysAhead: number;
  emptyLabel: string;
  range: string;
}

const scenes: Scene[] = [
  {
    key: "evening-week",
    label: "Today is over, the week is not",
    meetings: [...daySoFar(), allDay, ...ahead],
    daysAhead: 7,
    emptyLabel: "Nothing this week",
    range: "week",
  },
  {
    key: "evening-today",
    label: "Today is over and today is all that was asked for",
    meetings: [...daySoFar(), allDay],
    daysAhead: 1,
    emptyLabel: "Nothing left today",
    range: "today",
  },
  {
    key: "clear-day",
    label: "Nothing on it at all",
    meetings: ahead,
    daysAhead: 7,
    emptyLabel: "Nothing this week",
    range: "week",
  },
];

const extension = await find("google_calendar");
if (!extension) throw new Error("google_calendar did not load.");

const settings = defaultSettings(extension);
await mkdir(out, { recursive: true });

console.log(`clock: ${now.toISOString()} - ${minutesToday} minutes into a day in ${ZONE}`);

for (const scene of scenes) {
  const shape = dayShape(scene.meetings, now, {
    timezone: ZONE,
    locale: "en-GB",
    daysAhead: scene.daysAhead,
  });

  const data = {
    calendar: {
      ...shape,
      name: "Primary",
      range: scene.range,
      empty_label: scene.emptyLabel,
      spans_days: scene.daysAhead > 1,
      window_empty: false,
      unread: 0,
    },
  };

  const summary = shape as Record<string, Record<string, unknown>>;
  console.log(
    `\n${scene.label}` +
      `\n  left today ${summary.today.remaining}, next ${String(shape.next_any_day || "none")}` +
      ` ${(shape.next_any as { title?: string } | null)?.title ?? ""}`,
  );

  for (const design of extension.designs) {
    // Both ends of the range as well as the middle: the empty branch has its
    // own arithmetic on the box, and the failures live at the edges.
    const sizes = [
      design.nominal,
      { columns: design.range.minColumns, rows: design.range.minRows },
      { columns: design.range.maxColumns, rows: design.range.maxRows },
    ];

    for (const [index, size] of sizes.entries()) {
      const where = ["nominal", "smallest", "largest"][index];
      const rendered = await renderSolo(
        "google_calendar",
        size,
        { ...settings, range: scene.range },
        data,
        DEFAULT_PANEL,
        [],
        design.key,
      );

      const file = path.join(out, `${scene.key}-${design.key}-${where}.png`);
      await writeFile(file, rendered.bytes);
      console.log(`  ${design.key.padEnd(8)} ${where.padEnd(9)} ${size.columns}x${size.rows}  ${file}`);
    }
  }
}

await closeBrowser();

process.exit(0);
