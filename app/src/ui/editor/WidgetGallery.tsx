// Every widget, drawn by the real renderer at its default size, found by name or by kind.

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { CornerDownLeft, Lock, Search, X } from "lucide-react";
import type { Compiled } from "@/compiler";
import { cellsToBox } from "@/compiler/grid";
import { sampleValues } from "@/compiler/sample";
import { envOf, missingAccounts } from "@/compiler/widgets";
import { EXTENSIONS } from "@/extensions";
import type { Extension } from "@/extensions/api";
import type { Project } from "@/project/schema";
import { createProject } from "@/project/starters";
import { renderScreen } from "@/runtime/render";
import { compileInBrowser } from "@/state/compile";
import { Button, Dialog } from "../kit";
import { PanelCanvas } from "../PanelCanvas";
import { storeFor } from "../Preview";
import { ExtensionIcon } from "./Inspector";

type Category = Extension["category"];

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "time", label: "Time" },
  { id: "weather", label: "Weather" },
  { id: "data", label: "Data" },
  { id: "text", label: "Text" },
  { id: "picture", label: "Pictures" },
  { id: "device", label: "Panel" },
];
const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])) as Record<Category, string>;

const PREVIEW_ACCOUNTS: Project["accounts"] = {
  google: [{ id: "preview", clientId: "preview", clientSecret: "preview", refreshToken: "preview", email: "", label: "Personal" }],
  stripe: { key: "rk_test_preview", name: "" },
};

const ACCOUNT_NAMES: Record<string, string> = { google: "Google", stripe: "Stripe" };

// Thumbnails compile in the browser, so each is compiled once per look (zone, language, units, place, pictures).
const compiledThumbs = new WeakMap<object, Map<string, Promise<Compiled | null>>>();

function thumbFor(ext: Extension, project: Project): Promise<Compiled | null> {
  const byImages = compiledThumbs.get(project.images) ?? new Map<string, Promise<Compiled | null>>();
  compiledThumbs.set(project.images, byImages);
  const key = JSON.stringify([ext.id, ext.size.default, project.timezone, project.language, project.units, project.place]);
  const hit = byImages.get(key);
  if (hit) return hit;
  const [w, h] = ext.size.default;
  const blank = createProject({ starter: "blank", timezone: project.timezone, language: project.language, units: project.units, place: project.place });
  const widget = { id: "thumb", type: ext.id, x: 0, y: 0, w, h, frame: "none" as const, settings: (ext.example ?? {}) as Record<string, unknown> };
  // A locked widget still shows what it will look like: its example data, behind stand-in accounts.
  const p: Project = { ...blank, images: project.images, accounts: PREVIEW_ACCOUNTS, screens: [{ ...blank.screens[0], widgets: [widget] }, ...blank.screens.slice(1)] };
  const job = compileInBrowser(p).catch(() => null);
  byImages.set(key, job);
  return job;
}

// Drawing is the slow part of reopening the gallery, so a drawing is kept for the minute it shows.
type Frame = ReturnType<typeof renderScreen>;
const drawn = new WeakMap<Compiled, { minute: number; fb: Frame }>();

function draw(compiled: Compiled, now: number): Frame {
  const minute = Math.floor(now / 60);
  const hit = drawn.get(compiled);
  if (hit?.minute === minute) return hit.fb;
  const fb = renderScreen(compiled.runtime, storeFor(compiled), 0, sampleValues(compiled, now), now);
  drawn.set(compiled, { minute, fb });
  return fb;
}

/** True once the element has come near the visible part of the dialog. */
function useSeen<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: "160px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

function Thumb({ ext, project }: { ext: Extension; project: Project }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const [w, h] = ext.size.default;
  useEffect(() => {
    if (!seen) return;
    let cancelled = false;
    void thumbFor(ext, project).then((c) => !cancelled && setCompiled(c));
    return () => {
      cancelled = true;
    };
  }, [seen, ext, project]);
  const fb = useMemo(() => (compiled ? draw(compiled, now) : null), [compiled, now]);
  const box = useMemo(() => cellsToBox(0, 0, w, h, { width: 800, height: 480 }), [w, h]);
  return (
    <div ref={ref} className="grid h-[120px] place-items-center overflow-hidden rounded-md bg-paper p-2">
      {fb ? <PanelCanvas fb={fb} crop={box} className="max-h-[104px] max-w-full" /> : <span className="size-6 animate-pulse rounded bg-ink/10" aria-hidden="true" />}
    </div>
  );
}

function matches(ext: Extension, words: string[]): boolean {
  const hay = `${ext.name} ${ext.description} ${LABEL[ext.category]} ${ext.category}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

function Card({ ext, project, missing, first, onPick, onConnect }: {
  ext: Extension; project: Project; missing: string[]; first: boolean; onPick: () => void; onConnect: () => void;
}) {
  const locked = missing.length > 0;
  const [w, h] = ext.size.default;
  return (
    <div className={`relative rounded-lg border bg-raised p-2 transition-colors ${first ? "border-accent ring-1 ring-accent" : "border-line"} ${locked ? "" : "hover:border-accent"}`}>
      <button type="button" disabled={locked} onClick={onPick} className="block w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-default">
        <div className={locked ? "opacity-40" : ""}><Thumb ext={ext} project={project} /></div>
        <div className="mt-2 flex items-start gap-2 px-0.5">
          <span className="mt-0.5 text-accent"><ExtensionIcon name={ext.icon} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-semibold">{ext.name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted tabular-nums" title={`${w} × ${h} cells to start with`}>{w}×{h}</span>
            </div>
            <div className="line-clamp-2 text-[12px] leading-snug text-muted">{ext.description}</div>
          </div>
        </div>
      </button>
      {first && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-white">
          <CornerDownLeft size={11} /> Add
        </span>
      )}
      {locked && (
        <Button size="sm" variant="primary" icon={<Lock size={13} />} onClick={onConnect} className="absolute left-1/2 top-[54px] -translate-x-1/2 whitespace-nowrap shadow-md">
          Connect {missing.map((k) => ACCOUNT_NAMES[k] ?? k).join(" and ")} first
        </Button>
      )}
    </div>
  );
}

function Tab({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: string; count: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${active ? "bg-ink text-raised" : "text-muted hover:bg-ink/5 hover:text-ink"} ${count ? "" : "opacity-40"}`}
    >
      {children}
      <span className={`text-[11px] tabular-nums ${active ? "opacity-70" : ""}`}>{count}</span>
    </button>
  );
}

function Gallery({ onPick, onConnect, project }: { onPick: (ext: Extension) => void; onConnect: () => void; project: Project }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const input = useRef<HTMLInputElement>(null);

  // A modal dialog focuses its `autofocus` element as it opens; React keeps that attribute out of the DOM, so set it here.
  const searchRef = (el: HTMLInputElement | null) => {
    input.current = el;
    el?.setAttribute("autofocus", "");
  };

  const env = envOf(project);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  // Widgets that need an account come last, keeping the gallery's order otherwise.
  const found = EXTENSIONS
    .filter((ext) => matches(ext, words))
    .map((ext) => ({ ext, missing: missingAccounts(ext.id, env) }))
    .sort((a, b) => Number(a.missing.length > 0) - Number(b.missing.length > 0));
  const shown = found.filter((f) => category === "all" || f.ext.category === category);
  const firstOpen = words.length ? shown.find((f) => !f.missing.length) : undefined;
  const used = CATEGORIES.filter((c) => EXTENSIONS.some((e) => e.category === c.id));

  return (
    // A steady height, so the dialog does not jump while the list narrows.
    <div className="min-h-[min(640px,70vh)] space-y-4">
      <div className="sticky -top-5 z-10 -mx-5 -mt-5 space-y-3 border-b border-line bg-surface px-5 pb-3 pt-5">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search widgets — clock, weather, trains…"
            aria-label="Search widgets"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && firstOpen) {
                e.preventDefault();
                onPick(firstOpen.ext);
              }
            }}
            className="h-10 w-full rounded-md border border-line bg-raised pl-9 pr-9 text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); input.current?.focus(); }}
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted hover:bg-ink/5 hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>
        <div role="tablist" aria-label="Kinds of widget" className="flex flex-wrap gap-1">
          <Tab active={category === "all"} onClick={() => setCategory("all")} count={found.length}>All</Tab>
          {used.map((c) => (
            <Tab key={c.id} active={category === c.id} onClick={() => setCategory(c.id)} count={found.filter((f) => f.ext.category === c.id).length}>
              {c.label}
            </Tab>
          ))}
        </div>
      </div>

      {shown.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {shown.map(({ ext, missing }) => (
            <Card key={ext.id} ext={ext} project={project} missing={missing} first={ext === firstOpen?.ext} onPick={() => onPick(ext)} onConnect={onConnect} />
          ))}
        </div>
      ) : (
        <div className="grid place-items-center gap-3 py-12 text-center">
          <p className="text-muted">
            No {category === "all" ? "" : `${LABEL[category].toLowerCase()} `}widget matches “{query}”.
          </p>
          <Button size="sm" onClick={() => { setQuery(""); setCategory("all"); input.current?.focus(); }}>Show every widget</Button>
        </div>
      )}
    </div>
  );
}

export function WidgetGallery({ open, onClose, onPick, onConnect, project }: {
  open: boolean; onClose: () => void; onPick: (ext: Extension) => void; onConnect: () => void; project: Project;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add a widget" wide>
      <Gallery onPick={onPick} onConnect={onConnect} project={project} />
    </Dialog>
  );
}
