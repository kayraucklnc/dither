"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";

import { LayoutPicker } from "@/components/composer/layout-picker";
import { SettingsForm } from "@/components/composer/settings-form";
import { ScreenPreview } from "@/components/screen-preview";
import { ShapeGlyph } from "@/components/shape-badge";
import { cn } from "@/lib/cn";
import { layout as findLayout, matching, type Layout } from "@/lib/layouts";
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
  /** The biggest shape it draws, so the palette can show what it looks like. */
  headline: ShapeId;
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
  const [dragging, setDragging] = useState(false);
  const [armed, setArmed] = useState<Layout | undefined>(() => matching(initialWidgets));

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
    // With a layout armed, a new widget takes the next free slot at that
    // slot's size. That is what makes "top half this, bottom half that" two
    // clicks rather than a drag and a resize.
    const slot = armed?.slots.find(
      (candidate) => !widgets.some((widget) => overlaps(candidate, widget)),
    );

    const spot =
      slot ??
      (() => {
        const shape = findShape(entry.shapes[0]);
        return shape ? firstFreeSpot(widgets, shape.columns, shape.rows) : undefined;
      })();

    if (!spot) {
      setProblems([
        armed
          ? `Every slot in ${armed.label.toLowerCase()} is taken. Remove something, or pick another layout.`
          : "No room left. Remove something first.",
      ]);
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

  /** Arm a layout, and move whatever is already placed into its slots. */
  const applyLayout = (id: string) => {
    const chosen = findLayout(id);
    if (!chosen) return;

    setArmed(chosen);

    setWidgets((current) => {
      if (!current.length) return current;

      const seated = current.slice(0, chosen.slots.length).map((widget, index) => ({
        ...widget,
        ...chosen.slots[index],
      }));

      const dropped = current.length - seated.length;
      setProblems(
        dropped > 0
          ? [`${chosen.label} has ${chosen.slots.length} slots; ${dropped} widget${dropped === 1 ? " was" : "s were"} left off.`]
          : [],
      );

      return seated;
    });
  };

  /* -------------------------------------------------------------- shortcuts */

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never steal a key from something being typed into.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === "Escape") return setSelectedId(null);

      if ((event.key === "Backspace" || event.key === "Delete") && selectedId !== null) {
        event.preventDefault();
        remove(selectedId);
      }
    };

    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /* ---------------------------------------------------------------- pointer */

  const cellSize = () => {
    const box = canvasRef.current?.getBoundingClientRect();
    return { width: (box?.width ?? 0) / COLUMNS, height: (box?.height ?? 0) / ROWS };
  };

  const startDrag = (event: React.PointerEvent, widget: EditorWidget) => {
    event.preventDefault();
    setSelectedId(widget.id);
    setDragging(true);

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
      setDragging(false);
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
    setDragging(true);

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
      setDragging(false);
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
      <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
        <p className="shrink-0 px-4 pt-5 pb-3 text-[11px] font-medium uppercase tracking-wide text-faint">
          Add to screen
        </p>
        <div className="space-y-1.5 px-2 pb-4">
          {palette.map((entry) => (
            <button
              key={entry.name}
              type="button"
              onClick={() => add(entry)}
              className="group w-full rounded-lg p-1.5 text-left transition-colors hover:bg-raised"
            >
              <ScreenPreview
                src={`/api/preview/extension/${entry.name}?shape=${entry.headline}`}
                width={panel.width}
                height={panel.height}
                alt={entry.label}
                className="rounded"
              />
              <span className="mt-1.5 flex items-center gap-1.5 px-0.5">
                <Plus size={12} className="shrink-0 text-faint group-hover:text-accent-bright" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{entry.label}</span>
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

        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8">
          <div className="w-full max-w-5xl">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
              Arrangement
            </p>
            <LayoutPicker value={armed?.id} onChange={applyLayout} />
          </div>

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
                  /* The canvas is fit to width, so it is nearly always shown
                     smaller than 800x480. Nearest-neighbour at that scale
                     turns a careful dither into aliased noise; smoothed, it
                     reads as the greys the panel actually makes. */
                />
              )}

              {/* Guides only while arranging. A permanent grid over the render
                  makes the picture look dirty and hides what is actually there. */}
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 grid transition-opacity",
                  dragging ? "opacity-[0.22]" : "opacity-0",
                )}
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
                const entry = byName.get(widget.extension);

                return (
                  <div
                    key={widget.id}
                    onPointerDown={(event) => startDrag(event, widget)}
                    className="group absolute cursor-grab touch-none"
                    style={{
                      left: `${((widget.column - 1) / COLUMNS) * 100}%`,
                      top: `${((widget.row - 1) / ROWS) * 100}%`,
                      width: `${(widget.columnSpan / COLUMNS) * 100}%`,
                      height: `${(widget.rowSpan / ROWS) * 100}%`,
                    }}
                  >
                    {/* An outline on every widget, always. Without it a screen of
                        four quarters is one white rectangle you cannot read. */}
                    <span
                      className={cn(
                        "pointer-events-none absolute inset-0 rounded-[3px] transition-all",
                        active
                          ? "shadow-[inset_0_0_0_2px_oklch(0.62_0.21_285)]"
                          : "shadow-[inset_0_0_0_1px_oklch(0.62_0.21_285/0.45)] group-hover:shadow-[inset_0_0_0_2px_oklch(0.62_0.21_285/0.8)]",
                      )}
                    />

                    {/* Its name, so you can tell two quarters apart at a glance. */}
                    <span
                      className={cn(
                        "pointer-events-none absolute top-1 left-1 max-w-[calc(100%-0.5rem)] truncate",
                        "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                        active
                          ? "bg-[oklch(0.55_0.216_285)] text-white"
                          : "bg-[oklch(0.55_0.216_285/0.75)] text-white opacity-0 group-hover:opacity-100",
                      )}
                    >
                      {widget.label || entry?.label || widget.extension}
                    </span>

                    {active && (
                      <span
                        onPointerDown={(event) => startResize(event, widget)}
                        className="absolute -right-1.5 -bottom-1.5 h-4 w-4 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-[oklch(0.55_0.216_285)]"
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
              {panel.width}×{panel.height}, dithered exactly as the device will receive it.
              {selected && <span className="ml-2 opacity-70">Backspace removes the selection.</span>}
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
