import { describe, expect, it } from "vitest";

import type { Notice } from "@/lib/db/schema";
import { find } from "@/lib/extensions/registry";
import { reading } from "@/lib/extensions/observations";
import { activeNotices } from "@/lib/flow/notices";
import { triggerSource } from "@/lib/flow/sources";

/**
 * A source that has never answered must not fire anything.
 *
 * The bug this pins down: `answersFor` falls back to the extension's *sample*,
 * and the sample is written to look like a busy morning - so the transit
 * extension's own "Service alert" suggestion fired on a station nobody had
 * successfully fetched, on every wake, for ever, reading "Service alert"
 * because the sample has no alert text to quote.
 */
const now = new Date("2026-08-27T08:00:00Z");

async function fired(payload: Record<string, unknown>, standIn: boolean) {
  const extension = (await find("public_transport"))!;

  const source = triggerSource(
    { id: 7, extension: "public_transport", label: "Cadorna departures", settings: {} } as never,
    extension.manifest.facts,
    reading({ payload, fetchedAt: standIn ? null : now, attemptedAt: now, standIn }),
    now,
  );

  const rules = extension.manifest.notices.map((notice, index) => ({
    id: index + 1,
    label: notice.label,
    icon: notice.icon,
    text: notice.text,
    level: notice.level,
    placement: notice.placement,
    enabled: true,
    priority: index,
    condition: {
      kind: "fact",
      sourceId: "7",
      factKey: notice.when.fact,
      operator: notice.when.operator,
      value: notice.when.value,
    },
  })) as unknown as Notice[];

  const said = await activeNotices(rules, { now, sources: new Map([["7", source]]) });
  return said.map((notice) => notice.text);
}

describe("notices and the extension's sample", () => {
  it("says nothing about a source that has never answered", async () => {
    const extension = (await find("public_transport"))!;
    const sample = extension.manifest.sample as Record<string, unknown>;

    // The sample really does describe an alert - that is why it leaked.
    expect((sample.transit as { alerts: unknown[] }).alerts).toHaveLength(1);
    expect(await fired(sample, true)).toEqual([]);
  });

  it("still says it when a real board reports one", async () => {
    // `headline` rather than `title`: an operator's bulletin is titled after
    // the noticeboard it came from, so the fact reads the headline instead.
    // See lib/transit/trenord/board.ts.
    const payload = {
      transit: {
        alerts: [{ title: "Digital notice board", headline: "Reduced service", severity: "WARNING" }],
        alert: "Reduced service",
        departures: [{ line: "S3", delay: 0, cancelled: false }],
      },
    };

    expect(await fired(payload, false)).toEqual(["Reduced service"]);
  });

  it("says nothing when a real board reports no alert", async () => {
    const payload = {
      transit: {
        alerts: [],
        alert: "",
        departures: [{ line: "S3", delay: 0, cancelled: false }],
      },
    };

    expect(await fired(payload, false)).toEqual([]);
  });
});
