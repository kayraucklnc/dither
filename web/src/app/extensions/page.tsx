import { AlertTriangle, FolderCode } from "lucide-react";

import { ExtensionTile } from "@/components/extension-tile";
import { all, loadProblems } from "@/lib/extensions/registry";
import { summarise } from "@/lib/extensions/summary";

export const dynamic = "force-dynamic";

/**
 * The catalogue.
 *
 * There is no "new extension" button and nothing here is editable. An extension
 * is code that ships in the repository; what you configure is a *widget* - one
 * use of an extension on one screen, with its own settings. Making that
 * distinction visible is the job of this page.
 */
export default async function ExtensionsPage() {
  const extensions = (await all()).map(summarise);
  const problems = await loadProblems();

  const failed = problems.filter(
    (problem) => !extensions.some((extension) => extension.name === problem.extension),
  );

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Extensions</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          What screens are built from. Each ships as code and declares the sizes it can be drawn at,
          the settings it takes, and the values you can trigger on. You choose those settings when
          you place it on a screen.
        </p>
      </header>

      {failed.length > 0 && (
        <div className="mb-8 rounded-panel border border-warn/40 bg-warn/5 p-5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-warn">
            <AlertTriangle size={14} />
            {failed.length} could not be loaded
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

      {extensions.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line p-12 text-center">
          <FolderCode size={22} className="mx-auto text-faint" />
          <p className="mt-4 text-[14px] text-muted">
            No extensions found. Add a directory under{" "}
            <code className="font-mono text-[13px] text-ink">extensions/</code>.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {extensions.map((extension) => (
            <ExtensionTile key={extension.name} extension={extension} />
          ))}
        </div>
      )}
    </div>
  );
}
