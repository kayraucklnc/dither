import { cn } from "@/lib/cn";
import { COLUMNS, ROWS, type Size } from "@/lib/shapes";

/**
 * A size drawn as the fraction of the panel it takes up. A twelve-by-twelve
 * thumbnail says "half width" faster than the words do - and says "7×5", which
 * has no words at all, just as fast.
 */
export function ShapeGlyph({ size, className }: { size: Size; className?: string }) {
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
        style={{ gridColumn: `1 / span ${size.columns}`, gridRow: `1 / span ${size.rows}` }}
      />
    </span>
  );
}
