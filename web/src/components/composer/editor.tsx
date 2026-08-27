"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";

import { SettingsForm } from "@/components/composer/settings-form";
import { ShapeGlyph } from "@/components/shape-badge";
import { cn } from "@/lib/cn";
import type { Field } from "@/lib/extensions/manifest";
import {
  COLUMNS,
  ROWS,
  fits,
  overlaps,
  shape as findShape,
  shapeForSize,
  type ShapeId,
} from "@/lib/shapes";

export interface PaletteEntry {
  name: string;
  label: string;
  shapes: ShapeId[];
  fields: Field[];
  defaults: Record<string, unknown>;
}

export interface EditorWidget {
  id: number;
  extension: string;
  label: string;
  settings: Record<string, unknown>;
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

type SaveState = "idle" | "saving" | "saved" | "failed";

/** Where a new widget of this size can go, scanning left to right, top to bottom. */
function firstFreeSpot(widgets: EditorWidget[], columnSpan: number, rowSpan: number) {
  for (let row = 1; row + rowSpan - 1 <= ROWS; row += 1) {
    for (let column = 1; column + columnSpan - 1 <= COLUMNS; column += 1) {
      const candidate = { column, row, columnSpan, rowSpan };
      if (!widgets.some((widget) => overlaps(candidate, widget))) return candidate;
    }
  }
  return undefined;
}

export function ScreenEditor({
  screenId,
  modelId,
  panel,
  palette,
  initialName,
  initialWidgets,
}: {
  screenId: number;
  modelId: number;
  panel: { width: number; height: number };
  palette: PaletteEntry[];
  initialName: string;
  initialWidgets: EditorWidget[];
}) {
  const [name, setName] = useState(initialName);
  const [widgets, setWidgets] = useState(initialWidgets);
  const [selectedId, setSelectedId] = useState<number | null>(initialWidgets[0]?.id ?? null);
  const [preview, setPreview] = useState<string>();
  const [rendering, setRendering] = useState(true);
  const [problems, setProblems] = useState<string[]>([]);
  const [save, setSave] = useState<SaveState>("idle");
  const [nextId, setNextId] = useState(-1);

  const canvasRef = useRef<HTMLDivElement>(null);
  const selected = widgets.find((widget) => widget.id === selectedId);
  const byName = useMemo(() => new Map(palette.map((entry) => [entry.name, entry])), [palette]);

  /* ---------------------------------------------------------------- preview */

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    setRendering(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/preview/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, widgets }),
        });

        if (!response.ok || cancelled) return;

        const raw = response.headers.get("X-Dither-Problems");
        objectUrl = URL.createObjectURL(await response.blob());

        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setProblems(raw ? JSON.parse(decodeURIComponent(raw)) : []);
        setPreview((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return objectUrl;
        });
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [widgets, modelId]);

  /* ------------------------------------------------------------------- save */

  // The first render is the state the server already has; saving it would be a
  // write on every page load.
  const settled = useRef(false);

  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }

    setSave("saving");

    const timer = setTimeout(async () => {
      const response = await fetch(`/api/screens/${screenId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, widgets }),
      });

      if (!response.ok) return setSave("failed");

      const body = (await response.json()) as { widgets: EditorWidget[] };

      // Only widgets that were local get an id back. Writing state here
      // unconditionally would retrigger this effect and save forever.
      setWidgets((current) =>
        current.some((widget) => widget.id < 0)
          ? current.map((widget, index) =>
              widget.id < 0 ? { ...widget, id: body.widgets[index]?.id ?? widget.id } : widget,
            )
          : current,
      );

      setSave("saved");
    }, 700);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets, name, screenId]);

  /* -------------------------------------------------------------- mutations */

  const update = useCallback((id: number, patch: Partial<EditorWidget>) => {
    setWidgets((current) =>
      current.map((widget) => (widget.id === id ? { ...widget, ...patch } : widget)),
    );
  }, []);

  const add = (entry: PaletteEntry) => {
    const shape = findShape(entry.shapes[0]);
    if (!shape) return;

    const spot = firstFreeSpot(widgets, shape.columns, shape.rows);
    if (!spot) {
      setProblems([`No room left for a ${shape.label.toLowerCase()} widget. Remove something first.`]);
      return;
    }

    const widget: EditorWidget = {
      id: nextId,
      extension: entry.name,
      label: entry.label,
      settings: { ...entry.defaults },
      ...spot,
    };

    setNextId((value) => value - 1);
    setWidgets((current) => [...current, widget]);
    setSelectedId(widget.id);
  };

  const remove = (id: number) => {
    setWidgets((current) => current.filter((widget) => widget.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  /** Move or resize, refusing anything that would leave the grid or overlap. */
  const place = useCallback(
    (id: number, next: { column: number; row: number; columnSpan: number; rowSpan: number }) => {
      setWidgets((current) => {
        const others = current.filter((widget) => widget.id !== id);
        if (!fits(next) || others.some((widget) => overlaps(next, widget))) return current;
        return current.map((widget) => (widget.id === id ? { ...widget, ...next } : widget));
      });
    },
    [],
  );

  /* ---------------------------------------------------------------- pointer */

  const cellSize = () => {
    const box = canvasRef.current?.getBoundingClientRect();
    return { width: (box?.width ?? 0) / COLUMNS, height: (box?.height ?? 0) / ROWS };
  };

  const startDrag = (event: React.PointerEvent, widget: EditorWidget) => {
    event.preventDefault();
    setSelectedId(widget.id);

    const cell = cellSize();
    const origin = { x: event.clientX, y: event.clientY };
    const start = { column: widget.column, row: widget.row };

    const move = (moveEvent: PointerEvent) => {
      place(widget.id, {
        column: start.column + Math.round((moveEvent.clientX - origin.x) / cell.width),
        row: start.row + Math.round((moveEvent.clientY - origin.y) / cell.height),
        columnSpan: widget.columnSpan,
        rowSpan: widget.rowSpan,
      });
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  /**
   * Resizing snaps to the shapes this extension actually has a design for.
   * You cannot drag a widget to a size it cannot draw, so the refusal never
   * needs to be explained - it simply is not reachable.
   */
  const startResize = (event: React.PointerEvent, widget: EditorWidget) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(widget.id);

    const entry = byName.get(widget.extension);
    const available = (entry?.shapes ?? []).map((id) => findShape(id)!).filter(Boolean);
    if (!available.length) return;

    const cell = cellSize();
    const origin = { x: event.clientX, y: event.clientY };
    const start = { columnSpan: widget.columnSpan, rowSpan: widget.rowSpan };

    const move = (moveEvent: PointerEvent) => {
      const wanted = {
        columns: start.columnSpan + (moveEvent.clientX - origin.x) / cell.width,
        rows: start.rowSpan + (moveEvent.clientY - origin.y) / cell.height,
      };

      const best = available
        .map((shape) => ({
          shape,
          distance: (shape.columns - wanted.columns) ** 2 + (shape.rows - wanted.rows) ** 2,
        }))
        .sort((a, b) => a.distance - b.distance)
        .map(({ shape }) => ({
          column: widget.column,
          row: widget.row,
          columnSpan: shape.columns,
          rowSpan: shape.rows,
        }))
        .find(
          (candidate) =>
            fits(candidate) &&
            !widgets.some((other) => other.id !== widget.id && overlaps(candidate, other)),
        );

      if (best) place(widget.id, best);
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  /* ------------------------------------------------------------------- view */

  const selectedEntry = selected ? byName.get(selected.extension) : undefined;

  return (
    <div className="flex h-screen">
      {/* Palette */}
      <div className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <p className="px-4 pt-5 pb-3 text-[11px] font-medium uppercase tracking-wide text-faint">
          Add to screen
        </p>
        <div className="space-y-1 px-2">
          {palette.map((entry) => (
            <button
              key={entry.name}
              type="button"
              onClick={() => add(entry)}
              className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-raised"
            >
              <Plus size={14} className="shrink-0 text-faint group-hover:text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{entry.label}</span>
                <span className="block text-[11px] text-faint">
                  {entry.shapes.length} size{entry.shapes.length === 1 ? "" : "s"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <header className="flex items-center gap-4 border-b border-line px-6 py-4">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-[17px] font-semibold tracking-tight outline-none transition-colors hover:border-line focus:border-accent/70"
          />
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-faint">
            {save === "saving" && <Loader2 size={13} className="animate-spin" />}
            {save === "saved" && <Check size={13} className="text-live" />}
            {save === "failed" && <TriangleAlert size={13} className="text-danger" />}
            {{ idle: "", saving: "Saving", saved: "Saved", failed: "Not saved" }[save]}
          </span>
        </header>

        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-5xl">
            <div
              ref={canvasRef}
              className="paper-shadow relative w-full overflow-hidden rounded-lg bg-white"
              style={{ aspectRatio: `${panel.width} / ${panel.height}` }}
              onPointerDown={(event) => event.target === event.currentTarget && setSelectedId(null)}
            >
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="What the display will show"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{ imageRendering: "pixelated" }}
                />
              )}

              {/* Grid guides, so the six-by-six is visible while arranging. */}
              <div
                className="pointer-events-none absolute inset-0 grid opacity-[0.09]"
                style={{
                  gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
                  gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                }}
              >
                {Array.from({ length: COLUMNS * ROWS }, (_, index) => (
                  <div key={index} className="border-r border-b border-black" />
                ))}
              </div>

              {widgets.map((widget) => {
                const active = widget.id === selectedId;

                return (
                  <div
                    key={widget.id}
                    onPointerDown={(event) => startDrag(event, widget)}
                    className={cn(
                      "absolute cursor-grab touch-none transition-[box-shadow,background-color]",
                      active
                        ? "bg-[oklch(0.78_0.16_88/0.14)] shadow-[inset_0_0_0_2px_oklch(0.7_0.15_88)]"
                        : "hover:bg-[oklch(0.78_0.16_88/0.07)] hover:shadow-[inset_0_0_0_1.5px_oklch(0.7_0.15_88/0.6)]",
                    )}
                    style={{
                      left: `${((widget.column - 1) / COLUMNS) * 100}%`,
                      top: `${((widget.row - 1) / ROWS) * 100}%`,
                      width: `${(widget.columnSpan / COLUMNS) * 100}%`,
                      height: `${(widget.rowSpan / ROWS) * 100}%`,
                    }}
                  >
                    {active && (
                      <span
                        onPointerDown={(event) => startResize(event, widget)}
                        className="absolute -right-1 -bottom-1 h-4 w-4 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-[oklch(0.7_0.15_88)]"
                      />
                    )}
                  </div>
                );
              })}

              {rendering && (
                <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white">
                  rendering
                </span>
              )}
            </div>

            <p className="mt-3 text-center text-[12px] text-faint">
              {panel.width}x{panel.height}, dithered exactly as the device will receive it.
            </p>

            {problems.length > 0 && (
              <ul className="mt-4 space-y-1.5 rounded-lg border border-warn/40 bg-warn/5 p-4">
                {problems.map((problem) => (
                  <li key={problem} className="flex gap-2 text-[12px] leading-relaxed text-warn">
                    <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                    {problem}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Inspector */}
      <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface">
        {!selected || !selectedEntry ? (
          <div className="p-6">
            <p className="text-[13px] leading-relaxed text-faint">
              Pick something on the screen to change its settings, or add a widget from the left.
            </p>
          </div>
        ) : (
          <div className="p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-faint">
                  {selectedEntry.label}
                </p>
                <input
                  value={selected.label}
                  onChange={(event) => update(selected.id, { label: event.target.value })}
                  placeholder="Name this one"
                  className="mt-1 w-full rounded-md border border-transparent bg-transparent py-0.5 text-[14px] font-semibold outline-none transition-colors hover:border-line focus:border-accent/70"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(selected.id)}
                title="Remove from screen"
                className="shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-danger/15 hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Size</p>
            <div className="mb-5 flex flex-wrap gap-1.5">
              {selectedEntry.shapes.map((id) => {
                const shape = findShape(id)!;
                const current = shapeForSize(selected.columnSpan, selected.rowSpan)?.id === id;

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      place(selected.id, {
                        column: selected.column,
                        row: selected.row,
                        columnSpan: shape.columns,
                        rowSpan: shape.rows,
                      })
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
                      current
                        ? "border-accent/60 bg-accent/10 text-ink"
                        : "border-line bg-raised text-muted hover:text-ink",
                    )}
                  >
                    <ShapeGlyph
                      shape={shape}
                      className={cn("h-3 w-3", current ? "text-accent" : "text-faint")}
                    />
                    {shape.label}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-line pt-5">
              <SettingsForm
                fields={selectedEntry.fields}
                values={selected.settings}
                onChange={(key, value) =>
                  update(selected.id, { settings: { ...selected.settings, [key]: value } })
                }
              />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
