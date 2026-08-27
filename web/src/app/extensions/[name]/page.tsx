import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Link2, Radio, Train, Zap } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { ShapeGlyph } from "@/components/shape-badge";
import { find } from "@/lib/extensions/registry";
import { summarise } from "@/lib/extensions/summary";
import { operatorsFor } from "@/lib/facts";
import { DEFAULT_PANEL } from "@/lib/panel";
import { pixelsFor, shape as findShape } from "@/lib/shapes";

export const dynamic = "force-dynamic";

const KIND = {
  static: { icon: Clock, label: "Renders locally", hint: "Fetches nothing; draws from its settings." },
  poll: { icon: Radio, label: "Polls an API", hint: "Calls out on a schedule for fresh data." },
  transit: { icon: Train, label: "Transit provider", hint: "Answered by a provider built into Dither." },
  connection: { icon: Link2, label: "Needs an account", hint: "Answered by an account you link once." },
} as const;

export default async function ExtensionPage({ params }: { params: Promise<{ name: string }> }) {
  const extension = await find((await params).name);
  if (!extension) notFound();

  const summary = summarise(extension);
  const kind = KIND[summary.kind];

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Link
        href="/extensions"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} />
        Extensions
      </Link>

      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{summary.label}</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
            {summary.description}
          </p>
        </div>
        <span
          title={kind.hint}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1.5 text-[12px] text-muted"
        >
          <kind.icon size={13} className="text-faint" />
          {kind.label}
        </span>
      </header>

      {summary.connection && (
        <div className="mb-8 flex items-center justify-between gap-4 rounded-panel border border-line bg-surface px-5 py-4">
          <div>
            <p className="text-[13px] font-medium">Needs your {summary.connection.label} account</p>
            <p className="mt-1 text-[12px] text-faint">
              Link it once and every {summary.label.toLowerCase()} widget on every screen uses it.
              {summary.connection.mocked && " Answering with stand-in data until the real link is built."}
            </p>
          </div>
          <Link
            href="/connections"
            className="shrink-0 rounded-lg border border-line bg-raised px-3 py-1.5 text-[12px] transition-colors hover:text-ink"
          >
            Connections
          </Link>
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-1 text-[15px] font-semibold">Sizes it can be drawn at</h2>
        <p className="mb-4 text-[13px] text-faint">
          A widget takes the size you draw it. Any size not here is refused rather than scaled.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          {summary.shapes.map((id) => {
            const shape = findShape(id)!;
            const [width, height] = pixelsFor(shape, DEFAULT_PANEL.width, DEFAULT_PANEL.height);

            return (
              <div key={id} className="rounded-panel border border-line bg-surface p-3">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <ShapeGlyph shape={shape} className="h-3.5 w-3.5 text-accent-bright" />
                  <span className="text-[13px] font-medium">{shape.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-faint">
                    {width}×{height}
                  </span>
                </div>
                <ScreenPreview
                  src={`/api/preview/extension/${summary.name}?shape=${id}`}
                  width={width}
                  height={height}
                  alt={`${summary.label} at ${shape.label}`}
                  className="paper-shadow"
                />
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-1 text-[15px] font-semibold">Settings</h2>
          <p className="mb-4 text-[13px] text-faint">
            Chosen per placement, so two of these on one screen can differ.
          </p>

          {extension.manifest.fields.length === 0 ? (
            <p className="text-[13px] text-faint">None.</p>
          ) : (
            <dl className="space-y-3">
              {extension.manifest.fields.map((field) => (
                <div key={field.keyname} className="rounded-lg border border-line bg-surface px-3.5 py-3">
                  <dt className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium">{field.name}</span>
                    <span className="font-mono text-[11px] text-faint">{field.field_type}</span>
                  </dt>
                  {field.help_text && (
                    <dd className="mt-1 text-[12px] leading-relaxed text-faint">{field.help_text}</dd>
                  )}
                </div>
              ))}
            </dl>
          )}
        </section>

        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-[15px] font-semibold">
            <Zap size={14} className="text-accent-bright" />
            Triggers it gives you
          </h2>
          <p className="mb-4 text-[13px] text-faint">
            Values a device can decide on. The type fixes which comparisons are offered.
          </p>

          {extension.manifest.facts.length === 0 ? (
            <p className="text-[13px] text-faint">None.</p>
          ) : (
            <dl className="space-y-3">
              {extension.manifest.facts.map((fact) => (
                <div key={fact.key} className="rounded-lg border border-line bg-surface px-3.5 py-3">
                  <dt className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium">
                      {fact.label}
                      {fact.unit && <span className="text-faint"> ({fact.unit})</span>}
                    </span>
                    <span className="font-mono text-[11px] text-faint">{fact.type}</span>
                  </dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1">
                    {operatorsFor(fact.type).map((operator) => (
                      <span
                        key={operator.id}
                        className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-faint"
                      >
                        {operator.label}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      {summary.problems.length > 0 && (
        <ul className="mt-8 space-y-1.5 rounded-panel border border-warn/40 bg-warn/5 p-5">
          {summary.problems.map((problem) => (
            <li key={problem} className="text-[13px] text-warn">
              {problem}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
