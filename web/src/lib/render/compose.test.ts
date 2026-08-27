import { describe, expect, it } from "vitest";

import { compose, type PlacedWidget } from "./compose";

/**
 * What a panel is allowed to show when a fetch is failing.
 *
 * The bug this pins down: a Google project with the Calendar API switched off
 * rendered a panel of four plausible meetings - the extension's *sample* - and
 * said so nowhere a person looking at the panel could see it. The truth was on
 * a dashboard page nobody had open.
 *
 * So there are two rules, and they differ on whether anything real was ever
 * fetched. Never answered: draw the fault, not the sample. Answered before and
 * failing now: keep the picture, put the truth over it.
 */

const widget = (patch: Partial<PlacedWidget> = {}): PlacedWidget => ({
  id: 1,
  extension: "google_calendar",
  label: "Calendar",
  settings: { calendar: "primary" },
  data: { calendar: { empty: true, events: [], next: null } },
  column: 1,
  row: 1,
  columnSpan: 6,
  rowSpan: 6,
  ...patch,
});

const FAILURE = "Google Calendar API has not been used in project 1933 before or it is disabled.";

describe("a widget that has never had a real answer", () => {
  it("draws the fault instead of the extension's sample", async () => {
    const { html, problems } = await compose(
      [widget({ standIn: true, problem: FAILURE })],
      800,
      480,
    );

    expect(html).toContain('class="cell cell--fault"');
    expect(html).toContain("has never answered");
    expect(html).toContain("Calendar");
    // The provider's own words, because they are nearly always the fix.
    expect(html).toContain("is disabled");
    // And emphatically not the sample dressed up as real data.
    expect(html).not.toContain("<iframe");
    expect(problems).toHaveLength(1);
  });

  it("says nothing when it is merely waiting rather than broken", async () => {
    // A sample with no failure behind it is a screen being designed before
    // anyone owns an API key, which is what the sample is for.
    const { html, problems } = await compose([widget({ standIn: true })], 800, 480);

    expect(html).not.toContain('class="cell cell--fault"');
    expect(html).toContain("<iframe");
    expect(problems).toHaveLength(0);
  });
});

describe("a widget that answered before and is failing now", () => {
  it("keeps its picture and wears a note over it", async () => {
    // A departure board from twenty minutes ago still tells you roughly when
    // the train is. Blanking it would be worse than showing it late.
    const { html, problems } = await compose(
      [widget({ standIn: false, problem: "open-meteo.com: 503 from source_1." })],
      800,
      480,
    );

    expect(html).toContain("<iframe");
    expect(html).toContain('class="stale"');
    expect(html).toContain("503 from source_1");
    expect(problems).toEqual(["Calendar: open-meteo.com: 503 from source_1."]);
  });

  it("wears nothing at all while it is healthy", async () => {
    const { html, problems } = await compose([widget({ standIn: false })], 800, 480);

    expect(html).toContain("<iframe");
    expect(html).not.toContain('class="stale"');
    expect(problems).toHaveLength(0);
  });
});

describe("the fault is escaped, not injected", () => {
  it("cannot break out of the cell it is drawn in", async () => {
    const { html } = await compose(
      [widget({ standIn: true, problem: '</p><script>alert("x")</script>' })],
      800,
      480,
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
