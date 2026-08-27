import { revalidatePath } from "next/cache";
import { Clock, Globe } from "lucide-react";

import { SettingsIsland } from "@/components/settings-island";
import { offsetMinutes, saveSettings, settings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Zones worth offering without a searchable list of six hundred. */
const ZONES = [
  "UTC", "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Madrid",
  "Europe/Paris", "Europe/Rome", "Europe/Berlin", "Europe/Amsterdam", "Europe/Zurich",
  "Europe/Stockholm", "Europe/Helsinki", "Europe/Athens", "Europe/Istanbul", "Europe/Warsaw",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Singapore",
  "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
];

const LOCALES = [
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "fr-FR", label: "Français" },
  { value: "es-ES", label: "Español" },
  { value: "it-IT", label: "Italiano" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "pt-PT", label: "Português" },
  { value: "sv-SE", label: "Svenska" },
  { value: "tr-TR", label: "Türkçe" },
  { value: "ja-JP", label: "日本語" },
];

async function save(formData: FormData) {
  "use server";

  await saveSettings({
    locale: String(formData.get("locale")),
    timezone: String(formData.get("timezone")),
  });

  revalidatePath("/settings");
  revalidatePath("/devices");
}

export default async function SettingsPage() {
  const current = await settings();

  const zones = ZONES.map((zone) => {
    const minutes = offsetMinutes(zone);
    const sign = minutes < 0 ? "-" : "+";
    const hours = String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0");
    const rest = String(Math.abs(minutes) % 60).padStart(2, "0");

    return { value: zone, label: zone.replace(/_/g, " "), hint: `UTC${sign}${hours}:${rest}` };
  });

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          What is true of this whole installation. Extensions inherit these unless a widget
          overrides them.
        </p>
      </header>

      <form action={save} className="space-y-6">
        <SettingsIsland
          locale={current.locale}
          timezone={current.timezone}
          locales={LOCALES}
          zones={zones}
        />

        <div className="flex items-center justify-between gap-4 rounded-panel border border-line bg-surface px-5 py-4">
          <p className="text-[12px] leading-relaxed text-faint">
            Changing either re-renders every screen, because a date reads differently.
          </p>
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90"
          >
            Save
          </button>
        </div>
      </form>

      <div className="mt-8 space-y-3">
        <p className="flex items-center gap-2 text-[12px] text-faint">
          <Globe size={13} />
          Day and month names on every panel come from the language.
        </p>
        <p className="flex items-center gap-2 text-[12px] text-faint">
          <Clock size={13} />
          The time zone sets the clock every extension sees, summer time included.
        </p>
      </div>
    </div>
  );
}
