# Dither

Self-hosted e-ink display server. Fork of usetrmnl/terminus, rebranded and
being reshaped. Repo: github.com/kayraucklnc/dither (`upstream` remote still
points at usetrmnl/terminus).

## Read this before design or architecture work

**`docs/product-brief.md` is the source of truth for where this product is
going.** Read it at the start of any session that touches the domain model,
naming, or UI. It outranks anything inherited from upstream Terminus.

The essentials, inline, so they survive even without opening it:

- **Extensions declare their own layout variants** (full page, half, third).
  Supporting a shape is optional; full page is the floor. The composer must
  **refuse** to place an extension in a shape it has not declared — never fake
  it by scaling.
- **Screens are composed by dragging extensions into slots**, not authored as
  raw HTML. Illegal arrangements should be impossible, not merely discouraged.
- **Screens are selected by triggers**: time, battery %, webhook, API result,
  extension status. Several can be true at once; the resolution model is an
  open question and must be deliberate, not insertion order.
- **Renaming in progress**: Design → Layout, Screen → View, Playlist →
  Schedule. "Playlist" wrongly implies shuffle.
- **A preview showing what the device sees right now** is core, not a
  nice-to-have. The product must be evaluable before owning hardware.
- The user has authorised **scrapping inherited code and naming freely**.

## Running it

```bash
bin/dev up        # dev stack, source-mounted, hot reload on CSS/JS/ERB
bin/dev down
bin/dev restart web   # needed after Ruby changes (no hanami-reloader)
```

http://localhost:2300. Production build: `docker compose up -d`.

Ruby changes do **not** hot reload. CSS, JS and ERB templates do.

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
- **Views must inherit `Terminus::View`**, not `Hanami::View`, or they render
  without the app layout and the navigation silently differs on that page.
- **`relations.*` returns Hashes**; use `repositories.*` for structs with
  associations.
- Host `node_modules` holds a darwin-arm64 esbuild binary — the dev compose
  masks it with a named volume so the linux one wins.
