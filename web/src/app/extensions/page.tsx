import { AlertTriangle, FolderCode } from "lucide-react";

import { ExtensionCard, type ExtensionSummary } from "@/components/extension-card";
import { all, loadProblems } from "@/lib/extensions/registry";

export const dynamic = "force-dynamic";

/**
 * The catalogue.
 *
 * There is no "new extension" button, and nothing on this page is editable.
 * An extension is code that ships in the repository; what you configure is a
 * *widget* - one use of an extension on one screen, with its own settings.
 * Making that distinction visible is the job of this page.
 */
export default async function ExtensionsPage() {
  const extensions = await all();
  const problems = await loadProblems();

  const summaries: ExtensionSummary[] = extensions.map((extension) => ({
    name: extension.name,
    label: extension.manifest.label,
    description: extension.manifest.description.trim(),
    kind: extension.manifest.kind,
    interval: extension.manifest.interval,
    unit: extension.manifest.unit,
    shapes: extension.shapes,
    settingCount: extension.manifest.fields.length,
    facts: extension.manifest.facts.map((fact) => ({
      key: fact.key,
      label: fact.label,
      unit: fact.unit,
    })),
    problems: extension.problems,
  }));

  const failed = problems.filter(
    (problem) => !extensions.some((extension) => extension.name === problem.extension),
  );

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Extensions</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          What screens are built from. Each one ships as code and declares the sizes it can be
          drawn at, the settings it takes, and the values your device can trigger on. You choose
          those settings when you place it on a screen, not here.
        </p>
      </header>

      {failed.length > 0 && (
        <div className="mb-8 rounded-panel border border-warn/40 bg-warn/5 p-5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-warn">
            <AlertTriangle size={14} />
            {failed.length} extension{failed.length === 1 ? "" : "s"} could not be loaded
          </p>
          <ul className="mt-3 space-y-1.5">
            {failed.map((problem) => (
              <li key={`${problem.extension}-${problem.message}`} className="text-[13px] text-muted">
                <code className="font-mono text-ink">{problem.extension}</code> — {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summaries.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line p-12 text-center">
          <FolderCode size={22} className="mx-auto text-faint" />
          <p className="mt-4 text-[14px] text-muted">
            No extensions found. Add a directory under{" "}
            <code className="font-mono text-[13px] text-ink">extensions/</code> with a{" "}
            <code className="font-mono text-[13px] text-ink">configuration.yml</code>.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((extension) => (
            <ExtensionCard key={extension.name} extension={extension} />
          ))}
        </div>
      )}
    </div>
  );
}
