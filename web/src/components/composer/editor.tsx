"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Loader2, Plus, Radio, Trash2, TriangleAlert } from "lucide-react";

import { LayoutPicker } from "@/components/composer/layout-picker";
import { SettingsForm } from "@/components/composer/settings-form";
import { SizePicker } from "@/components/composer/size-picker";
import { StylePicker } from "@/components/composer/style-picker";
import { ScreenPreview } from "@/components/screen-preview";
import { cn } from "@/lib/cn";
import { chooseDesign, nearestDrawable, supportsSize, type Design } from "@/lib/designs";
import { sameQuestion } from "@/lib/extensions/question";
import { layout as findLayout, matching, type Layout } from "@/lib/layouts";
import type { Field } from "@/lib/extensions/manifest";
import {
  COLUMNS,
  ROWS,
  fits,
  overlaps,
  sizeLabel,
  sizeOf,
  sizeToken,
  type Size,
} from "@/lib/shapes";

export interface PaletteEntry {
  name: string;
  label: string;
  /** The looks it offers and the sizes each covers. The whole size vocabulary. */
  designs: Design[];
  fields: Field[];
  defaults: Record<string, unknown>;
  /** The biggest size it draws, so the palette can show what it looks like. */
  headline: Size;
  /** Designs whose template has somewhere to show another extension's alert. */
  noticeDesigns: string[];
  /** How many values it reports, so "also watch this" is only offered when it does. */
  factCount: number;
  /** Where "what can these settings do" is answered, for hiding fields. */
  capabilitiesFrom?: string;
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
  /** The style chosen for it. Empty means "whichever design fits best". */
  design: string;
  /** Pinned as this screen's alert area. */
  hostsNotices: boolean;
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
  const [dataVersion, setDataVersion] = useState(0);
  const [watched, setWatched] = useState<{ extension: string; settings: Record<string, unknown> }[]>([]);
  const [watching, setWatching] = useState(false);
  /** A refusal, and the widget it was about - so picking another clears it. */
  const [watchProblem, setWatchProblem] = useState<{ widgetId: number; said: string }>();
  const [fetching, setFetching] = useState(false);
  const [armed, setArmed] = useState<Layout | undefined>(() => matching(initialWidgets));

  const canvasRef = useRef<HTMLDivElement>(null);
  const selected = widgets.find((widget) => widget.id === selectedId);
  const byName = useMemo(() => new Map(palette.map((entry) => [entry.name, entry])), [palette]);

  /**
   * Which questions are already being watched.
   *
   * A widget draws; a source lets a rule decide. They stay separate on purpose
   * - you can decide on a station you never display - but wanting both for the
   * same thing is the common case, and it should be one click rather than a
   * second trip through a different page to retype the same settings.
   */
  const readWatched = useCallback(
    () =>
      fetch("/api/sources")
        .then((response) => (response.ok ? response.json() : undefined))
        .then((body) => body && setWatched(body.sources)),
    [],
  );

  useEffect(() => {
    readWatched();
  }, [readWatched, dataVersion]);

  const isWatched = (widget: EditorWidget) => watched.some((source) => sameQuestion(source, widget));

  /**
   * Watch this too, and say so.
   *
   * The click is not over when the request is sent: the server asks the world
   * before it answers, which takes as long as that takes, and the only sign it
   * worked is this box turning into a sentence - which needs the source list
   * read again. Until then the button says what it is doing and refuses a
   * second click, because it used to accept one silently and the second click
   * is how somebody ends up with four of these.
   */
  const watch = async (widget: EditorWidget) => {
    setWatching(true);
    setWatchProblem(undefined);

    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extension: widget.extension,
          label: widget.label || undefined,
          settings: widget.settings,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        setWatchProblem({
          widgetId: widget.id,
          said: body?.error ?? "That could not be watched. Try again.",
        });
        return;
      }

      await readWatched();
      // A source fetches as it is created, so a widget asking the same
      // question has an answer now where it may have had a stand-in before.
      setDataVersion((value) => value + 1);
    } catch {
      setWatchProblem({ widgetId: widget.id, said: "Dither could not be reached." });
    } finally {
      setWatching(false);
    }
  };

  /* ---------------------------------------------------------------- preview */

  /**
   * Settings decide what a widget asks the world, so changing them makes the
   * answer it is holding wrong. Refetching is debounced hard - this fires on
   * keystrokes - and only for widgets the server already knows about.
   */
  const settingsSignature = JSON.stringify(
    widgets.filter((widget) => widget.id > 0).map((widget) => [widget.id, widget.settings]),
  );
  const firstSettings = useRef(true);

  useEffect(() => {
    if (firstSettings.current) {
      firstSettings.current = false;
      return;
    }

    const ids = widgets.filter((widget) => widget.id > 0).map((widget) => widget.id);
    if (!ids.length) return;

    const timer = setTimeout(async () => {
      setFetching(true);

      await fetch("/api/widgets/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetIds: ids }),
      }).catch(() => undefined);

      setFetching(false);
      setDataVersion((value) => value + 1);
    }, 900);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsSignature]);

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
  }, [widgets, modelId, dataVersion]);

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

    // With no layout armed, a new widget lands at whatever size the extension
    // was really designed for and there is room for. Sizes are free, so
    // "biggest first" would drop every widget in as a full screen.
    const spot =
      (slot && supportsSize(entry.designs, sizeOf(slot)) ? slot : undefined) ??
      (() => {
        for (const design of [...entry.designs].sort(
          (a, b) =>
            b.nominal.columns * b.nominal.rows - a.nominal.columns * a.nominal.rows,
        )) {
          const found = firstFreeSpot(widgets, design.nominal.columns, design.nominal.rows);
          if (found) return found;
        }
        return undefined;
      })();

    if (!spot) {
      setProblems([
        armed
          ? `${entry.label} does not fit any free slot in ${armed.label.toLowerCase()}. Remove something, or pick another layout.`
          : "No room left. Remove something first.",
      ]);
      return;
    }

    const widget: EditorWidget = {
      id: nextId,
      extension: entry.name,
      label: entry.label,
      settings: { ...entry.defaults },
      design: "",
      hostsNotices: false,
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

      const refused: string[] = [];

      const seated = current.slice(0, chosen.slots.length).map((widget, index) => {
        const slot = chosen.slots[index];
        const entry = byName.get(widget.extension);

        // A layout is a starting point, not a mould. If a slot is a size this
        // extension refuses to draw, it keeps the size it had rather than
        // becoming a hatched gap nobody asked for.
        if (entry && !supportsSize(entry.designs, sizeOf(slot))) {
          refused.push(
            `${widget.label || entry.label} has no design for ${sizeLabel(sizeOf(slot))}, so it kept its size.`,
          );
          return widget;
        }

        return { ...widget, ...slot };
      });

      const dropped = current.length - seated.length;
      setProblems([
        ...refused,
        ...(dropped > 0
          ? [`${chosen.label} has ${chosen.slots.length} slots; ${dropped} widget${dropped === 1 ? " was" : "s were"} left off.`]
          : []),
      ]);

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
   * Resizing follows the pointer, cell by cell, and only stops where the
   * extension has a design.
   *
   * It used to snap between eight fixed shapes, which is why a widget felt
   * like it jumped rather than resized. Now the grid is free: the drag asks
   * for a size, and the nearest one this extension will actually draw - and
   * that nothing else is sitting on - is what it gets. The refusal never needs
   * explaining, because it is simply not reachable.
   */
  const startResize = (event: React.PointerEvent, widget: EditorWidget) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(widget.id);
    setDragging(true);

    const entry = byName.get(widget.extension);
    const designs = entry?.designs ?? [];
    if (!designs.length) return;

    const cell = cellSize();
    const origin = { x: event.clientX, y: event.clientY };
    const start = { columnSpan: widget.columnSpan, rowSpan: widget.rowSpan };

    const move = (moveEvent: PointerEvent) => {
      const wanted = {
        columns: Math.round(start.columnSpan + (moveEvent.clientX - origin.x) / cell.width),
        rows: Math.round(start.rowSpan + (moveEvent.clientY - origin.y) / cell.height),
      };

      const best = nearestDrawable(designs, wanted, (size) => {
        const candidate = {
          column: widget.column,
          row: widget.row,
          columnSpan: size.columns,
          rowSpan: size.rows,
        };

        return (
          fits(candidate) &&
          !widgets.some((other) => other.id !== widget.id && overlaps(candidate, other))
        );
      });

      if (best) {
        place(widget.id, {
          column: widget.column,
          row: widget.row,
          columnSpan: best.columns,
          rowSpan: best.rows,
        });
      }
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

  /**
   * Whether the design that will actually draw this widget renders alerts.
   *
   * Not "does the extension accept them" - a design does or does not have the
   * strip, and which design draws a widget now depends on its size *and* on
   * the style chosen for it. Getting this wrong routes an alert to a widget
   * that silently drops it.
   */
  const hostsAlerts = (widget: EditorWidget) => {
    const entry = byName.get(widget.extension);
    if (!entry) return false;

    const design = chooseDesign(entry.designs, sizeOf(widget), widget.design || undefined);
    return design !== undefined && entry.noticeDesigns.includes(design.key);
  };

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
                src={`/api/preview/extension/${entry.name}?size=${sizeToken(entry.headline)}`}
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

              {(rendering || fetching) && (
                <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white">
                  {fetching ? "fetching" : "rendering"}
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
            <div className="mb-5">
              <SizePicker
                designs={selectedEntry.designs}
                value={sizeOf(selected)}
                blocked={(size) =>
                  !fits({
                    column: selected.column,
                    row: selected.row,
                    columnSpan: size.columns,
                    rowSpan: size.rows,
                  }) ||
                  widgets.some(
                    (other) =>
                      other.id !== selected.id &&
                      overlaps(
                        {
                          column: selected.column,
                          row: selected.row,
                          columnSpan: size.columns,
                          rowSpan: size.rows,
                        },
                        other,
                      ),
                  )
                }
                onChange={(size) =>
                  place(selected.id, {
                    column: selected.column,
                    row: selected.row,
                    columnSpan: size.columns,
                    rowSpan: size.rows,
                  })
                }
              />
            </div>

            <div className="mb-5">
              <StylePicker
                extension={selected.extension}
                designs={selectedEntry.designs}
                size={sizeOf(selected)}
                settings={selected.settings}
                value={selected.design}
                onChange={(design) => update(selected.id, { design })}
              />
            </div>

            {(() => {
              const takesAlerts = hostsAlerts(selected);
              const pinnedElsewhere = widgets.some(
                (widget) => widget.hostsNotices && widget.id !== selected.id,
              );

              // Without a pin the largest design that can take alerts is used,
              // because room is what an alert needs. Saying so is the point:
              // where they land should never be a mystery.
              const auto = [...widgets]
                .filter(hostsAlerts)
                .sort(
                  (a, b) =>
                    b.columnSpan * b.rowSpan - a.columnSpan * a.rowSpan ||
                    a.row - b.row ||
                    a.column - b.column,
                )[0];

              if (!takesAlerts) {
                return (
                  <div className="mb-5 rounded-lg border border-line bg-ground/40 p-3">
                    <p className="text-[12px] text-faint">
                      This size has no alert strip, so no alert from another extension will appear
                      on it.
                    </p>
                  </div>
                );
              }

              const isHost = selected.hostsNotices || (!pinnedElsewhere && auto?.id === selected.id);

              return (
                <div className="mb-5 rounded-lg border border-line bg-ground/40 p-3">
                  <button
                    type="button"
                    onClick={() =>
                      setWidgets((current) =>
                        current.map((widget) =>
                          widget.id === selected.id
                            ? { ...widget, hostsNotices: !selected.hostsNotices }
                            : { ...widget, hostsNotices: false },
                        ),
                      )
                    }
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <Bell
                      size={13}
                      className={cn("shrink-0", isHost ? "text-accent-bright" : "text-faint")}
                    />
                    <span className="flex-1 text-[12px] font-medium">Alerts appear here</span>
                    <span
                      className={cn(
                        "h-4 w-7 shrink-0 rounded-full border p-0.5 transition-colors",
                        selected.hostsNotices ? "border-accent/60 bg-accent/30" : "border-line bg-ground",
                      )}
                    >
                      <span
                        className={cn(
                          "block h-2.5 w-2.5 rounded-full transition-transform",
                          selected.hostsNotices ? "translate-x-3 bg-accent" : "bg-faint",
                        )}
                      />
                    </span>
                  </button>

                  <p className="mt-2 text-[11px] leading-relaxed text-faint">
                    {selected.hostsNotices
                      ? "Pinned. Alerts from any extension land here."
                      : isHost
                        ? "Nothing is pinned, so alerts land here — it is the largest design on this screen that takes them."
                        : `Alerts land on ${auto?.label || auto?.extension || "another widget"} unless you pin them here.`}
                  </p>
                </div>
              );
            })()}

            {selectedEntry.factCount > 0 && (
              <div className="mb-5 rounded-lg border border-line bg-ground/40 p-3">
                {isWatched(selected) ? (
                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-faint">
                    <Radio size={12} className="mt-0.5 shrink-0 text-accent-bright" />
                    Also watched, so any device can decide on it. Showing and deciding share one
                    fetch.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={watching}
                      onClick={() => watch(selected)}
                      className={cn(
                        "flex w-full items-center justify-center gap-2 rounded-md border border-line",
                        "bg-raised px-3 py-1.5 text-[12px] text-muted transition-colors",
                        watching ? "opacity-60" : "hover:text-ink",
                      )}
                    >
                      {watching ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Radio size={12} />
                      )}
                      {watching ? "Asking it now" : "Also watch this"}
                    </button>

                    {watchProblem?.widgetId === selected.id && (
                      <p className="mt-2 flex gap-2 text-[11px] leading-relaxed text-warn">
                        <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                        {watchProblem.said}
                      </p>
                    )}

                    <p className="mt-2 text-[11px] leading-relaxed text-faint">
                      Drawing it and deciding on it are separate - you can branch on a station you
                      never display. This adds a source with these settings, sharing the same fetch.
                    </p>
                  </>
                )}
              </div>
            )}

            <div className="border-t border-line pt-5">
              <SettingsForm
                fields={selectedEntry.fields}
                capabilitiesFrom={selectedEntry.capabilitiesFrom}
                design={
                  chooseDesign(
                    selectedEntry.designs,
                    sizeOf(selected),
                    selected.design || undefined,
                  )?.key ?? ""
                }
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
