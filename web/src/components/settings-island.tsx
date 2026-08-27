"use client";

import { useState } from "react";

import { Select } from "@/components/ui/select";

/**
 * The two settings, with hidden inputs behind them so the server action still
 * receives a plain form submission - the custom dropdown is presentation, not
 * a different way of submitting.
 */
export function SettingsIsland({
  locale,
  timezone,
  locales,
  zones,
}: {
  locale: string;
  timezone: string;
  locales: { value: string; label: string }[];
  zones: { value: string; label: string; hint: string }[];
}) {
  const [chosenLocale, setLocale] = useState(locale);
  const [chosenZone, setZone] = useState(timezone);

  return (
    <div className="space-y-5 rounded-panel border border-line bg-surface p-5">
      <div>
        <label className="mb-1.5 block text-[13px] font-medium">Language</label>
        <Select
          value={chosenLocale}
          options={locales}
          onChange={setLocale}
          ariaLabel="Language"
        />
        <input type="hidden" name="locale" value={chosenLocale} />
        <p className="mt-1.5 text-[12px] text-faint">
          Used for day and month names on the panels, not for the dashboard.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-medium">Time zone</label>
        <Select value={chosenZone} options={zones} onChange={setZone} ariaLabel="Time zone" />
        <input type="hidden" name="timezone" value={chosenZone} />
        <p className="mt-1.5 text-[12px] text-faint">
          Where the displays are, not where the server is.
        </p>
      </div>
    </div>
  );
}
