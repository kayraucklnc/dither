// Pick one of many — stations, stops — by typing part of its name.

import { useId, useMemo, useState } from "react";

interface Option {
  value: string;
  label: string;
  hint?: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function SearchField({ id, value, onChange, options, placeholder }: {
  id?: string; value: string; onChange: (v: string) => void; options: readonly Option[]; placeholder?: string;
}) {
  const current = options.find((o) => o.value === value);
  const [query, setQuery] = useState<string | null>(null);
  const listId = useId();
  const hits = useMemo(() => {
    if (query === null || query.trim().length < 2) return [];
    const q = fold(query.trim());
    return options.filter((o) => fold(o.label).includes(q) || (o.hint && fold(o.hint).includes(q))).slice(0, 8);
  }, [query, options]);

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={listId}
        className="w-full h-9 rounded-md border border-line bg-raised px-2.5 placeholder:text-muted/70 focus:border-accent focus:outline-none"
        value={query ?? current?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => setQuery("")}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {hits.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-raised shadow-lg">
          {hits.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-accent-soft"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(o.value); setQuery(null); }}>
                {o.label}{o.hint && <span className="text-muted"> {o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
