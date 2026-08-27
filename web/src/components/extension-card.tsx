"use client";

import { useState } from "react";
import { Clock, Radio, Train, Zap } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { ShapeGlyph } from "@/components/shape-badge";
import { cn } from "@/lib/cn";
import { DEFAULT_PANEL } from "@/lib/panel";
import { pixelsFor, shape as findShape, type ShapeId } from "@/lib/shapes";

export interface ExtensionSummary {
  name: string;
  label: string;
  description: string;
  kind: "static" | "poll" | "transit";
  interval: number;
  unit: string;
  shapes: ShapeId[];
  settingCount: number;
  facts: { key: string; label: string; unit: string }[];
  problems: string[];
}

const KIND = {
  static: { icon: Clock, label: "Renders locally", hint: "Fetches nothing. Draws from its settings." },
  poll: { icon: Radio, label: "Polls an API", hint: "Calls out on a schedule for fresh data." },
  transit: { icon: Train, label: "Transit provider", hint: "Answered by a provider built into Dither." },
} as const;

export function ExtensionCard({ extension }: { extension: ExtensionSummary }) {
  const [shapeId, setShapeId] = useState<ShapeId>(extension.shapes[0]);
  const shape = findShape(shapeId);
  const kind = KIND[extension.kind];
  const [width, height] = shape ? pixelsFor(shape, DEFAULT_PANEL.width, DEFAULT_PANEL.height) : [800, 480];

  return (
    <article className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface">
      <div className="flex items-start justify-between gap-4 p-5 pb-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{extension.label}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{extension.description}</p>
        </div>
        <span
          title={kind.hint}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] font-medium text-muted"
        >
          <kind.icon size={12} className="text-faint" />
          {kind.label}
        </span>
      </div>

      <div className="px-5">
        <div className="rounded-lg bg-ground p-3">
          <ScreenPreview
            src={`/api/preview/extension/${extension.name}?shape=${shapeId}`}
            width={width}
            height={height}
            alt={`${extension.label} at ${shape?.label}`}
            className="paper-shadow mx-auto"
          />
        </div>
      </div>

      <div className="p-5 pt-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
          Can be placed as
        </p>
        <div className="flex flex-wrap gap-1.5">
          {extension.shapes.map((id) => {
            const candidate = findShape(id)!;
            const active = id === shapeId;

            return (
              <button
                key={id}
                type="button"
                onClick={() => setShapeId(id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                  active
                    ? "border-accent/60 bg-accent/10 text-ink"
                    : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <ShapeGlyph
                  shape={candidate}
                  className={cn("h-3.5 w-3.5", active ? "text-accent" : "text-faint")}
                />
                {candidate.label}
              </button>
            );
          })}
        </div>

        {extension.facts.length > 0 && (
          <>
            <p className="mt-5 mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
              <Zap size={11} />
              Triggers it gives you
            </p>
            <div className="flex flex-wrap gap-1.5">
              {extension.facts.map((fact) => (
                <span
                  key={fact.key}
                  className="rounded-md bg-raised px-2 py-1 font-mono text-[11px] text-muted"
                >
                  {fact.label}
                  {fact.unit && <span className="text-faint"> ({fact.unit})</span>}
                </span>
              ))}
            </div>
          </>
        )}

        <p className="mt-5 border-t border-line pt-4 text-[12px] text-faint">
          {extension.settingCount > 0
            ? `${extension.settingCount} setting${extension.settingCount === 1 ? "" : "s"}, chosen when you place it on a screen.`
            : "No settings."}
          {extension.kind !== "static" &&
            ` Refreshes every ${extension.interval} ${extension.unit}${extension.interval === 1 ? "" : "s"}.`}
        </p>

        {extension.problems.length > 0 && (
          <ul className="mt-3 space-y-1">
            {extension.problems.map((problem) => (
              <li key={problem} className="text-[12px] leading-relaxed text-warn">
                {problem}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
