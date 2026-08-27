# Dither

A self-hosted server for e-ink displays. You design screens, describe when each
one should show, and the panel on your wall asks for a picture every so often.

Started as a fork of [usetrmnl/terminus](https://github.com/usetrmnl/terminus)
and rewritten. Devices run **stock TRMNL firmware**, unmodified — the wire
contract is fixed and documented in [`docs/device-api-contract.md`](docs/device-api-contract.md).

## Running it

```bash
cp .env.example .env      # set a database password
docker compose up -d
```

Then <http://localhost:3000>. A panel pointed at that host registers itself the
first time it calls `/api/setup`.

For development:

```bash
cd web
npm install
npm run dev
npx tsx --env-file=.env.local scripts/seed.mts   # a device, screens, sources, a tree
```

## How it works

Six ideas. Each exists because the obvious alternative was tried first and
failed in a way worth remembering.

**An extension is code; a widget is a use of it.** Extensions live in
`extensions/<name>/` and are never edited from the dashboard — there is no "new
extension" button. A widget is one placement of one extension on one screen,
with its own settings. Two train routes on one screen is the whole point.

**A source is a question, not a panel's property.** Sources are shared: the
display in the hall can switch screens on Milan transit while the one on the
desk shows an alert about it, fetched once between them.

**There is one kind of check.** The device is a source, the clock is a source,
every trigger is a source, and a check compares a value from one. A connection
reporting whether a laptop is awake declares `online: boolean` and the branch is
buildable — no new check kind, no editor change.

**A device decides with a tree.** Walk from the root, answer questions, show the
leaf you land on. "When it rains show the weather wherever you were" is one node
near the top; when the rain stops the tree re-answers and lands wherever it
should be *now*, so there is no return stack. Priority is depth.

**Notices are the additive half.** The tree is exclusive — you end on one leaf.
A notice appears on whatever screen is showing, as a small glyph in the first
widget whose design has somewhere to put one.

**Shapes are declared, and refused when they are not.** A widget takes the size
you draw it on a six-by-six grid. An extension covers its *family* — a wide band
design serves any wide band — but a full-screen design is never crammed into a
corner.

## Writing an extension

See [`extensions/README.md`](extensions/README.md), and:

```bash
cd web && npx tsx scripts/new-extension.mts tide "Tide times"
```

That writes a working extension — manifest, sample data, a fact, and four
templates covering all eight shapes — so the first thing you see is a render
rather than an error.

## Checking the work

```bash
cd web
npx vitest run                                   # unit
npx tsx scripts/verify-device-api.mts            # the firmware wire contract, live
npx tsx --env-file=.env.local scripts/sweep.mts  # every extension at every shape
npx tsx scripts/qa.mts                           # every page, in a browser
```

Screenshots find what green tests do not. Every layout bug in this codebase was
found by looking.

## Licence

See [LICENSE.adoc](LICENSE.adoc).
