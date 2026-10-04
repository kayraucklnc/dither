// One check — "<something> <is above> <value>" — the unit rules and alerts share.

import { X } from "lucide-react";
import { OPS, type CatalogFact } from "@/compiler/facts";
import type { Check } from "@/project/schema";
import { IconButton, NumberInput, Segmented } from "../kit";

export function defaultCheck(fact: CatalogFact): Check {
  switch (fact.type) {
    case "time": return { fact: fact.id, op: "between", value: { from: "22:00", to: "07:00" } };
    case "number": return { fact: fact.id, op: "gt", value: 0 };
    case "boolean":
    case "flag": return { fact: fact.id, op: "is", value: true };
    case "choice": return { fact: fact.id, op: "in", value: [fact.choices[0].id] };
    case "text": return { fact: fact.id, op: "contains", value: "" };
  }
}

function ValueEditor({ fact, check, onChange }: { fact: CatalogFact; check: Check; onChange: (c: Check) => void }) {
  const v = check.value;
  const timeInput = (value: string, set: (s: string) => void, label: string) => (
    <input type="time" aria-label={label} value={value} onChange={(e) => set(e.target.value)}
      className="h-8 rounded-md border border-line bg-raised px-2 focus:border-accent focus:outline-none" />
  );
  switch (fact.type) {
    case "time": {
      const r = (v ?? {}) as { from?: string; to?: string };
      return (
        <span className="inline-flex items-center gap-1.5">
          {timeInput(r.from ?? "", (from) => onChange({ ...check, value: { ...r, from } }), "From")}
          <span className="text-muted">and</span>
          {timeInput(r.to ?? "", (to) => onChange({ ...check, value: { ...r, to } }), "To")}
        </span>
      );
    }
    case "number":
      if (check.op === "between") {
        const [a, b] = Array.isArray(v) ? (v as number[]) : [0, 10];
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-24"><NumberInput value={a} onChange={(x) => onChange({ ...check, value: [x, b] })} unit={fact.unit} /></span>
            <span className="text-muted">and</span>
            <span className="w-24"><NumberInput value={b} onChange={(x) => onChange({ ...check, value: [a, x] })} unit={fact.unit} /></span>
          </span>
        );
      }
      return <span className="w-28 inline-block"><NumberInput value={typeof v === "number" ? v : 0} onChange={(x) => onChange({ ...check, value: x })} unit={fact.unit} /></span>;
    case "boolean":
    case "flag":
      return <Segmented label="Value" value={v === false ? "no" : "yes"} onChange={(x) => onChange({ ...check, value: x === "yes" })} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />;
    case "choice": {
      const ids = Array.isArray(v) ? (v as string[]) : [];
      return (
        <span className="inline-flex flex-wrap gap-1">
          {fact.choices.map((c) => {
            const on = ids.includes(c.id);
            return (
              <button key={c.id} type="button" aria-pressed={on}
                onClick={() => onChange({ ...check, value: on ? ids.filter((x) => x !== c.id) : [...ids, c.id] })}
                className={`h-7 rounded-full border px-2.5 text-[12px] font-medium ${on ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:text-ink"}`}>
                {c.label}
              </button>
            );
          })}
        </span>
      );
    }
    case "text":
      return <input aria-label="Text" value={typeof v === "string" ? v : ""} onChange={(e) => onChange({ ...check, value: e.target.value })}
        className="h-8 w-40 rounded-md border border-line bg-raised px-2 focus:border-accent focus:outline-none" />;
  }
}

export function CheckRow({ check, catalog, onChange, onRemove }: { check: Check; catalog: CatalogFact[]; onChange: (c: Check) => void; onRemove: () => void }) {
  const fact = catalog.find((f) => f.id === check.fact);
  const groups = [...new Set(catalog.map((f) => f.group))];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface px-2.5 py-2">
      <select aria-label="What to check" value={check.fact}
        onChange={(e) => { const f = catalog.find((x) => x.id === e.target.value); if (f) onChange(defaultCheck(f)); }}
        className="h-8 rounded-md border border-line bg-raised px-2 font-medium focus:border-accent focus:outline-none">
        {!fact && <option value={check.fact}>Removed widget</option>}
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {catalog.filter((f) => f.group === g).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </optgroup>
        ))}
      </select>
      {fact && OPS[fact.type].length > 1 && (
        <select aria-label="How" value={check.op} onChange={(e) => onChange({ ...check, op: e.target.value, value: e.target.value === "between" && fact.type === "number" ? [0, 10] : check.value })}
          className="h-8 rounded-md border border-line bg-raised px-2 focus:border-accent focus:outline-none">
          {OPS[fact.type].map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
        </select>
      )}
      {fact && OPS[fact.type].length === 1 && <span className="text-muted">{OPS[fact.type][0].label}</span>}
      {fact && <ValueEditor fact={fact} check={check} onChange={onChange} />}
      <IconButton label="Remove this check" onClick={onRemove} className="ml-auto"><X size={15} /></IconButton>
    </div>
  );
}
