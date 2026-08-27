import Link from "next/link";
import { Bell, Clock, Link2, Radio, Train, Zap } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import type { ExtensionSummary } from "@/lib/extensions/summary";
import { DEFAULT_PANEL } from "@/lib/panel";
import { pixelsFor, sizeToken } from "@/lib/shapes";

const KIND = {
  static: { icon: Clock, label: "Local" },
  poll: { icon: Radio, label: "Polls an API" },
  transit: { icon: Train, label: "Transit" },
  connection: { icon: Link2, label: "Needs an account" },
} as const;

/**
 * One extension in the catalogue: what it looks like, and just enough words to
 * tell it apart. Everything else lives on its own page - a grid of cards is for
 * choosing, not for reading.
 */
export function ExtensionTile({ extension }: { extension: ExtensionSummary }) {
  const [width, height] = pixelsFor(extension.headline, DEFAULT_PANEL.width, DEFAULT_PANEL.height);
  const kind = KIND[extension.kind];

  return (
    <Link
      href={`/extensions/${extension.name}`}
      className="group flex flex-col rounded-panel border border-line bg-surface p-3 transition-colors hover:border-line-strong"
    >
      <ScreenPreview
        src={`/api/preview/extension/${extension.name}?size=${sizeToken(extension.headline)}`}
        width={width}
        height={height}
        alt={extension.label}
        className="paper-shadow"
      />

      <div className="flex flex-1 flex-col px-1 pt-3 pb-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-[14px] font-medium">{extension.label}</h2>
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-faint">
            <kind.icon size={10} />
            {kind.label}
          </span>
        </div>

        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-faint">
          {extension.description}
        </p>

        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-faint">
          <span>
            {extension.designCount} style{extension.designCount === 1 ? "" : "s"}
          </span>
          {extension.factCount > 0 && (
            <span className="flex items-center gap-1 text-accent-bright">
              <Zap size={10} />
              {extension.factCount} trigger{extension.factCount === 1 ? "" : "s"}
            </span>
          )}
          {extension.noticeShapes > 0 && (
            <span
              title={`${extension.noticeShapes} of its named sizes have somewhere to show another extension's alert`}
              className="flex items-center gap-1"
            >
              <Bell size={10} />
              takes alerts
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
