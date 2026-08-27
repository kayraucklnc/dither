import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { appSettings, type AppSettings } from "@/lib/db/schema";

/**
 * Installation-wide settings.
 *
 * Cached for a few seconds because every render asks: a screen with six
 * widgets should not make six identical queries, and a change taking a moment
 * to reach a panel that refreshes every fifteen minutes is not a change anyone
 * notices.
 */
export interface Environment {
  locale: string;
  timezone: string;
  /** Minutes east of UTC, which is what the template engine wants. */
  timezoneOffset: number;
}

const DEFAULTS: AppSettings = {
  id: 1,
  locale: "en-GB",
  timezone: "UTC",
  updatedAt: new Date(),
};

let cached: { at: number; value: AppSettings } | undefined;
const TTL = 5_000;

export async function settings(): Promise<AppSettings> {
  if (cached && Date.now() - cached.at < TTL) return cached.value;

  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  const value = row ?? DEFAULTS;

  cached = { at: Date.now(), value };
  return value;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const [row] = await db
    .insert(appSettings)
    .values({ ...DEFAULTS, ...patch, id: 1, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.id, set: { ...patch, updatedAt: new Date() } })
    .returning();

  cached = undefined;
  return row;
}

/** Minutes east of UTC for a zone, right now - so summer time is included. */
export function offsetMinutes(timezone: string, at = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(at);

    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    if (!match) return 0;

    const sign = match[1] === "-" ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3]));
  } catch {
    // An unknown zone should not stop a panel rendering.
    return 0;
  }
}

export async function environment(): Promise<Environment> {
  const current = await settings();

  return {
    locale: current.locale,
    timezone: current.timezone,
    timezoneOffset: offsetMinutes(current.timezone),
  };
}
