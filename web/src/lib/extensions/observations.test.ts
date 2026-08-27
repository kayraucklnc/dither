import { describe, expect, it } from "vitest";

import { observationKey } from "./observations";

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
