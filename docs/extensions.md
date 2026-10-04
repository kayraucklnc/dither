# Writing a widget

A widget is a folder in `app/src/extensions/` with one `index.ts`, plus a line
in `app/src/extensions/index.ts`. The firmware never changes.

The whole API is `app/src/extensions/api.ts`. In short, an extension:

- **declares settings** (`fields`) — the editor builds the form;
- **optionally says what to fetch** (`source`) — one HTTPS GET returning JSON,
  and which values to keep from it, by path;
- **offers sample values** (`sample`) — for the preview before anything is
  fetched, and for anyone without the data yet;
- **lists facts** (`facts`) — values that rules can test, in words;
- **draws** (`draw`) — with the `Draw` helpers, in its own box.

`draw` runs in the browser when the project compiles, so it can measure text
and lay things out however it likes. Anything that should change on the panel
between flashes is drawn as a *binding*: `d.value("temp", { num: { d: 0 } })`
becomes "the `temp` value, no decimals", filled in on the panel when it wakes.

```ts
import { defineExtension } from "../api";

export default defineExtension({
  id: "visitors",
  name: "Visitors",
  description: "Today's visitors, from your analytics.",
  icon: "globe",
  category: "data",
  size: { min: [3, 2], default: [5, 3] },
  fields: [{ key: "site", label: "Site", kind: "text" }],
  defaults: () => ({ site: "" }),
  source: (s) => s.site ? {
    url: `https://stats.example.com/api/${s.site}/today`,
    every: 30,
    values: { count: "visitors", trend: "change.percent" },
  } : null,
  sample: () => ({ count: 1834, trend: 12.5 }),
  facts: () => [{ key: "count", label: "Visitors today", type: "number", value: "count" }],
  draw(d) {
    const size = d.fit(["88,888"], d.width, d.height * 0.7, { weight: 700 });
    d.text(d.value("count", { num: { d: 0, sep: "," } }), { x: 0, y: 0, w: d.width, h: d.height * 0.7, size, weight: 700 });
    d.text(["Visitors · ", d.value("trend", { num: { d: 1 } }), "%"], { x: 0, y: d.height * 0.7, w: d.width, h: d.height * 0.3, size: 20 });
  },
});
```

Things worth knowing:

- **The panel does the asking.** `source` can use time placeholders in the URL
  (`{{now|YYYY-MM-DD}}`, `{{today-518400}}` for a week ago), an OAuth refresh
  (`auth`, see Google Calendar), an encrypted reply (`decode`, see Trenord), and
  totals over a list (`{ path: "data", agg: "sum", field: "amount" }`, see
  Stripe). Everything else is a plain JSON GET.
- **Design as one piece.** The bundled boards (trains, revenue) share a
  language: the one number that matters in a black band, everything after it
  in the same columns underneath, rows filling the box. A widget that is a
  scatter of separately placed labels reads as noise from across a room.
- **Facts and flags.** A `number` fact can carry a `format` (`{ until: true }`
  turns a time into minutes from now); a `flag` fact is a yes/no condition
  worked out on the panel, written with the widget's own value keys.

- **Lay out for the worst case.** Size text with `d.fit` against the widest
  thing the value could become (`"-88°"`, `"88,888"`), never the sample — the
  real value arrives after you have drawn.
- **Formats run on the panel.** `num`, `time`, `until`, `map`, `steps`,
  `scale`, `upper` (see `docs/format.md`) turn raw values into text there.
  Use `map` to turn codes into words or icon names.
- **Pictures in a value** are chosen with `d.iconFor(key, format, names, box)`:
  the format turns the value into an icon name, and only the named icons are
  packed.
- **Conditional drawing** is `d.when(condition, () => …)` — evaluated on the
  panel each wake.
- **Fonts and icons** come from `app/src/assets` (Inter, Lucide). Sizes are
  fixed; `d.fit` and `fontInfo` pick from what exists.
- **The panel has no browser.** It cannot run JavaScript, follow a login, or
  read anything but JSON. If an API needs any of that, it is not a fit yet.

Test a new widget by adding it to a screen in the editor; the gallery draws it
with its sample data straight away.
