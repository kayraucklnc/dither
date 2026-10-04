// A widget's settings, laid out from its extension's field list.

import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { ICON_NAMES } from "@/assets/library";
import { importPicture } from "@/compiler/picture-browser";
import type { Field as FieldDef } from "@/extensions/api";
import { newId } from "@/project/ids";
import type { Place, Project } from "@/project/schema";
import { useProject } from "@/state/project-store";
import { Field, NumberInput, Select, TextArea, TextInput, Toggle } from "../kit";
import { RemoteSelect } from "../fields/RemoteSelect";
import { PlaceSearch } from "../fields/PlaceSearch";
import { SearchField } from "../fields/SearchField";

/** Changes the project alongside a setting, in the same undo step (e.g. adding the picture a setting names). */
export type AlsoChange = (p: Project) => Project;

interface Props {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown, also?: AlsoChange) => void;
}

function ImageField({ value, onChange }: { value: string; onChange: (id: string, also: AlsoChange) => void }) {
  const { project } = useProject();
  const [error, setError] = useState<string | null>(null);
  const src = value ? project.images[value] : undefined;
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await importPicture(file);
      const id = newId("img");
      onChange(id, (p) => ({ ...p, images: { ...p.images, [id]: data } }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file is not a picture this browser can read.");
    }
  };
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-3 rounded-md border border-dashed border-line bg-raised p-2.5 cursor-pointer hover:border-accent">
        {src ? <img src={src} alt="" className="size-12 rounded object-cover" /> : <span className="grid size-12 place-items-center rounded bg-surface text-muted"><ImagePlus size={20} /></span>}
        <span className="text-[13px]">{src ? "Choose another picture" : "Choose a picture"}</span>
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }} />
      </label>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

export function SettingsForm({ fields, values, onChange }: Props) {
  const { project } = useProject();
  return (
    <div className="space-y-4">
      {fields.filter((f) => !f.visible || f.visible(values)).map((f) => (
        <Field key={f.key} label={f.label} help={f.help}>
          {(id) => {
            const v = values[f.key];
            switch (f.kind) {
              case "text":
                return f.multiline
                  ? <TextArea id={id} value={String(v ?? "")} onChange={(x) => onChange(f.key, x)} placeholder={f.placeholder} />
                  : <TextInput id={id} value={String(v ?? "")} onChange={(x) => onChange(f.key, x)} placeholder={f.placeholder} />;
              case "secret":
                return <TextInput id={id} type="password" value={String(v ?? "")} onChange={(x) => onChange(f.key, x)} placeholder={f.placeholder} />;
              case "number":
                return <NumberInput id={id} value={Number(v ?? 0)} onChange={(x) => onChange(f.key, x)} min={f.min} max={f.max} step={f.step} unit={f.unit} />;
              case "select":
                return <Select id={id} value={String(v ?? f.options[0]?.value)} onChange={(x) => onChange(f.key, x)} options={f.options} />;
              case "toggle":
                return <Toggle id={id} checked={v === true} onChange={(x) => onChange(f.key, x)} label={f.label} />;
              case "date":
                return <TextInput id={id} type="date" value={String(v ?? "")} onChange={(x) => onChange(f.key, x)} />;
              case "list":
                return (
                  <TextArea
                    id={id}
                    rows={4}
                    value={(Array.isArray(v) ? v : []).join("\n")}
                    onChange={(x) => onChange(f.key, x.split("\n"))}
                    placeholder={f.placeholder}
                  />
                );
              case "icon":
                return <Select id={id} value={String(v ?? ICON_NAMES[0])} onChange={(x) => onChange(f.key, x)} options={ICON_NAMES.map((n) => ({ value: n, label: n }))} />;
              case "image":
                return <ImageField value={String(v ?? "")} onChange={(x, also) => onChange(f.key, x, also)} />;
              case "search":
                return <SearchField id={id} value={String(v ?? "")} onChange={(x) => onChange(f.key, x)} options={f.options()} placeholder={f.placeholder} />;
              case "remote-select":
                return <RemoteSelect id={id} field={f} value={String(v ?? "")} onChange={(x, label) => {
                  onChange(f.key, x);
                  onChange(`${f.key}Name`, label);
                }} />;
              case "place":
                return (
                  <div className="space-y-1.5">
                    <PlaceSearch value={(v as Place | null) ?? null} onChange={(p) => onChange(f.key, p)} language={project.language} />
                    {!v && project.place && <p className="text-[12px] text-muted">Using the panel's place, {project.place.name}.</p>}
                  </div>
                );
            }
          }}
        </Field>
      ))}
    </div>
  );
}
