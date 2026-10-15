// Several pictures in order: ones the user brings, and prints from the collection.

import { ImagePlus, Plus, X } from "lucide-react";
import { useState } from "react";
import { importPicture } from "@/compiler/picture-browser";
import { COLLECTION, COLLECTION_IMAGES, collectionId, printOf } from "@/extensions/gallery/collection";
import { newId } from "@/project/ids";
import type { Project } from "@/project/schema";
import { useProject } from "@/state/project-store";

interface Props {
  value: string[];
  onChange: (ids: string[], also?: (p: Project) => Project) => void;
}

const caption = (id: string): string => {
  const p = printOf(id);
  return p ? `${p.title} — ${p.artist}, ${p.year}` : "Your picture";
};

export function ImagesField({ value, onChange }: Props) {
  const { project } = useProject();
  const [error, setError] = useState<string | null>(null);
  const srcOf = (id: string) => project.images[id] ?? COLLECTION_IMAGES[id];
  const rest = COLLECTION.filter((p) => !value.includes(collectionId(p)));

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const added = await Promise.all(Array.from(files, async (f) => [newId("img"), await importPicture(f)] as const));
      onChange([...value, ...added.map(([id]) => id)], (p) => ({ ...p, images: { ...p.images, ...Object.fromEntries(added) } }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "One of those files is not a picture this browser can read.");
    }
  };

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ol className="grid grid-cols-3 gap-1.5">
          {value.map((id, i) => (
            <li key={id} className="group relative" title={caption(id)}>
              <img src={srcOf(id)} alt={caption(id)} className="aspect-[5/3] w-full rounded object-cover grayscale" />
              <span className="absolute left-1 top-1 rounded bg-ink/70 px-1 text-[11px] text-white">{i + 1}</span>
              <button type="button" aria-label={`Remove ${caption(id)}`}
                className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-ink/70 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => onChange(value.filter((x) => x !== id))}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <label className="flex items-center gap-3 rounded-md border border-dashed border-line bg-raised p-2.5 cursor-pointer hover:border-accent">
        <span className="grid size-9 place-items-center rounded bg-surface text-muted"><ImagePlus size={18} /></span>
        <span className="text-[13px]">Add your own pictures</span>
        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }} />
      </label>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {rest.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12px] text-muted">From the collection: public-domain prints, cut for the panel.</p>
          <ul className="grid grid-cols-3 gap-1.5">
            {rest.map((p) => (
              <li key={p.id}>
                <button type="button" title={caption(collectionId(p))} aria-label={`Add ${caption(collectionId(p))}`}
                  className="group relative block w-full" onClick={() => onChange([...value, collectionId(p)])}>
                  <img src={COLLECTION_IMAGES[collectionId(p)]} alt="" loading="lazy" className="aspect-[5/3] w-full rounded object-cover grayscale opacity-70 group-hover:opacity-100" />
                  <span className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-accent text-white opacity-0 group-hover:opacity-100"><Plus size={12} /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
