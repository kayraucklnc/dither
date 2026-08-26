# Dither

Self-hosted e-ink display server. Fork of usetrmnl/terminus, rebranded and
being reshaped. Repo: github.com/kayraucklnc/dither (`upstream` remote still
points at usetrmnl/terminus).

**Server only.** Devices run *stock* trmnl-firmware, unmodified. Nothing that a
device sees may change: `/api/setup`, `/api/display`, `/api/log` and their
headers are a fixed contract. The dashboard above them is ours to reshape.

The Ruby namespace is `Dither`, not `Terminus`. The database is still named
`terminus` and the compose project is still `terminus-*` — renaming either
means moving data, so it is deliberate leftover, not an oversight.

## Read this before design or architecture work

**`docs/product-brief.md` is the source of truth for where this product is
going.** Read it at the start of any session that touches the domain model,
naming, or UI. It outranks anything inherited from upstream Dither.

The essentials, inline, so they survive even without opening it:

- **Extensions declare their own layout variants** (full page, half, third).
  Supporting a shape is optional; full page is the floor. The composer must
  **refuse** to place an extension in a shape it has not declared — never fake
  it by scaling.
- **Scenes are composed by dragging extensions into slots**, not authored as
  raw HTML. Illegal arrangements are impossible, not merely discouraged.
- **Nothing is authored as a combination.** A scene is resolved from rules, not
  hand-built per situation, or you get 2^N screens for N extensions.
- **Rules decide what shows.** A device has an ordered list of rules; the first
  whose condition holds wins. Several matching at once is normal — priority
  decides, never insertion order. A rule may override the refresh cadence.
  `lib/dither/conditions.rb` is the condition vocabulary; adding a kind is an
  entry there plus a form field, never a migration.
- **The layout is derived, not chosen** — the resolver picks the smallest layout
  that seats every active rule, which only works because extensions declare
  shapes.
- **Naming settled**: Shape / Layout / Scene / Mode + Rules. "View" was rejected
  because `Dither::Views` is Hanami's own namespace.
- **A preview showing what the device sees right now** is core, not a
  nice-to-have. The product must be evaluable before owning hardware.
- The user has authorised **scrapping inherited code and naming freely**.

## Running it

```bash
bin/dev up        # dev stack, source-mounted, everything hot reloads
bin/dev down
bin/dev logs reloader   # what the Ruby watcher is restarting on
```

http://localhost:2300. Production build: `docker compose up -d`.

Everything hot reloads. CSS and JS via the `assets` service, ERB per render,
and Ruby via `bin/dev_reloader`, which polls for changes and touches
`tmp/restart.txt` for Puma's `tmp_restart` plugin. Polling rather than inotify
because filesystem events do not cross the macOS/container boundary reliably.

## Seeding

```bash
bin/dev exec web bundle exec bin/seed_designs      # example designs
bin/dev exec web bundle exec bin/seed_extensions   # bundled extensions
```

## Gotchas that have already bitten

- **Sanitize strips CSS custom properties** not listed in `config/sanitize.yml`.
  A new framework token must be added there or `:root` silently comes back
  empty while `var()` references survive and resolve to nothing.
- **Screens render with no origin.** `Shoter` assigns `page.content` directly,
  so relative URLs cannot resolve. Stylesheets must be inlined; fonts are
  referenced by installed family name (Inter, DejaVu, Noto CJK).
- **Views must inherit `Dither::View`**, not `Hanami::View`, or they render
  without the app layout and the navigation silently differs on that page.
- **`relations.*` returns Hashes**; use `repositories.*` for structs with
  associations.
- Host `node_modules` holds a darwin-arm64 esbuild binary — the dev compose
  masks it with a named volume so the linux one wins.
- **`liquid.sanitize` returns a whole document**, not a fragment. Anything
  embedding a rendered extension must unwrap `<body>` first, or the nested
  `<html>` makes `TempPather` skip inlining the stylesheet.
- **Exchange responses arrive as `source_1`, `source_2`…**, never in
  `extension.data`. Settings are `{{ extension.values.x }}`, not
  `{{ values.x }}`.
- **`expose :layout` in a view never reaches the template** — Hanami views own
  that name. Same trap as `Dither::Views`.
