import { Radio } from "lucide-react";

import { SourcesList } from "@/components/sources-list";
import { sourceKinds, sourcesOverview } from "@/lib/sources-overview";

export const dynamic = "force-dynamic";

/**
 * The questions this installation asks of the world.
 *
 * Shared, not owned by a panel: "Milan transit" is not a property of the
 * display in the hall. One source can be watched by one panel and alerted on
 * by another, and it is fetched once for both. What each device picks is its
 * own subscription - the checks and notices it builds on top, over on its
 * page.
 */
export default async function SourcesPage() {
  const sources = await sourcesOverview();
  const kinds = await sourceKinds();

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          What Dither watches, and what every device can decide on. A source is shared: one panel
          can switch screens on it while another shows an alert, and it is fetched once for both.
        </p>
      </header>

      {sources.length === 0 && (
        <div className="mb-6 rounded-panel border border-dashed border-line p-10 text-center">
          <Radio size={22} className="mx-auto text-faint" />
          <p className="mt-4 text-[14px] text-muted">
            Nothing watched yet. Add one and every device can build checks and alerts on it.
          </p>
        </div>
      )}

      <SourcesList sources={sources} kinds={kinds} />
    </div>
  );
}
