# Bundled extensions

An extension turns data from somewhere else into a screen on your display.
This directory holds the ones that ship with Dither. Anything here is loaded
with `bin/seed_extensions`.

**If you are an agent or script generating an extension: produce one directory
containing `configuration.yml` and `template.html.liquid`, drop it in here, and
run the loader. That is the entire integration contract — nothing in the app
needs to change.**

---

## The shape

```
extensions/
  your_extension/
    configuration.yml      metadata, settings fields, schedule, HTTP calls
    template.html.liquid   the markup rendered onto the panel
    README.md              optional: notes for whoever installs it
```

That pair is the same format the zip importer accepts, so a bundled extension
is also a valid export. Zip the two files and someone else can load it through
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
  - keyname: stop_id          # how you address it: {{ values.stop_id }}
    name: Stop ID             # label on the form
    field_type: string        # string, number, select, time, password...
    default: "8011160"        # prefilled value
    help_text: Which stop to show.
    optional: false
```

### exchanges

One HTTP call each. The URL, headers and body are **all Liquid-rendered**, so
field values interpolate directly. Responses merge into `{{ extension.data }}`.

```yaml
exchanges:
  - verb: get
    template: "{{ values.api_base }}/stops/{{ values.stop_id }}/departures"
    headers:
      Accept: application/json
      Authorization: "Bearer {{ values.api_key }}"
    body: {}
```

Multiple exchanges are allowed and run in order — useful when one call fetches
an ID that the next one needs.

---

## template.html.liquid

Standard Liquid. What you get:

| Variable | Contents |
|---|---|
| `{{ extension.data }}` | Parsed JSON from the exchanges |
| `{{ extension.values }}` | The settings the installer filled in |
| `{{ extension.fields }}` | Field definitions, if you need metadata |
| `{{ extension.label }}` | This extension's label |

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
- [ ] `bin/seed_extensions <name> --force` loads it cleanly
