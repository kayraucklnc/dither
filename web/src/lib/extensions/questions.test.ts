import { describe, expect, it } from "vitest";

import { questionSettings, type Extension } from "./registry";
import { manifestSchema } from "./manifest";

/**
 * Which half of a widget's settings is the *question*.
 *
 * This is what makes "six revenue widgets on one screen cost one trip to
 * Stripe" true rather than aspirational: the answer is cached by the question,
 * and the question has to exclude everything that only decides how the answer
 * is drawn.
 */
const extension = (fields: { keyname: string; presentation?: boolean }[]): Extension =>
  ({
    manifest: manifestSchema.parse({
      name: "test",
      label: "Test",
      fields: fields.map((field) => ({ ...field, name: field.keyname })),
    }),
  }) as Extension;

describe("questionSettings", () => {
  it("drops the settings that only change the drawing", () => {
    const asked = questionSettings(
      extension([{ keyname: "account" }, { keyname: "chart", presentation: true }]),
      { account: "main", chart: "week" },
    );

    expect(asked).toEqual({ account: "main" });
  });

  it("keeps everything the manifest has not marked", () => {
    // The default is the safe way round. A field wrongly treated as
    // presentational makes two widgets share one answer, and two weather
    // widgets showing one city is worse than one extra fetch.
    const asked = questionSettings(extension([{ keyname: "place" }]), {
      place: "Milan",
      units: "celsius",
    });

    expect(asked).toEqual({ place: "Milan", units: "celsius" });
  });

  it("leaves an unknown extension's settings entirely alone", () => {
    expect(questionSettings(undefined, { place: "Milan" })).toEqual({ place: "Milan" });
  });
});
