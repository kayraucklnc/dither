// The first five minutes: which panel, what on it, where, which Wi-Fi.

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, FolderOpen } from "lucide-react";
import { browserZone } from "@/compiler/timezone";
import { compileInBrowser } from "@/state/compile";
import type { Compiled } from "@/compiler";
import { listBoards } from "@/device";
import { createProject, STARTERS } from "@/project/starters";
import type { Place, Project } from "@/project/schema";
import { builtins } from "@/runtime/values";
import { readProjectFile } from "@/state/storage";
import { Button, Field, Note, TextInput } from "../kit";
import { PlaceSearch } from "../fields/PlaceSearch";
import { Wordmark } from "../Mark";
import { ScreenPreview } from "../Preview";

const STEPS = ["Panel", "Look", "Place", "Wi-Fi"] as const;
// One object, so the starter previews do not recompile on every render before a place is picked.
const SAMPLE_PLACE: Place = { name: "Istanbul", latitude: 41.01, longitude: 28.98 };

function guessLanguage(): string {
  const lang = (navigator.language || "en").slice(0, 2);
  return ["en", "tr", "de", "fr", "es", "it", "nl", "pt"].includes(lang) ? lang : "en";
}

// Fahrenheit is a US habit, so ask where the computer is, not what language it speaks.
function guessUnits(): "metric" | "imperial" {
  const zone = browserZone();
  const us = zone.startsWith("America/") && !/Argentina|Bogota|Lima|Santiago|Sao_Paulo|Mexico|Caracas|Montevideo|Havana/.test(zone);
  return us && navigator.language === "en-US" ? "imperial" : "metric";
}

function StarterCard({ id, name, description, selected, onSelect, place }: {
  id: string; name: string; description: string; selected: boolean; onSelect: () => void; place: Place | null;
}) {
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    let cancelled = false;
    const p = createProject({ starter: id, timezone: browserZone(), language: guessLanguage(), units: guessUnits(), place });
    compileInBrowser(p).then((c) => !cancelled && setCompiled(c), () => !cancelled && setCompiled(null));
    return () => {
      cancelled = true;
    };
  }, [id, place]);
  const values = useMemo(() => {
    const v = builtins(now, compiled?.runtime.tz ?? "STD0");
    for (const s of compiled?.sources ?? []) for (const [k, x] of s.sample) v.set(k, x);
    return v;
  }, [compiled, now]);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group text-left rounded-lg border p-2.5 transition-colors ${selected ? "border-accent bg-accent-soft" : "border-line bg-raised hover:border-muted"}`}
    >
      <div className="rounded-[5px] bg-bezel p-1.5">
        <ScreenPreview compiled={compiled} screen={0} values={values} now={now} className="block w-full aspect-[5/3] bg-paper" />
      </div>
      <div className="mt-2.5 flex items-start gap-2 px-0.5">
        <div className="flex-1">
          <div className="font-semibold">{name}</div>
          <div className="text-[13px] text-muted leading-snug">{description}</div>
        </div>
        {selected && <Check size={18} className="text-accent mt-0.5" />}
      </div>
    </button>
  );
}

export function Welcome({ onDone }: { onDone: (p: Project) => void }) {
  const [step, setStep] = useState(0);
  const [board, setBoard] = useState("xiao-epaper-75");
  const [starter, setStarter] = useState("clock-weather");
  const [place, setPlace] = useState<Place | null>(null);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    const p = createProject({ starter, timezone: browserZone(), language: guessLanguage(), units: guessUnits(), place });
    onDone({ ...p, board, wifi: [{ ssid: ssid.trim(), password }] });
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    try {
      onDone(await readProjectFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <Wordmark />
        <label className="inline-flex items-center gap-2 text-[13px] font-medium text-muted hover:text-ink cursor-pointer">
          <FolderOpen size={15} /> Open a project file
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => {
            void open(e.target.files?.[0]);
            e.target.value = "";
          }} />
        </label>
      </header>

      <main className="flex-1 w-full max-w-[880px] mx-auto px-6 pb-16">
        <ol className="flex gap-6 mb-8 text-[13px]" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i === step ? "text-ink font-semibold" : i < step ? "text-accent" : "text-muted"}`}>
              <span className={`grid place-items-center size-5 rounded-full text-[11px] ${i < step ? "bg-accent text-white" : i === step ? "bg-ink text-raised" : "bg-line"}`}>
                {i < step ? <Check size={12} /> : i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>

        {error && <div className="mb-4"><Note tone="warn">{error}</Note></div>}

        {step === 0 && (
          <section className="space-y-5">
            <h1 className="text-[28px] font-semibold tracking-tight">Which display do you have?</h1>
            <div className="grid sm:grid-cols-2 gap-3">
              {listBoards().map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBoard(b.id)}
                  aria-pressed={board === b.id}
                  className={`text-left rounded-lg border p-4 ${board === b.id ? "border-accent bg-accent-soft" : "border-line bg-raised hover:border-muted"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded bg-bezel p-1"><div className="w-16 h-10 bg-paper" /></div>
                    <div>
                      <div className="font-semibold">{b.name}</div>
                      <div className="text-[13px] text-muted">{b.width} × {b.height}, black and white, {b.chip}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[13px] text-muted">More displays can be added — each one is a single entry in <code>app/src/device/boards.ts</code> plus a firmware build.</p>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-5">
            <h1 className="text-[28px] font-semibold tracking-tight">What should it show?</h1>
            <p className="text-muted -mt-2">Pick a starting point. You can change everything afterwards.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {STARTERS.map((s) => (
                <StarterCard key={s.id} {...s} place={place ?? SAMPLE_PLACE} selected={starter === s.id} onSelect={() => setStarter(s.id)} />
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-5 max-w-[520px]">
            <h1 className="text-[28px] font-semibold tracking-tight">Where is it?</h1>
            <p className="text-muted -mt-2">For the weather, and for sunrise and sunset. The time zone comes from this computer ({browserZone()}).</p>
            <PlaceSearch value={place} onChange={setPlace} language={guessLanguage()} />
          </section>
        )}

        {step === 3 && (
          <section className="space-y-5 max-w-[520px]">
            <h1 className="text-[28px] font-semibold tracking-tight">Which Wi-Fi will it use?</h1>
            <p className="text-muted -mt-2">The panel joins this network when it wakes up to fetch the weather and the time. 2.4 GHz networks only.</p>
            <Field label="Network name">{(id) => <TextInput id={id} value={ssid} onChange={setSsid} placeholder="Home" autoFocus />}</Field>
            <Field label="Password" help="Stored on the panel and in this browser. It is left out when you save the project to a file.">
              {(id) => <TextInput id={id} type="password" value={password} onChange={setPassword} />}
            </Field>
          </section>
        )}

        <footer className="mt-10 flex items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <div className="flex-1" />
          {step === 2 && !place && <span className="text-[13px] text-muted">You can skip this and set it later.</span>}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" size="lg" onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={finish}>
              {ssid.trim() ? "Open the editor" : "Skip Wi-Fi and open the editor"}
            </Button>
          )}
        </footer>
      </main>
    </div>
  );
}
