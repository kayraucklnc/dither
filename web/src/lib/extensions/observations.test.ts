import { describe, expect, it } from "vitest";

import { observationKey, reading } from "./observations";

describe("what counts as the same question", () => {
  it("is the extension and the settings, not who asked", () => {
    const widget = observationKey("public_transport", { origin: "Cadorna", destination: "Saronno" });
    const source = observationKey("public_transport", { origin: "Cadorna", destination: "Saronno" });

    // A widget drawing the board and a source watching it fetch once between
    // them, which is the whole point of keying by the question.
    expect(widget).toBe(source);
  });

  it("does not care what order the settings were written in", () => {
    expect(observationKey("weather", { place: "Milan", units: "celsius" })).toBe(
      observationKey("weather", { units: "celsius", place: "Milan" }),
    );
  });

  it("separates different questions", () => {
    expect(observationKey("weather", { place: "Milan" })).not.toBe(
      observationKey("weather", { place: "Rome" }),
    );
    expect(observationKey("weather", { place: "Milan" })).not.toBe(
      observationKey("markets", { place: "Milan" }),
    );
  });

  it("treats no settings as a question in its own right", () => {
    expect(observationKey("clock", {})).toBe(observationKey("clock", {}));
    expect(observationKey("clock", {})).not.toBe(observationKey("clock", { heading: "Milan" }));
  });
});

describe("what a decision is allowed to read", () => {
  const fetchedAt = new Date("2026-08-27T08:00:00Z");

  it("hands on a real answer unchanged", () => {
    const answer = {
      payload: { transit: { alert: "Reduced service" } },
      fetchedAt,
      attemptedAt: fetchedAt,
      standIn: false,
    };

    expect(reading(answer)).toEqual({
      payload: { transit: { alert: "Reduced service" } },
      fetchedAt,
      error: undefined,
    });
  });

  it("reads a stand-in as nothing, sample or no sample", () => {
    // The sample is preview material. A rule cannot tell it from a reading, so
    // it never gets to see one - otherwise a source that has never answered
    // decides with the extension author's imagination.
    const answer = {
      payload: { transit: { alerts: [{ title: "Reduced service" }] } },
      fetchedAt: null,
      attemptedAt: fetchedAt,
      standIn: true,
    };

    expect(reading(answer)).toEqual({ payload: {}, fetchedAt: null, error: undefined });
  });

  it("keeps the error, so a silent source can say why it is silent", () => {
    const answer = {
      payload: {},
      fetchedAt: null,
      attemptedAt: fetchedAt,
      error: "Trenord answered 503 for its journey planner.",
      standIn: true,
    };

    expect(reading(answer).error).toBe("Trenord answered 503 for its journey planner.");
  });

  it("treats a question nobody has asked the same way", () => {
    expect(reading(undefined)).toEqual({ payload: {}, fetchedAt: null, error: undefined });
  });
});
