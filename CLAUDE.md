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
make up      # the shared database, this worktree's .env.local, its dependencies
make dev     # Next, on a port this worktree owns - `make url` prints it
make seed    # a device, screens, sources, a tree. Destructive
make push    # apply this branch's schema
make help    # everything else
```

`make` is a front end for `bin/dev`, which is a front end for docker compose
and npm; anything it does can still be done by hand from `web/`.

There is **one database for every worktree**. compose.yml names its Compose
project, so `make up` anywhere starts - or simply finds - the same container,
and screens seeded in one branch are there in the next. The volume is still
named `terminus_database-data`, kept through the rename so nobody's screens
went with the old name.

What is not shared is the port. Each worktree claims the first free one from
3001 up and caches it in `.context/dev.env`, so two branches can be open in two
browser tabs. 3000 is left to the packaged app in compose.yml. `make up` writes
that port, the database URL and this worktree's extension and storage
directories into `web/.env.local`, rewriting only the keys it owns - an API
token pasted in by hand survives.

Next allows one dev server per directory, so a second `make dev` in the same
worktree reports where the first one is rather than starting another.

## The model, and why

Six ideas. Getting any of them wrong is what the first version got wrong.

- **An extension is code; a widget is a use of it.** Extensions ship in
  `extensions/<name>/` and are never edited from the dashboard - there is no
  "new extension" button. A widget is one placement of one extension on one
  screen, with *its own* settings and *its own* fetched data. Two train routes
  on one screen is the whole point of the distinction.
- **A trigger is a source, not a borrowed widget.** Sources belong to a device,
  so you can decide on a station you are not displaying.
- **A connection is an account, linked once, used by every placement.** An
  extension says "I need Google Calendar" and the linked account answers on
  every screen; credentials never live in a widget's settings. Stripe takes a
  pasted key. Google takes an OAuth client this installation registers itself,
  then a consent screen - see `docs/google-calendar.md`. Markets and Home are
  still stand-ins and say so on the card.
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
- **Size is free; the look is a choice; both are refused when undeclared.** A
  widget takes any rectangle on a 12x12 grid. An extension declares *designs* -
  a template plus the range of sizes it will be drawn at - and a size no design
  covers is refused rather than scaled, so a full-page design is never crammed
  into a corner. Where several designs cover one size, the widget picks: that
  is the "style". See `web/src/lib/designs.ts`.

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
- **A widget's chosen style has to be carried by every render path.** It lives
  on the widget, so the editor preview, the saved-screen preview and the device
  each have to pass it through - and the zod schema on the editor's preview
  route strips it unless it is declared. Miss one and picking a style changes
  the thumbnail beside the picker and nothing on the panel.
- **A filter cannot appear inside a Liquid `if`.** `{% if a | modulo: 5 == 0 %}`
  is a tokenizer error, not a false. Assign first.
- **One answer per account, not per widget.** The Stripe payload carries every
  window and every metric, because an observation is cached by the question -
  the extension and its settings. Six revenue widgets showing six numbers must
  cost one trip, so the *widget* chooses from a payload that has everything,
  rather than the provider being told what to fetch.
- **Stripe counts in minor units, and a few currencies have none.** Divide a
  yen amount by a hundred and every figure is wrong by two orders of magnitude.
  See `web/src/lib/money.ts`.
- **The sample is for pictures, never for decisions.** `answersFor` falls back
  to the extension's sample when a question has no answer, which is what lets a
  screen be arranged before anyone owns the hardware. Hand that to the tree or
  to a notice and the device branches on invented data - the transit sample
  describes a service alert, so every unanswered board shouted one for ever.
  `reading()` is the gate; the flow layer never sees a stand-in.
- **Sources refresh when a device wakes, and something has to do it.** `serve`
  refreshes the stale ones *before* the walk, because the walk is what reads
  them. Left out, a source answers once at creation and decides with that
  forever, and a source whose first fetch failed never tries again.
- **"Today" is a local day, and midnight's offset is not always now's.** On the
  morning the clocks change, the naive answer is an hour into the previous day.
  See `web/src/lib/clock.ts`.

- **A Google grant issues one refresh token, not one per handshake.** Drop
  `prompt=consent` from the authorize URL and re-linking an account that has
  already said yes returns an access token and nothing durable, so the
  connection dies quietly an hour later. Access tokens are never stored - they
  are minted from the refresh token and held in memory.
- **The redirect URI is the address a *browser* reaches, and `API_URI` is not
  it.** `API_URI` names the host a panel on the wall can reach - a LAN address
  on a dev box - and Google refuses a plain-HTTP redirect URI that is not
  `localhost`, so it cannot even be registered. Devices do not do OAuth. It is
  read from the forwarded headers, then the host the browser sent, with
  `DITHER_OAUTH_ORIGIN` for a proxy that reveals neither, and shown on the
  connections page to be copied. Guessing it is `redirect_uri_mismatch` on
  Google's error page, not ours.
- **A row is not a link when the link finishes in the browser.** The client
  credentials are stored the moment they are pasted; only a stored refresh
  token means anyone consented. `isLinked` in `web/src/lib/connections/link.ts`
  is the one answer, and the fetcher, the page and the field sources all ask
  it.
- **An all-day calendar entry has no start time**, so it cannot go on a
  timeline. Placed there as 00:00 it takes the hero slot and fires the
  about-to-start notice at midnight. They are counted separately.

## Checking the work

```bash
make test                                     # unit
make verify                                   # the firmware wire contract, live

cd web                                        # the rest are still run by hand
npx tsx --env-file=.env.local scripts/sweep.mts   # every design, at the edges of its range
npx tsx --env-file=.env.local scripts/qa.mts      # every page, in a browser
npx tsx scripts/shot.mts <url> <out.png> [h]  # screenshot a page, report console errors
npx tsx scripts/measure.mts                   # element boxes, for layout bugs
```

Anything that talks to a running server reads `DITHER_URL` from `.env.local`,
which is why they take `--env-file`: without it they walk whatever answers on
3000, which is usually another worktree.

Screenshots find what green tests do not. Every layout bug in this codebase
was found by looking, and several by `measure.mts` after looking was not
enough.
