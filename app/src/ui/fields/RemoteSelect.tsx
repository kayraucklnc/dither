// A choice whose options are fetched — a linked account's calendars.

import { useEffect, useState } from "react";
import type { Field } from "@/extensions/api";
import { envOf } from "@/compiler/widgets";
import { useProject } from "@/state/project-store";
import { Select } from "../kit";

type RemoteField = Extract<Field, { kind: "remote-select" }>;

export function RemoteSelect({ id, field, value, settings, onChange }: {
  id?: string; field: RemoteField; value: string; settings: Record<string, unknown>; onChange: (value: string, label: string) => void;
}) {
  const { project } = useProject();
  const [options, setOptions] = useState<{ value: string; label: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accounts = project.accounts;
  // A calendar list depends on which account is chosen; reload when that changes.
  const depends = JSON.stringify(settings.account ?? null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    field.load(envOf({ ...project, accounts }), settings).then(
      (o) => !cancelled && setOptions(o),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
    // Reload when the accounts change, not on every edit to the project.
  }, [field, accounts, depends]);

  if (error) return <p className="text-[12px] text-danger">{error}</p>;
  if (!options) return <p className="text-[12px] text-muted">Loading…</p>;
  const list = options.some((o) => o.value === value) || !value ? options : [{ value, label: value }, ...options];
  return (
    <Select id={id} value={value || list[0]?.value || ""} options={list}
      onChange={(v) => onChange(v, list.find((o) => o.value === v)?.label ?? "")} />
  );
}
