# Dither

Self-hosted e-ink display server. Started as a fork of `usetrmnl/terminus`;
rewritten in Next.js, which is now the whole thing. Repo:
github.com/kayraucklnc/dither.

**Server only.** Devices run *stock* trmnl-firmware, unmodified. Nothing a
device sees may change: `/api/setup`, `/api/display`, `/api/log` and their
headers are a fixed contract, written down in `docs/device-api-contract.md`
and checked end to end by `web/scripts/verify-device-api.mts`.

There is no Ruby left. The last thing it uniquely had - the Trenord client -
is ported to `web/src/lib/transit/trenord/`, and the rest went with it. If you
need the old implementation, it is in the history before the deletion commit.

## Running it

```bash
cd web
npm run dev            # http://localhost:3000, hot reload
npx tsx --env-file=.env.local scripts/seed.mts    # a device, screens, sources, a tree
npx drizzle-kit push --force                     # apply schema changes
```

Postgres comes from `compose.yml` at the repository root. The volume is still
named `terminus_database-data`, kept through the rename so nobody's screens
went with the old name.

## The model, and why

Six ideas. Getting any of them wrong is what the first version got wrong.

- **An extension is code; a widget is a use of it.** Extensions ship in
  `extensions/<name>/` and are never edited from the dashboard - there is no
  "new extension" button. A widget is one placement of one extension on one
  screen, with *its own* settings and *its own* fetched data. Two train routes
  on one screen is the whole point of the distinction.
- **A trigger is a source, not a borrowed widget.** Sources belong to a device,
  so you can decide on a station you are not displaying.
- **There is one kind of check: compare a value from a source.** The device is
  a source, the clock is a source, every trigger is a source. A connection
  that reports whether a laptop is awake declares `online: boolean` and the
  branch is buildable with no new check kind. `all` / `any` group several.
- **A device decides with a tree, not a state machine.** Walk from the root,
  answer questions, show the leaf you land on. "When it rains show the weather
  wherever you were" is one node near the top; when the rain stops the tree
  re-answers and lands wherever it should be now, so there is no return stack.
  Priority is depth. The only memory is `holdSeconds` on a leaf.
- **Notices are the additive half.** The tree is exclusive; a notice appears on
  whatever screen is showing, in the first widget whose extension declares
  `accepts_notices`. Extensions suggest their own.
- **Shapes are declared, and refused when they are not.** A widget takes the
  size it is drawn at on a 6x6 grid. An extension covers its *family* - a wide
  band design serves any wide band - but a full-page design is never crammed
  into a corner. See `standIn` in `web/src/lib/shapes.ts`.

## Traps already paid for

- **A render is cached by its design as well as its data.** The fingerprint
  includes each extension's template digest and the stylesheet's. Leave those
  out and editing a template changes nothing until the data moves.
- **The cache key is also the image filename**, and `/api/image/[key]` only
  accepts a plain hash. Anything distinguishing a render belongs *inside* the
  hash, never as a key prefix.
- **The framework must reset `<p>` margins.** At 76px that is 152px of phantom
  space, enough to push a hero clean off the panel.
- **`.bars` must `align-items: stretch`.** With `flex-end` every bar sizes to
  its content and a percentage height resolves against nothing.
- **A `<span>` with a percentage height does nothing** unless it is `display:
  block`. Templates write fills as spans.
- **Liquid counts timezone offset minutes *west*** of UTC, like
  `Date.getTimezoneOffset`. `Environment.timezoneOffset` counts east; it is
  negated once, at the engine.
- **A partial unique index, not a plain one**, for "one initial per device" -
  a plain unique on `(device, flag)` also forbids two rows where the flag is
  false.
- **Adopt server ids exactly once.** An autosave effect that writes state
  unconditionally retriggers itself and saves forever; the first version of
  this scrambled widget ids by index and corrupted a screen.
- **Extension templates use `{{ extension.values.x }}`**, and exchange
  responses arrive as `source_1`, `source_2`, never in `extension.data`.

## Checking the work

```bash
npx vitest run                                # unit
npx tsx scripts/verify-device-api.mts         # the firmware wire contract, live
npx tsx --env-file=.env.local scripts/sweep.mts   # every extension x every shape
npx tsx scripts/shot.mts <url> <out.png> [h]  # screenshot a page, report console errors
npx tsx scripts/measure.mts                   # element boxes, for layout bugs
```

Screenshots find what green tests do not. Every layout bug in this codebase
was found by looking, and several by `measure.mts` after looking was not
enough.
