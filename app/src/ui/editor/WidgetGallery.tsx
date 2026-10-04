// Every widget, drawn by the real renderer at its default size.

import { useEffect, useMemo, useState } from "react";
import type { Compiled } from "@/compiler";
import { cellsToBox } from "@/compiler/grid";
import { EXTENSIONS } from "@/extensions";
import type { Extension } from "@/extensions/api";
import { createProject } from "@/project/starters";
import type { Project } from "@/project/schema";
import { renderScreen } from "@/runtime/render";
import { builtins } from "@/runtime/values";
import { compileInBrowser } from "@/state/compile";
import { Lock } from "lucide-react";
import { envOf, missingAccounts } from "@/compiler/widgets";
import { Button, Dialog } from "../kit";
import { PanelCanvas } from "../PanelCanvas";
import { storeFor } from "../Preview";
import { ExtensionIcon } from "./Inspector";

const PREVIEW_ACCOUNTS: Project["accounts"] = {
  google: [{ id: "preview", clientId: "preview", clientSecret: "preview", refreshToken: "preview", email: "" }],
  stripe: { key: "rk_test_preview", name: "" },
};

const ACCOUNT_NAMES: Record<string, string> = { google: "Google", stripe: "Stripe" };

function Thumb({ ext, project }: { ext: Extension; project: Project }) {
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const [w, h] = ext.size.default;
  useEffect(() => {
    let cancelled = false;
    const blank = createProject({ starter: "blank", timezone: project.timezone, language: project.language, units: project.units, place: project.place });
    const widget = { id: "thumb", type: ext.id, x: 0, y: 0, w, h, frame: "none" as const, settings: {} };
    // A locked widget still shows what it will look like: its example data, behind stand-in accounts.
    const p: Project = { ...blank, images: project.images, accounts: PREVIEW_ACCOUNTS, screens: [{ ...blank.screens[0], widgets: [widget] }, ...blank.screens.slice(1)] };
    compileInBrowser(p).then((c) => !cancelled && setCompiled(c), () => !cancelled && setCompiled(null));
    return () => {
      cancelled = true;
    };
  }, [ext, project.timezone, project.language, project.units, project.place, project.images, w, h]);
  const fb = useMemo(() => {
    if (!compiled) return null;
    const values = builtins(now, compiled.runtime.tz);
    for (const s of compiled.sources) for (const [k, v] of s.sample) values.set(k, v);
    return renderScreen(compiled.runtime, storeFor(compiled), 0, values, now);
  }, [compiled, now]);
  const box = useMemo(() => cellsToBox(0, 0, w, h, { width: 800, height: 480 }), [w, h]);
  return (
    <div className="grid place-items-center rounded-md bg-paper h-[132px] p-2 overflow-hidden">
      <PanelCanvas fb={fb} crop={box} className="max-h-full max-w-full" />
    </div>
  );
}

export function WidgetGallery({ open, onClose, onPick, onConnect, project }: {
  open: boolean; onClose: () => void; onPick: (ext: Extension) => void; onConnect: () => void; project: Project;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add a widget" wide>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {EXTENSIONS.map((ext) => {
          const missing = missingAccounts(ext.id, envOf(project));
          const locked = missing.length > 0;
          return (
            <div key={ext.id} className={`relative rounded-lg border border-line bg-raised p-2.5 ${locked ? "" : "hover:border-accent"}`}>
              <button type="button" disabled={locked} onClick={() => onPick(ext)} className="block w-full text-left disabled:cursor-default">
                <div className={locked ? "opacity-50" : ""}><Thumb ext={ext} project={project} /></div>
                <div className="mt-2.5 flex items-start gap-2 px-0.5">
                  <span className="mt-0.5 text-accent"><ExtensionIcon name={ext.icon} /></span>
                  <div>
                    <div className="font-semibold">{ext.name}</div>
                    <div className="text-[12px] text-muted leading-snug">{ext.description}</div>
                  </div>
                </div>
              </button>
              {locked && (
                <Button size="sm" variant="primary" icon={<Lock size={13} />} onClick={onConnect} className="absolute left-1/2 top-[74px] -translate-x-1/2 whitespace-nowrap shadow-md">
                  Connect {missing.map((k) => ACCOUNT_NAMES[k] ?? k).join(" and ")} first
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
