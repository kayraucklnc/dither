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

  describe("when the source has stopped answering", () => {
    // `recordFailure` keeps the last payload on purpose: a provider being down
    // should leave the picture on the panel with a note over it. A decision
    // has nowhere to put that note, so it has to stop deciding instead - but
    // not on the first blip, only once the answer is past its own sell-by.
    const failing = (answeredAt: Date) => ({
      payload: { calendar: { next: { location: "Sala 4" } } },
      fetchedAt: answeredAt,
      attemptedAt: new Date("2026-08-27T09:00:00Z"),
      error: "Google returned 401 for its calendar list.",
      standIn: false,
    });

    /** Ten minutes, which is what the calendar declares. */
    const staleFrom = new Date("2026-08-27T08:50:00Z");

    it("keeps deciding while the last good answer is still fresh", () => {
      const answer = failing(new Date("2026-08-27T08:55:00Z"));
      expect(reading(answer, staleFrom).payload).toEqual(answer.payload);
    });

    it("stops deciding once that answer is out of date", () => {
      const answer = failing(new Date("2026-08-27T07:30:00Z"));

      expect(reading(answer, staleFrom)).toEqual({
        payload: {},
        fetchedAt: null,
        error: "Google returned 401 for its calendar list.",
      });
    });

    it("leaves a healthy answer alone however old it is", () => {
      const answer = { ...failing(new Date("2026-08-26T09:00:00Z")), error: undefined };
      expect(reading(answer, staleFrom).payload).toEqual(answer.payload);
    });
  });
});
