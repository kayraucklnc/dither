// The shared cases in spec/html/cases.json; the firmware's host tests read the same file.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { htmlToText } from "./html";
import { extract } from "./values";

const file = fileURLToPath(new URL("../../../spec/html/cases.json", import.meta.url));
const cases = JSON.parse(readFileSync(file, "utf8")) as { name: string; html: string; text: string; title: string }[];

describe("web pages as text", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    expect(htmlToText(new TextEncoder().encode(c.html))).toEqual({ text: c.text, title: c.title });
  });

  it("keeps text and title, and nothing else", () => {
    const source = { id: "p", url: "", every: 300, html: true as const, values: [
      { key: "body", path: "text" }, { key: "name", path: "title" }, { key: "other", path: "h1" }, { key: "n", path: "text", count: 3 },
    ] };
    const page = new TextEncoder().encode("<title>T</title><p>Hi</p>");
    expect(Object.fromEntries(extract(source, page))).toEqual({ "p.body": "Hi", "p.name": "T", "p.other": null, "p.n": null });
  });
});
