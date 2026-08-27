"use client";

import { cn } from "@/lib/cn";
import { LAYOUTS, type Layout } from "@/lib/layouts";
import { COLUMNS, ROWS } from "@/lib/shapes";

/** A layout drawn as the panel it produces, which reads faster than its name. */
function Diagram({ layout, active }: { layout: Layout; active: boolean }) {
  return (
    <span
      aria-hidden
      className="grid h-5 w-8 gap-px"
      style={{
        gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
    >
      {layout.slots.map((slot, index) => (
        <span
          key={index}
          className={cn("rounded-[1px]", active ? "bg-accent-ink/80" : "bg-current")}
          style={{
            gridColumn: `${slot.column} / span ${slot.columnSpan}`,
            gridRow: `${slot.row} / span ${slot.rowSpan}`,
          }}
        />
      ))}
    </span>
  );
}

export function LayoutPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {LAYOUTS.map((layout) => {
        const active = value === layout.id;

        return (
          <button
            key={layout.id}
            type="button"
            title={layout.hint}
            onClick={() => onChange(layout.id)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
              active
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            <Diagram layout={layout} active={active} />
            {layout.label}
          </button>
        );
      })}
    </div>
  );
}
