// Pick one of many — stations, stops, waters — by typing part of its name.
// A short list is shown whole, in its groups, the moment the field is
// opened, and narrows as one types; a long one (every station there is)
// appears only once two letters are in.

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
  hint?: string;
  group?: string;
}

/** Up to this many options are browsed whole; more are searched. */
const BROWSE = 60;

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function SearchField({ id, value, onChange, options, placeholder }: {
  id?: string; value: string; onChange: (v: string) => void; options: readonly Option[]; placeholder?: string;
}) {
  const current = options.find((o) => o.value === value);
  const [query, setQuery] = useState<string | null>(null);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const browse = options.length <= BROWSE;
  const hits = useMemo(() => {
    if (query === null) return [];
    const q = fold(query.trim());
    if (!browse && q.length < 2) return [];
    const found = q ? options.filter((o) => fold(o.label).includes(q) || (o.hint && fold(o.hint).includes(q)) || (o.group && fold(o.group).includes(q))) : options;
    return browse ? found : found.slice(0, 8);
  }, [query, options, browse]);
  const open = hits.length > 0;
  // The one chosen, in view when the list opens.
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const pick = (v: string) => { onChange(v); setQuery(null); };
  // Groups in the order they first appear; ungrouped options under no heading.
  const groups = useMemo(() => {
    const out: { name: string | undefined; items: Option[] }[] = [];
    for (const o of hits) {
      const last = out[out.length - 1];
      if (last && last.name === o.group) last.items.push(o);
      else out.push({ name: o.group, items: [o] });
    }
    return out;
  }, [hits]);
  const grouped = groups.some((g) => g.name);

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className="w-full h-9 rounded-md border border-line bg-raised pl-2.5 pr-8 placeholder:text-muted/70 focus:border-accent focus:outline-none"
        value={query ?? current?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => setQuery("")}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery(null);
          if (e.key === "Enter" && hits.length) { e.preventDefault(); pick(hits[0].value); }
        }}
      />
      <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      {open && (
        <ul ref={list} id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-raised py-1 shadow-lg">
          {groups.map((g, gi) => (
            <li key={g.name ?? `ungrouped-${gi}`} role="presentation">
              {grouped && g.name && <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{g.name}</div>}
              <ul role="group" aria-label={g.name}>
                {g.items.map((o) => (
                  <li key={o.value} role="option" aria-selected={o.value === value}>
                    <button type="button" className={`w-full truncate px-3 py-1.5 text-left hover:bg-accent-soft ${o.value === value ? "bg-accent-soft font-medium" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(o.value)}>
                      {o.label}{o.hint && <span className="text-muted"> · {o.hint}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
