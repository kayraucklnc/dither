"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronUp, CircleHelp, Flag, Lock, Timer } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { cn } from "@/lib/cn";
import { NODE_WIDTH } from "@/lib/flow/layout";

const seconds = (value: number) =>
  value % 3600 === 0 ? `${value / 3600}h` : value % 60 === 0 ? `${value / 60}m` : `${value}s`;

export interface QuestionData extends Record<string, unknown> {
  question: string;
  actual?: string;
  /** undefined when this node was not reached on the current walk. */
  answer?: boolean;
  isRoot: boolean;
  /** Nothing points at it, so the walk never gets here. */
  orphan?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
}

export function QuestionNode({ data, selected }: NodeProps & { data: QuestionData }) {
  const reached = data.answer !== undefined;

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        "rounded-xl border bg-surface px-3 py-2.5 transition-colors",
        selected ? "border-accent" : reached ? "border-live/50" : "border-line",
        // A node nothing points at is kept, shown, and faded - not hidden, and
        // certainly not deleted out from under someone mid-build.
        data.orphan && "border-dashed opacity-60",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-line-strong" />

      <div className="flex items-center gap-1.5">
        {data.isRoot ? (
          <Flag size={11} className="shrink-0 text-accent-bright" />
        ) : (
          <CircleHelp size={11} className="shrink-0 text-faint" />
        )}
        <span className="text-[10px] font-medium uppercase tracking-wide text-faint">
          {data.orphan ? "Not connected" : data.isRoot ? "Asked first" : "Then if"}
        </span>

        {/* Priority is depth, so raising a check is literally moving it up. */}
        <span className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            title="Ask this earlier"
            disabled={!data.canMoveUp}
            onClick={(event) => {
              event.stopPropagation();
              data.onMove("up");
            }}
            className={cn(
              "rounded p-0.5 transition-colors",
              data.canMoveUp ? "text-faint hover:bg-surface hover:text-ink" : "text-faint/30",
            )}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            title="Ask this later"
            disabled={!data.canMoveDown}
            onClick={(event) => {
              event.stopPropagation();
              data.onMove("down");
            }}
            className={cn(
              "rounded p-0.5 transition-colors",
              data.canMoveDown ? "text-faint hover:bg-surface hover:text-ink" : "text-faint/30",
            )}
          >
            <ChevronDown size={13} />
          </button>
        </span>
      </div>

      <p className="mt-1 text-[13px] leading-snug">{data.question}</p>

      {data.actual && (
        <p className="mt-1 font-mono text-[11px] text-faint">now: {data.actual}</p>
      )}

      {/* Two exits, coloured and labelled, so the branch you are looking at is
          unambiguous even when the tree is zoomed out. */}
      <div className="mt-2.5 flex items-center justify-end gap-2 text-[10px] font-medium">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 transition-colors",
            data.answer === true ? "bg-live/20 text-live" : "bg-live/10 text-live/60",
          )}
        >
          yes
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 transition-colors",
            data.answer === false ? "bg-no/20 text-no" : "bg-no/10 text-no/60",
          )}
        >
          no
        </span>
      </div>

      <Handle
        id="yes"
        type="source"
        position={Position.Right}
        style={{ top: "64%" }}
        className="!h-2 !w-2 !border-0 !bg-live"
      />
      <Handle
        id="no"
        type="source"
        position={Position.Right}
        style={{ top: "88%" }}
        className="!h-2 !w-2 !border-0 !bg-[oklch(0.72_0.13_20)]"
      />
    </div>
  );
}

export interface ScreenData extends Record<string, unknown> {
  label: string;
  screenId: number | null;
  screenName: string | null;
  refreshSeconds: number | null;
  deviceRefreshSeconds: number;
  holdSeconds: number;
  isShowing: boolean;
  isRoot: boolean;
  orphan?: boolean;
  panel: { width: number; height: number };
  modelId: number;
  /** So the thumbnail includes this device's notices, as the panel would. */
  deviceId: number;
  /** Whatever the Test tab is pretending, so the picture agrees with the trace. */
  previewSuffix: string;
}

export function ScreenNode({ data, selected }: NodeProps & { data: ScreenData }) {
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        "rounded-xl border bg-surface transition-colors",
        selected ? "border-accent" : data.isShowing ? "border-live" : "border-line",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-line-strong" />

      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-2">
        {data.isRoot && <Flag size={11} className="shrink-0 text-accent-bright" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {data.label}
          {data.orphan && <span className="ml-1.5 text-[10px] text-faint">not connected</span>}
        </span>
        {data.holdSeconds > 0 && (
          <span
            title={`Holds for ${seconds(data.holdSeconds)} once shown`}
            className="flex shrink-0 items-center gap-0.5 text-[10px] text-faint"
          >
            <Lock size={9} />
            {seconds(data.holdSeconds)}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-faint">
          <Timer size={9} />
          {seconds(data.refreshSeconds ?? data.deviceRefreshSeconds)}
        </span>
      </div>

      <div className="px-2">
        {data.screenId ? (
          <ScreenPreview
            src={`/api/preview/screen/${data.screenId}?modelId=${data.modelId}&deviceId=${data.deviceId}${data.previewSuffix}`}
            width={data.panel.width}
            height={data.panel.height}
            alt={data.screenName ?? data.label}
            className="rounded"
          />
        ) : (
          <div
            className="grid place-items-center rounded border border-dashed border-line text-[11px] text-faint"
            style={{ aspectRatio: `${data.panel.width} / ${data.panel.height}` }}
          >
            Pick a screen
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="min-w-0 truncate text-[11px] text-faint">
          {data.screenName ?? "Nothing chosen"}
        </span>
        {data.isShowing && (
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-live">
            <span className="h-1.5 w-1.5 rounded-full bg-live" />
            on screen
          </span>
        )}
      </div>
    </div>
  );
}
