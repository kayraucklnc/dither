// The Dither mark: a "D" drawn as dithered pixels — the whole idea of the
// product in one glyph. The same grid is drawn by the firmware's "Not set up"
// screen. Fill is currentColor.

export const MARK = [
  "####.#.#.#.#.#.#",
  "#########.###.#.",
  "##.###.#.#.#.#.#",
  "###########.#.#.",
  ".#.#.#.#.#.#...#",
  "#####.###.#.#.#.",
  "##.#.#.#.#.#.#..",
  "#######.#.#.#.#.",
  ".#.#.#.#...#....",
  "#.###.#.#.#.#.#.",
  ".#.#.#.#.#......",
  "###.#.#.#.#.#.#.",
  ".#.#...#........",
  "#.#.#.#.#.#...#.",
  ".#.#.#..........",
  "#.#.#.#.#.#.#...",
];

export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label="Dither" className={className} shapeRendering="crispEdges">
      <g fill="currentColor">
        {MARK.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null)))}
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2 select-none">
      <Mark size={20} className="text-accent" />
      <span className="text-[17px] font-semibold tracking-tight">Dither</span>
    </div>
  );
}
