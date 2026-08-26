# Bundled extensions

An extension turns data from somewhere else into a screen on your display.
This directory holds the ones that ship with Dither. Anything here is loaded
with `bin/seed_extensions`.

**If you are an agent or script generating an extension: produce one directory
containing `configuration.yml` and `template.html.liquid`, drop it in here, and
run the loader. That is the entire integration contract — nothing in the app
needs to change.** Add `templates/<shape>.html.liquid` files if you want the
extension to be placeable in less than a whole panel; see
[Layout variants](#layout-variants).

---

## The shape

```
extensions/
  your_extension/
    configuration.yml               metadata, settings fields, schedule, HTTP calls
    template.html.liquid            the whole panel — required
    templates/
      half_width.html.liquid        optional: the same extension, half the width
      quarter.html.liquid           optional: one corner
    README.md                       optional: notes for whoever installs it
```

That set is the same format the zip importer accepts, so a bundled extension is
also a valid export. Zip the directory and someone else can load it through
**Extensions → Import** without touching the filesystem.

## Installing

```bash
bin/seed_extensions                    # install anything not present yet
bin/seed_extensions --force            # replace what is already installed
bin/seed_extensions public_transport   # just one
```

Run it inside the dev stack with `bin/dev exec web bundle exec bin/seed_extensions`.

Replacing deletes the existing row first. Exchanges cascade, so the database
ends up matching the files exactly instead of accumulating stale calls.

---

## configuration.yml

| Key | Required | Notes |
|---|---|---|
| `version` | yes | Format version. Use `"1.0.0"`. |
| `name` | yes | Unique machine name. Lowercase, underscores. |
| `label` | yes | Human name shown in the UI. |
| `description` | yes | One or two sentences. May be null. |
| `kind` | yes | `poll` (we call the API on a schedule) or `webhook` (they post to us). |
| `mode` | yes | `text` for HTML-rendered screens. |
| `tags` | yes | Array of strings, may be empty. |
| `interval` / `unit` | yes | Schedule. Units: `none`, `minute`, `hour`, `day`, `week`, `month`. |
| `days` | yes | Weekday names when `unit: week`, otherwise `[]`. |
| `last_day_of_month` | yes | Boolean. |
| `start_at` | yes | RFC 3339 timestamp the schedule counts from. |
| `static_body` | yes | Fixed data merged into the template. `{}` if unused. |
| `data` | yes | Seed data. `{}` — the exchanges fill this in. |
| `fields` | yes | The settings form. See below. |
| `exchanges` | no | The HTTP calls. See below. |

### fields

Each entry becomes one input on the extension's settings page. Whoever installs
the extension fills these in; you never hardcode their API key or stop ID.

```yaml
fields:
  - keyname: stop_id          # address it as {{ extension.values.stop_id }}
    name: Stop ID             # label on the form
    field_type: string        # string, number, select, time, password...
    default: "8011160"        # prefilled value
    help_text: Which stop to show.
    optional: false
```

### exchanges

One HTTP call each. The URL, headers and body are **all Liquid-rendered**, so
field values interpolate directly. Each exchange's parsed response arrives in
the template as `{{ source_1 }}`, `{{ source_2 }}`, numbered in the order the
exchanges are listed.

```yaml
exchanges:
  - verb: get
    template: "{{ extension.values.api_base }}/stops/{{ extension.values.stop_id }}/departures"
    headers:
      Accept: application/json
      Authorization: "Bearer {{ extension.values.api_key }}"
    body: {}
```

Multiple exchanges are allowed and run in order — useful when one call fetches
an ID that the next one needs.

---

## Layout variants

A scene divides the panel into slots and drops one extension into each. An
extension may only be placed in a slot whose **shape** it has designed for.

**You declare a shape by writing its template.** There is no list to keep in
sync: `templates/half_width.html.liquid` means "this extension can occupy half
the width", and its absence means it cannot. Nothing is ever scaled down to
fit — an extension that was not designed for a corner is simply not offered
for that corner.

`template.html.liquid` at the root is the full-page shape and is always
required. Everything else is optional.

### The shapes

| File | Covers | At 800×480 | Good for |
|---|---|---|---|
| `template.html.liquid` | the whole panel | 800×480 | required, always |
| `templates/half_width.html.liquid` | ½ w × full h | 400×480 | a tall list beside something else |
| `templates/half_height.html.liquid` | full w × ½ h | 800×240 | a wide band |
| `templates/quarter.html.liquid` | ½ w × ½ h | 400×240 | one corner: a number and a label |
| `templates/third_width.html.liquid` | ⅓ w × full h | 267×480 | a narrow column of short rows |
| `templates/two_thirds_width.html.liquid` | ⅔ w × full h | 533×480 | the wide side of a sidebar split |
| `templates/third_height.html.liquid` | full w × ⅓ h | 800×160 | a status strip |
| `templates/two_thirds_height.html.liquid` | full w × ⅔ h | 800×320 | the tall side of a banner split |

A name outside this list is a load error, not a silently ignored file. The
canonical list lives in `lib/terminus/composition.rb`.

### The scenes they unlock

Declaring a shape is what makes an arrangement selectable. An extension that
only has the full-page template can only ever be a whole scene by itself.

| Scene layout | Slots |
|---|---|
| Full page | `full` |
| Side by side | `half_width` ×2 |
| Stacked | `half_height` ×2 |
| Quadrants | `quarter` ×4 |
| Three columns | `third_width` ×3 |
| Three rows | `third_height` ×3 |
| Sidebar, left / right | `third_width` + `two_thirds_width` |
| Banner and body | `third_height` + `two_thirds_height` |
| Body and strip | `two_thirds_height` + `third_height` |

Mixed scenes work the same way: to sit in the narrow side of a sidebar you
need `third_width`, whatever fills the other side needs `two_thirds_width`.

### Designing one

A variant is a **different design, not the same design smaller**. The
full-page departures board lists six rows with a title bar and a footer; the
quarter shows one large time and one follow-up line, because that is all
anyone can read from a corner. If a shape cannot carry your content
meaningfully, do not write it — the extension is more useful refusing the slot
than filling it with unreadable text.

Each variant renders into a box of exactly its own size, so `100vh` and `100%`
mean the slot, not the panel. Small shapes get tighter padding and smaller
headings automatically; you do not have to fight the full-page defaults.

Compare `public_transport/template.html.liquid` with
`public_transport/templates/quarter.html.liquid` for a worked pair.

---

## template.html.liquid

Standard Liquid. What you get:

| Variable | Contents |
|---|---|
| `{{ source_1 }}`, `{{ source_2 }}` … | Parsed JSON from each exchange, in order |
| `{{ extension.values }}` | The settings the installer filled in |
| `{{ extension.fields }}` | Field definitions, if you need metadata |
| `{{ extension.data }}` | The extension's own editable data |
| `{{ extension.label }}` | This extension's label |

Exchange responses land in `source_N`, **not** in `extension.data` — that trips
up everyone once. `extension.data` is the hand-editable blob on the settings
page.

Use the **Dither screen framework** classes (`lib/terminus/screen_framework.css`).
Do not link external stylesheets: the renderer has no origin, so relative URLs
cannot resolve and a remote fetch would put someone else's CDN on the critical
path of every render.

Design for the medium. The render is dithered to 1 bit, so:

- Pure black on white. Mid-greys become noise.
- No shadows, gradients or opacity — they dither to speckle.
- Rules at 2–3px. Hairlines disappear.
- Big type steps. 800×480 is not much room.

Useful classes:

```
.screen .screen--invert          root, and its inverted variant
.title-bar .footer-bar           top and bottom bars
.content                         main area
.cols--2 .cols--3 .cols--sidebar column grids
.stack .stack--tight .fit        vertical flow
.list .list-item                 rows with rules between
.stat .value .label              one big number
.kv .k .v                        key/value line
.badge .box .rule                inverted pill, bordered box, divider
.t-xxl … .t-xs .t-bold .t-mono   type scale
.truncate .clamp-2 .clamp-3      overflow control
```

Always handle the empty case. An API that returns nothing should render a
readable message, not a blank panel — you will not be there to see it fail.

---

## Worked example

`public_transport/` is complete and installed by default. It polls a transit
API every five minutes and renders the next departures. To adapt it to a
different provider, change only the exchange URL and the field paths in the
template loop; the structure stays.

## Checklist before shipping one

- [ ] `name` is unique and lowercase
- [ ] No secrets in the file — anything user-specific is a `field`
- [ ] `default` values make it render sensibly before configuration
- [ ] The template handles empty and error responses
- [ ] Rendered and eyeballed at 800×480 after dithering
- [ ] Every declared variant eyeballed at *its own* size, not just full page
- [ ] No variant written that cannot carry the content honestly
- [ ] `bin/seed_extensions <name> --force` loads it cleanly and reports the
      shapes you expected
