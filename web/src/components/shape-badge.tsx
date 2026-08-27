import { cn } from "@/lib/cn";
import { COLUMNS, ROWS, type Shape } from "@/lib/shapes";

/**
 * A shape drawn as the fraction of the panel it takes up. A six-by-six
 * thumbnail says "half width" faster than the words do.
 */
export function ShapeGlyph({ shape, className }: { shape: Shape; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid gap-px", className)}
      style={{
        gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
    >
      <span
        className="rounded-[1px] bg-current"
        style={{ gridColumn: `1 / span ${shape.columns}`, gridRow: `1 / span ${shape.rows}` }}
      />
    </span>
  );
}
