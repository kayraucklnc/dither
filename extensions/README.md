# Writing an extension

An extension is a directory. Drop one in here and Dither picks it up on the
next request — there is no registration step, no database row, and no button
in the dashboard that creates one. That is deliberate: an extension is code.

```
extensions/tide/
├── configuration.yml           the manifest
├── template.html.liquid        the full-screen design
└── templates/
    ├── half_width.html.liquid
    ├── quarter.html.liquid
    ├── third_height.html.liquid
    └── third_width.html.liquid
```

Scaffold one:

```bash
cd web && npx tsx scripts/new-extension.mts tide "Tide times"
```

## The two things an extension can be

An extension can be **shown**, **decided on**, or both.

- It is **shown** if it has templates. Each one is a *design*, and covers a
  range of sizes.
- It is **decided on** if it declares `facts`. Each fact becomes something a
  device can branch on, and something a notice can fire from.

A trigger-only extension with no templates is fine. So is a display-only one
with no facts — the clock is exactly that, because everything you would branch
on about the time is already reported by the built-in Time source, and two
answers to one question is worse than none.

## The manifest

```yaml
version: "1.0.0"
name: tide                     # the directory name, and how widgets refer to it
label: Tide times
description: >
  High and low water for a port, and how long until the next one.

kind: poll                     # static | poll | transit | connection
mode: text
tags: [sea]

interval: 30                   # how often data is refetched
unit: minute                   # none | minute | hour | day
```

`kind` decides where data comes from:

| kind | data from | needs |
|---|---|---|
| `static` | nothing; the template draws from settings | — |
| `poll` | the URLs in `exchanges` | `exchanges` |
| `connection` | an account linked under Connections | `connection: <provider>` |
| `transit` | a provider built into Dither | — |

## Settings

Every field becomes a control in the widget inspector *and* in the trigger
editor. They are per placement: two tide widgets on one screen are two ports.

```yaml
fields:
  - keyname: port
    name: Port
    field_type: select        # string | text | number | boolean | select | time | url
    default: dover
    options:
      - { value: dover, label: Dover }
      - { value: newlyn, label: Newlyn }
    help_text: Which port these times are for.
    optional: false
```

There is no dashboard code to write for a new field. Declare it and the form
grows a control.

## Fetching

The URL is a Liquid template over *this widget's* settings, which is what lets
two placements fetch two different things:

```yaml
exchanges:
  - verb: get
    template: https://api.example.com/tides?port={{ extension.values.port }}
    headers:
      Accept: application/json
```

Answers arrive in the template as `source_1`, `source_2`, … numbered by order.

## Facts, which are triggers

```yaml
facts:
  - key: minutes_to_high
    label: Next high water in
    type: duration            # duration | number | text | boolean | time | weekday
    path: source_1.next_high.minutes
    unit: minutes
```

`path` is dotted, and a numeric step indexes an array:
`source_1.events.0.height`.

The **type decides which comparisons the editor offers**, so a duration is
never offered "contains" and a rule that could not possibly be true cannot be
built. Every source also reports `minutes_since_update` for free.

## Notices

A notice is something said on top of whatever screen is showing. Suggest your
own and they appear as one-click additions when someone adds your extension as
a source:

```yaml
notices:
  - key: spring_tide
    label: Spring tide
    icon: droplet
    loud: true                # inverted, for the ones that matter
    text: "Spring tide — {{ source_1.next_high.height }}m at {{ source_1.next_high.at }}"
    when:
      fact: range_metres
      operator: gte
      value: 6
```

To *receive* notices from other extensions, say so and render them:

```yaml
accepts_notices: true
```

```liquid
{% if notices.size > 0 %}
  <div class="notice-strip">
    {% for notice in notices %}
      <span class="notice{% if notice.loud %} notice--loud{% endif %}">
        <span class="i i-{{ notice.icon }}"></span>{{ notice.text }}
      </span>
    {% endfor %}
  </div>
{% endif %}
```

A template that ignores `notices` simply never shows them. The hook is offered,
not imposed.

## Sample data

```yaml
sample:
  source_1:
    next_high: { at: "14:12", minutes: 96, height: 6.4 }
```

Used in previews until something real has been fetched, and never sent to a
device. It is what lets a screen be designed before anyone owns the hardware or
has an API key — so make it plausible, and make it exercise the awkward cases.

## Templates

Plain Liquid. The context is:

| | |
|---|---|
| `extension.values.<field>` | this widget's settings |
| `source_1`, `source_2`, … | what each exchange answered |
| `notices` | things another extension wants said here |
| `shape` | the box you are drawing into — see below |
| `dither` | `.locale`, `.timezone`, `.offset_hours` from Settings |

### Sizes and designs

A screen is a **12×12 grid**, and a widget can be any rectangle on it. Twelve
is the smallest number that divides evenly by two, three, four and six, so
halves, thirds, quarters and sixths all land on whole tracks — and one cell is
67×40 pixels on an 800×480 panel, fine enough to nudge a widget rather than
jump it between fixed sizes.

A **design** is one template plus the range of sizes it is willing to draw. It
is not a size: several designs can cover the same size, and then the widget
picks between them — that is what "style" means in the dashboard.

Declare them:

```yaml
designs:
  - template: figure          # templates/figure.html.liquid
    label: Figure
    hint: One number, as large as the box allows.
    columns: [2, 12]          # smallest, largest — out of twelve
    rows: [2, 12]
    nominal: [4, 4]           # the size it was really drawn for
```

`nominal` decides which design wins when more than one covers a size: the least
stretched one, measured as a scale-free distance from its nominal. It is also
the size the catalogue previews it at.

**You usually do not need to declare anything.** A template named after one of
the eight original shapes inherits that shape's range:

| template | draws sizes |
|---|---|
| `full` (the root `template.html.liquid`) | 9–12 × 9–12 |
| `two_thirds_height` | 8–12 × 6–10 |
| `half_height` | 8–12 × 4–8 |
| `third_height` | 8–12 × 2–5 |
| `two_thirds_width` | 6–10 × 8–12 |
| `half_width` | 4–8 × 8–12 |
| `third_width` | 2–5 × 8–12 |
| `quarter` | 4–8 × 3–8 |

So four templates — full, a wide band, a tall column and a box — still cover
most of the grid, and every extension written before designs existed kept
working unedited.

A size no design covers is **refused**, not scaled. A full-screen design is
never crammed into a corner, and the editor will not let you draw one there.

### Drawing at more than one size

A design covers a *range*, so it has to cope with every size in it. `shape`
tells it which one it got:

| | |
|---|---|
| `shape.columns`, `shape.rows` | out of twelve |
| `shape.width`, `shape.height` | the box in real pixels |
| `shape.wide`, `shape.tall` | at least two thirds of that axis |
| `shape.band` | wide and shallow |
| `shape.roomy` | at least 40% of the panel's area |
| `shape.id`, `shape.label` | which design is drawing |

Use the pixels to size type that has to fit, rather than picking a font size
and hoping. `at_least` and `at_most` clamp:

```liquid
{%- assign chars = figure | size | at_least: 3 -%}
{%- assign by_width = shape.width | minus: 40 | times: 100 | divided_by: chars | divided_by: 56 -%}
{%- assign by_height = shape.height | times: 40 | divided_by: 100 -%}
<p style="font-size: {{ by_width | at_most: by_height | at_most: 120 | at_least: 15 }}px">…</p>
```

Fit to the *shorter* of the two: a wide shallow box runs out of height first
and a narrow tall one runs out of width, and hard-coding either is how type
ends up clipped. Anything under a heading should be one line and `.truncate` —
a caption that wraps pushes the figure out of a box with `overflow: hidden`,
and it reads as a rendering bug rather than as too many words.

### Drawing for 1 bit

The panel is black and white. There are no tints, so weight and space do the
work opacity would elsewhere.

Classes worth knowing — see `web/src/lib/render/screen-framework.css`:

- Structure: `.screen`, `.title-bar`, `.content`, `.footer-bar`
- Layout: `.layout--col`, `.layout--row`, `.layout--center`, `.cols--2/3`,
  `.split-detail`, `.stack`, `.fit`
- Type: `.t-xxl` … `.t-xs`, `.t-bold`, `.t-mono`, `.t-upper`, `.truncate`,
  `.clamp-2`
- Components: `.metric`, `.facts`, `.list`, `.timeline`, `.bars`, `.gauge`,
  `.badge` (solid), `.chip` (outline), `.hero`, `.notice-strip`
- Icons: `<span class="i i-rain i-lg"></span>` — 47 of them, sized `i-xs`
  through `i-xxl`, taking the ink colour of whatever they sit in

Filters that save a hundred lines of `{% case %}`:

`weather_icon` · `weather_label` · `weather_short` · `compass` · `in_words` ·
`clock_of` · `hour_of` · `as_percent` · `at_least` · `at_most`

Two traps that have already cost time: a bar's fill must be a **block**
element for a percentage height to apply, and a chart drawn from zero when
every value sits between 2980 and 4260 is seven identical bars — scale between
the low and the high instead.

## Checking your work

```bash
cd web
npx tsx --env-file=.env.local scripts/sweep.mts   # renders every design at the edges of its range
```

It renders each design at the smallest size it claims, the largest, both
lopsided corners of its range and its nominal — the sizes most likely to break
type that fits itself to its box.

It flags anything that throws or comes back near-blank. Images land in
`/tmp/dither-sweep` — look at them. Every layout bug in this codebase was
found by looking.

### Settings that follow the settings above them

A field can hide itself unless another answer has a particular value, so a
form asks one question at a time rather than all of them at once:

```yaml
  - keyname: window
    name: Over what period
    field_type: select
    options: [today, last_7d, last_30d]
    visible_when:
      field: metric            # another keyname, or `design` for the style
      any_of: [taken]
```

`field: design` is how a design brings its own settings — a chart style can ask
what goes behind the number without every other style asking too.
