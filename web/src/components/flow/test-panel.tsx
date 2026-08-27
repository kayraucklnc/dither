"use client";

import { FlaskConical, RotateCcw } from "lucide-react";

import type { EditorSource } from "@/components/flow/condition-editor";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";

export interface Simulation {
  active: boolean;
  /** Local "YYYY-MM-DDTHH:mm", or empty for "now". */
  at: string;
  overrides: Record<string, Record<string, unknown>>;
  /** Notices forced on or off, regardless of what their condition says. */
  notices: Record<string, "on" | "off">;
}

export const NO_SIMULATION: Simulation = { active: false, at: "", overrides: {}, notices: {} };

export interface TestNotice {
  id: number;
  label: string;
  text: string;
  icon: string;
  enabled: boolean;
}

const input =
  "w-full rounded-md border border-line bg-ground px-2 py-1 text-[12px] text-ink " +
  // The placeholder is the *current* value, so it has to read as a hint and
  // not as something already typed in.
  "outline-none transition-colors placeholder:text-faint/70 focus:border-accent/70";

/** "in two hours", "tomorrow at 8" - the moments anyone actually wants to check. */
function shiftedFromNow(hours: number, hour?: number): string {
  const at = new Date();

  if (hour !== undefined) {
    at.setHours(hour, 0, 0, 0);
    if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
  } else {
    at.setHours(at.getHours() + hours);
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * Pretending, on purpose.
 *
 * A rule about rain cannot be checked in August by waiting, and a rule about
 * 7am cannot be checked at midnight. This runs the same walk against a moment
 * and some values you have made up, and lights the same path on the canvas -
 * so "will this work?" has an answer before the panel is on a wall.
 *
 * Nothing here is written down. The device keeps deciding for real.
 */
export function TestPanel({
  sources,
  notices,
  firing,
  simulation,
  onChange,
}: {
  sources: EditorSource[];
  notices: TestNotice[];
  firing: number[];
  simulation: Simulation;
  onChange: (simulation: Simulation) => void;
}) {
  const triggers = sources.filter((source) => source.group === "trigger");
  const overridden = Object.values(simulation.overrides).flatMap(Object.keys).length;

  const force = (id: number, state: "on" | "off" | undefined) => {
    const next = { ...simulation.notices };
    if (state === undefined) delete next[String(id)];
    else next[String(id)] = state;

    onChange({ ...simulation, active: true, notices: next });
  };

  const set = (sourceId: string, key: string, value: unknown) => {
    const forSource = { ...(simulation.overrides[sourceId] ?? {}) };

    if (value === "" || value === undefined) delete forSource[key];
    else forSource[key] = value;

    const overrides = { ...simulation.overrides };
    if (Object.keys(forSource).length) overrides[sourceId] = forSource;
    else delete overrides[sourceId];

    onChange({ ...simulation, active: true, overrides });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-line bg-ground/40 p-3">
        <FlaskConical size={14} className={cn("mt-0.5 shrink-0", simulation.active ? "text-accent-bright" : "text-faint")} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium">Try a different moment</p>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            Runs the same walk against a time and values you make up. Nothing is saved and the
            device keeps deciding for real.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...simulation, active: !simulation.active })}
          className={cn(
            "mt-0.5 h-4 w-7 shrink-0 rounded-full border p-0.5 transition-colors",
            simulation.active ? "border-accent/60 bg-accent/30" : "border-line bg-ground",
          )}
        >
          <span
            className={cn(
              "block h-2.5 w-2.5 rounded-full transition-transform",
              simulation.active ? "translate-x-3 bg-accent" : "bg-faint",
            )}
          />
        </button>
      </div>

      {simulation.active && (
        <>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
              Pretend it is
            </label>
            <input
              type="datetime-local"
              value={simulation.at}
              onChange={(event) => onChange({ ...simulation, at: event.target.value })}
              className={input}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: "Now", value: "" },
                { label: "In 2 hours", value: shiftedFromNow(2) },
                { label: "07:00", value: shiftedFromNow(0, 7) },
                { label: "18:00", value: shiftedFromNow(0, 18) },
                { label: "23:00", value: shiftedFromNow(0, 23) },
              ].map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  onClick={() => onChange({ ...simulation, at: choice.value })}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] transition-colors",
                    simulation.at === choice.value
                      ? "border-accent/60 bg-accent/15 text-ink"
                      : "border-line bg-raised text-muted hover:text-ink",
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
                Pretend these values
              </span>
              {overridden > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...simulation, overrides: {} })}
                  className="flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-ink"
                >
                  <RotateCcw size={10} />
                  Clear {overridden}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {triggers.map((source) => (
                <div key={source.id} className="rounded-lg border border-line bg-raised p-2.5">
                  <p className="mb-2 truncate text-[12px] font-medium">{source.label}</p>

                  <div className="space-y-1.5">
                    {source.facts.map((fact) => {
                      const override = simulation.overrides[source.id]?.[fact.key];
                      const on = override !== undefined;

                      return (
                        <div key={fact.key} className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              on ? "bg-accent" : "bg-transparent",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                            {fact.label}
                          </span>

                          {fact.type === "boolean" ? (
                            <Select
                              value={on ? String(override) : ""}
                              ariaLabel={fact.label}
                              className="!w-24 !py-1 !text-[12px]"
                              options={[
                                { value: "", label: source.values[fact.key] ?? "—" },
                                { value: "true", label: "yes" },
                                { value: "false", label: "no" },
                              ]}
                              onChange={(value) =>
                                set(source.id, fact.key, value === "" ? "" : value === "true")
                              }
                            />
                          ) : (
                            <input
                              value={on ? String(override) : ""}
                              placeholder={source.values[fact.key] ?? "—"}
                              onChange={(event) => {
                                const raw = event.target.value;
                                const numeric = fact.type === "number" || fact.type === "duration";
                                set(
                                  source.id,
                                  fact.key,
                                  raw === "" ? "" : numeric ? Number(raw) : raw,
                                );
                              }}
                              className={cn(input, "w-24 shrink-0")}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {triggers.length === 0 && (
                <p className="rounded-lg border border-dashed border-line p-3 text-center text-[11px] text-faint">
                  Add a source in the Decide tab and its values can be pretended here.
                </p>
              )}
            </div>
          </div>

          {/*
            Forcing a notice on runs it as though its condition held, which is
            the only sane way to judge the wording and the icon of an alert that
            fires twice a year.
          */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
              Fire an alert
            </p>

            {notices.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line p-3 text-center text-[11px] text-faint">
                Add one in the Notices tab and you can fire it here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {notices.map((notice) => {
                  const forced = simulation.notices[String(notice.id)];
                  const live = firing.includes(notice.id);

                  return (
                    <div
                      key={notice.id}
                      className="flex items-center gap-2 rounded-lg border border-line bg-raised p-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12px]">{notice.label || notice.text}</span>
                          {live && (
                            <span className="shrink-0 rounded bg-live/15 px-1.5 py-0.5 text-[10px] text-live">
                              showing
                            </span>
                          )}
                        </span>
                        {!notice.enabled && (
                          <span className="block text-[10px] text-faint">turned off</span>
                        )}
                      </span>

                      <div className="flex shrink-0 rounded-md border border-line bg-ground p-0.5">
                        {(
                          [
                            ["off", "off"],
                            [undefined, "real"],
                            ["on", "on"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => force(notice.id, value)}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                              forced === value
                                ? "bg-accent text-accent-ink"
                                : "text-faint hover:text-ink",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
