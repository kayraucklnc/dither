"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Home, Timer } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { cn } from "@/lib/cn";

export interface StateNodeData extends Record<string, unknown> {
  name: string;
  screenId: number | null;
  screenName: string | null;
  refreshSeconds: number | null;
  deviceRefreshSeconds: number;
  isInitial: boolean;
  isCurrent: boolean;
  panel: { width: number; height: number };
  modelId: number;
}

const humanise = (seconds: number) =>
  seconds % 3600 === 0
    ? `${seconds / 3600}h`
    : seconds % 60 === 0
      ? `${seconds / 60}m`
      : `${seconds}s`;

/**
 * A state is "show this screen, and while you are here wake this often".
 * Showing the screen itself rather than its name is the point: the graph
 * should be readable as a set of pictures, not as a list of identifiers.
 */
export function StateNode({ data, selected }: NodeProps & { data: StateNodeData }) {
  const refresh = data.refreshSeconds ?? data.deviceRefreshSeconds;

  return (
    <div
      className={cn(
        "w-52 rounded-xl border bg-surface transition-colors",
        selected ? "border-accent" : data.isCurrent ? "border-live/60" : "border-line",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-line-strong" />

      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-2">
        {data.isInitial && (
          <span title="Starting state" className="shrink-0 leading-none text-faint">
            <Home size={11} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{data.name}</span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-faint">
          <Timer size={10} />
          {humanise(refresh)}
        </span>
      </div>

      <div className="px-2">
        {data.screenId ? (
          <ScreenPreview
            src={`/api/preview/screen/${data.screenId}?modelId=${data.modelId}`}
            width={data.panel.width}
            height={data.panel.height}
            alt={data.screenName ?? data.name}
            className="rounded"
          />
        ) : (
          <div
            className="grid place-items-center rounded border border-dashed border-line text-[11px] text-faint"
            style={{ aspectRatio: `${data.panel.width} / ${data.panel.height}` }}
          >
            No screen chosen
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="min-w-0 truncate text-[11px] text-faint">
          {data.screenName ?? "Nothing to show"}
        </span>
        {data.isCurrent && (
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-live">
            <span className="h-1.5 w-1.5 rounded-full bg-live" />
            live
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-line-strong" />
    </div>
  );
}
