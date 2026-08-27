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

- It is **shown** if it has templates. Each one draws a shape.
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
| `shape` | the box you are drawing into: `.id`, `.columns`, `.rows` (out of six) |
| `dither` | `.locale`, `.timezone`, `.offset_hours` from Settings |

### Shapes

A template is named for the shape it draws. `template.html.liquid` is the
full screen; everything else lives in `templates/<shape>.html.liquid`:

`full` · `half_width` · `half_height` · `quarter` · `third_width` ·
`two_thirds_width` · `third_height` · `two_thirds_height`

You do not need all eight. A design covers its **family** — wide bands
(`third_height`, `half_height`, `two_thirds_height`), tall columns
(`third_width`, `half_width`, `two_thirds_width`), `quarter`, and `full` —
so four templates usually cover everything. An exact template always wins over
a family match, and `shape.rows` lets one design fill a taller box:

```liquid
{% if shape.rows > 2 %}
  ...the extra detail that only fits in a taller band...
{% endif %}
```

Cross-family is *refused*, not scaled: a full-screen design will never be
crammed into a corner.

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
`clock_of` · `hour_of` · `as_percent` · `at_least`

Two traps that have already cost time: a bar's fill must be a **block**
element for a percentage height to apply, and a chart drawn from zero when
every value sits between 2980 and 4260 is seven identical bars — scale between
the low and the high instead.

## Checking your work

```bash
cd web
npx tsx --env-file=.env.local scripts/sweep.mts   # renders every extension at every shape
```

It flags anything that throws or comes back near-blank. Images land in
`/tmp/dither-sweep` — look at them. Every layout bug in this codebase was
found by looking.
