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
- **Your own files are a source too.** The gallery reads
  `DITHER_GALLERY_DIR`, one folder per collection, and ships no pictures of its
  own - see `docs/gallery.md`. It is outside the repository because
  photographs are not source.
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
- **A panel is not a clock, and a design that draws one has to say so.** The
  device wakes, is handed one picture, paints it and sleeps for a quarter of an
  hour. So a design declares `tick`: how many seconds pass before it would look
  different, which is how often the server bothers to redraw it. And it is told
  `dither.window_minutes`: how long the picture has to stay true, which is what
  the wedge on the dial is drawn from and what `time_in_words` hedges by. The
  hands sit at the *middle* of that window, not at its start - the same error,
  split either side of the truth, so the average miss is halved.

## How a panel gets here

A device is **never created from the dashboard**, and a "new device" form would
be a row no hardware ever matches. It is identified by its MAC address, the MAC
is known to the panel and to nobody else, and the panel volunteers it the first
time it calls `/api/setup` - which provisions it, hands back a key, and gives it
a one-leaf tree so it has something to show before anyone has touched it.

What a person does instead is at `/devices/new`: copy the address the panel has
to reach (`API_URI`, not the address in the browser bar), and - if the board has
no firmware at all - write one over USB from the page. That flasher is the
WebSerial one the Ruby app had; it came back in Next form and reads merged
images from `web/public/downloads/`. The binaries are gitignored; the directory
and its README are not.

The images come from a `trmnl-firmware` checkout, and are never copied in by
hand:

```bash
cd web && npx tsx scripts/firmware.mts    # or pass the checkout as an argument
```

**A merged image is not "the file that starts with 0xE9".** A bare
`firmware.bin` starts with it too, and written at offset zero it produces a
board that does not boot while looking entirely plausible in a file listing. The
test is the partition table at `0x8000` - magic `AA 50` - with a bootloader at
`0x0` (ESP32-S3/C3/C6) or `0x1000` (classic ESP32). `firmware.mts` opens every
candidate and applies it before copying.

**The server address is not compiled in, and rebuilding to change it is the
wrong instinct.** `API_BASE_URL` in the firmware's `config.h` is only the
fallback; the real value is `api_url` in the board's NVS, which its own Wi-Fi
setup portal writes. One generic image per board is enough for any number of
installations.

The other direction *is* a dashboard action. Forgetting a device is on its card
and in its Device tab, and it says what goes with it, because the tree and the
notices live here rather than on the panel. A panel still on the network simply
introduces itself again afterwards, as a new device with a new key.

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
  rather than the provider being told what to fetch. That only holds because
  every presentational field says `presentation: true` and is dropped from the
  question: leave it off one field and a style change is a second fetch. The
  default is off, deliberately - two weather widgets sharing one city is a
  worse failure than one extra fetch.
- **A clock with no `tick` freezes forever.** The render cache key covers
  everything that can change the picture; a clock fetches nothing, so without a
  declared tick its key never moves and the panel keeps the picture from
  whenever the screen was last edited. The tick goes into the hash quantised,
  never raw - a key that moved every second would hand a new file to a device
  that cannot use it, and every one of those is a redraw and a slice of
  battery.
- **A countdown in a fetched payload stopped counting when it was fetched, and
  a check that reads it decides on a moment that has gone.** "Next meeting in
  30 minutes" was true when Google was asked; ten minutes later it is a lie,
  and it is a lie that never expires, because a number in a row does not tick.
  So `next_meeting_in` and `next_departure_in` declare `until` - the path to
  the *instant* they count down to - and `readFact` works the minutes out
  against `context.now`, reading as nothing once that instant has passed: a
  meeting that has started is not the next meeting. Only `readFact` may read a
  fact, and the canvas and the sources page go through it too, or the dashboard
  explains a screen the panel is not showing. It is the clock's `tick` problem
  wearing the flow layer's clothes.
- **A source that has stopped answering must stop deciding.** `recordFailure`
  keeps the last payload on purpose - a dead provider should leave the picture
  up with a note over it rather than blank the panel - but a decision has
  nowhere to put that note, so it just shows the wrong screen, for ever.
  `reading` takes `staleFrom`, the extension's own interval, and a failing
  answer older than that reads as nothing, the same way a stand-in does.
  Failing *and still fresh* keeps deciding, so one bad request does not move a
  panel off the screen it is on.
- **A flex row that has been shrunk pushes its own contents out.** A column
  whose children total a few pixels more than the box shrinks whichever row it
  likes, and a shrunk row with `align-items: flex-end` sends its contents up
  through the top of the panel - which reads as a missing caption rather than
  as an overflow. Everything that is not the part meant to absorb the slack
  wants `flex: none`.
- **Grey is the only tint this display has, and it is worth having.** The
  panel is 1-bit but the image is dithered on the way out, so a gradient
  resolves into a stipple. The area under the revenue line is a ramp from ink
  to paper and reads as depth; the solid black it replaced was a blot.
  Opacity, by contrast, dithers to noise - use a ramp, never `opacity`.
- **"All time" is bounded, so it is a floor and has to say so.** Nobody can
  promise to page through an account's whole history on a display's refresh, so
  the lifetime figure walks back three thousand movements and stops. When the
  bound bites, the figure carries a "+" and the detail line says there is more
  behind it - the same way the customer count does. A number that quietly means
  "at least" is the one kind of wrong figure a dashboard is never forgiven for.
- **Padding a band off its width eats the band.** A full-width strip is 800 by
  80; a twentieth of the *width* either side is 80 pixels of an 80-pixel box.
  Anything that draws at a band size takes its padding from the shorter side.
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

- **A design that lists rows takes its count from the box, not from a literal.**
  The transit board wrote `limit: 6` into the loop, so the same design drawn in
  a nine-row slot put six rows into room for three and the last one was sliced
  through the middle by `overflow: hidden` - which reads as a rendering fault
  rather than as a board that is full. `shape.height` is the budget; subtract
  the chrome that is actually there (an alert line, a notice strip) and divide.
  The fetch still trims to the "Departures to show" setting; the two are
  different questions and both have to be asked.

- **A source's settings form shows less than a widget's, and the same flag says
  how much less.** A source is an extension asked a question so something can
  branch on the answer; it draws nothing, so "Heading", "Show where" and "Mark
  the gaps" are not settings it has, and offering them invites the reasonable
  question of why a trigger needs a heading. `SettingsForm` takes
  `purpose="deciding"` and drops every `presentation: true` field, so one
  declaration serves both this and the fetch-sharing above. It says how many it
  dropped rather than silently showing a short list.

- **"Has a location" is not "somewhere to go".** A Google Meet reports a
  location - the literal string `"Meet"` - because that is what
  `placeOf` makes of a conference link, and a link pasted into the location box
  becomes its host name. So a rule that fires on `next_meeting_location present`
  sends you to the station for a call you take at your desk. The pair that means
  a place is `next_meeting_location present` **and** `next_meeting_is_remote
  is_false`.

- **Merging two accounts is a setting, not a check.** "Either of my calendars"
  is the source's `Calendars` field naming both primaries; the provider merges
  them into one list in time order, so `calendar.next` is already the soonest
  across all of them. A tree that mentions an account is a tree working around
  a source that was configured too narrowly.

- **A field the provider never reads is `presentation: true`, or it costs a
  fetch.** The transit heading and `show_platform` never reach the operator, and
  the weather `place`, `style` and `show_hours` never reach Open-Meteo - the
  forecast comes from the coordinates and the unit alone. Left undeclared, two
  boards of one route with different headings were two questions, which is
  exactly the failure the presentation flag exists to prevent.

- **A picture is dithered once, and only where it is placed one pixel for
  one.** The pipeline finishes in Floyd-Steinberg over the whole panel, so by
  default `as_image` hands the template *grey*. A picture may be reduced
  earlier - that is what the gallery's screens are, and a dot screen has to
  land on the picture's own pixels to be a dot screen at all - but only
  because every design asks for its crop at the exact size of its box. At any
  other size the browser resamples the marks back into greys and the page
  dither finds them again, which is the moire. It is why the contact sheet
  lays its grid out in pixels rather than in `1fr`, and why the print design's
  arithmetic has to include the gap under the plate. And enlarge pixel art
  with `nearest`: Lanczos turns a 524-pixel drawing into a blur, and a blur
  dithers into mush. See `web/src/lib/gallery/screen.ts`.
- **A dot screen measures a region, and its geometry is counted, not
  derived.** Sampling the middle pixel of each cell turns a picture that is
  already a printed halftone into confetti - the middle pixel is black or
  white at random - so the tone is a box average. And "area of a circle" gets
  the dot size wrong at both ends: a circle cannot fill a square, so solid
  black prints 92% black with paper in the corners, and enlarging the radius
  until it can makes every mid tone muddy. The table of radii is built by
  sorting sampled distances, so coverage is linear by construction.
- **A picture is cropped to the widget, not to the panel.** Sizes are free, so
  the rectangle worth taking out of a photograph at 12x12 is not the one worth
  taking at 3x12. The template is the first thing that knows which box it got,
  which is why the crop is a Liquid filter rather than part of the fetch - and
  it is what lets a portrait pin fill a widescreen panel.
- **A rotation with any memory in it redraws the panel for nothing.** Which
  gallery picture is up is a pure function of the clock: a cursor, a
  last-shown column or a random number would answer differently on every
  refetch, the fingerprint is taken over the payload, and a gallery meant to
  change hourly would hand the device a new file every five minutes for as
  long as it hung there. Nothing that moves between two fetches inside one
  hold - no countdown, no "fetched at" - may go in the payload either. See
  `web/src/lib/gallery/pick.ts`.
- **An extension that ships no data has no sample, and should not invent one.**
  Every other sample is plausible fiction that lets a screen be laid out before
  anyone owns an API key. A gallery's would be a picture id naming a file that
  is not there, so it is empty and a fresh installation gets the fault card
  with the path to fill. Inventing one would only have produced the
  missing-picture state with an extra step.

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
- **A connection is one row per account, plus one for the installation.** The
  empty `account` holds the OAuth client, which identifies *this server* and is
  the same whoever signs in; each real account holds only its refresh token,
  merged over the client at fetch time. Copy the client onto every grant and
  rotating a secret becomes an N-row job. A widget names `account|calendar`,
  because "primary" is a calendar on both of two accounts, and a selection
  naming an account that is gone is refused rather than pointed at whoever
  sorts first.
- **A row is not a link when the link finishes in the browser.** The client
  credentials are stored the moment they are pasted; only a stored refresh
  token means anyone consented. `isLinked` in `web/src/lib/connections/link.ts`
  is the one answer, and the fetcher, the page and the field sources all ask
  it.
- **An all-day calendar entry has no start time**, so it cannot go on a
  timeline. Placed there as 00:00 it takes the hero slot and fires the
  about-to-start notice at midnight. They are counted separately.
- **An all-day date floats, and must be compared as a date.** "2026-08-28" is
  the 28th wherever you are, with no instant behind it. Read as midnight UTC
  and compared against local midnights, a one-day birthday draws on two days
  everywhere east of Greenwich - and every test written in UTC passes. ISO date
  strings compare correctly on their own; use them.
- **A fetch that failed has to reach the renderer, or the panel lies.** An
  extension that has never answered draws a *fault* rather than its sample -
  four invented meetings look exactly like four real ones. One that answered
  before keeps its last picture with a note over it, in the outer document
  rather than the iframe, so no template knows about it. The fault is in the
  cache key too, or a screen that starts failing serves the healthy picture
  forever. See `web/src/lib/render/compose.ts`.
- **`.row` and `.entry` are scoped to `.facts` and `.timeline`.** Used outside
  them they are class names with no rules behind them, and a column layout
  silently stacks. Check the stylesheet before reaching for a class.
- **A calendar range is a boundary in a place, not a duration.** "The rest of
  today" at 22:00 is two hours; "the next twelve" is most of tomorrow. Every
  boundary is walked a day at a time, because a week containing a clocks change
  is 167 or 169 hours long. See `web/src/lib/connections/google/range.ts`.
- **A multiselect's value is sorted before it is stored.** The settings are
  hashed into the key an answer is cached under, so "work then family" must not
  be a different question from "family then work".
- **Migrate stored settings rather than compensating at read time.** Tolerating
  a missing field is not the same as being able to *show* it: a widget with no
  `range` was read correctly and drew an empty selector. One script
  (`web/scripts/calendar-settings.mts`) beat teaching one more component about
  the invisible state - and it had to cover *triggers* as well as widgets, or a
  widget and the source beside it stop sharing one answer.

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
