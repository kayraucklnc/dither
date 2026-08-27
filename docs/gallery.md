# Pictures

The `gallery` extension hangs your own pictures on the panel. It ships with
none: an e-ink display is very good at showing a photograph and very bad at
showing somebody else's stock art, and a folder padded out with defaults is a
folder you never get round to putting your own things in.

## Where they go

One directory, named by `DITHER_GALLERY_DIR`. `make up` points it at
`web/.gallery` in this worktree and git ignores it, because photographs are not
source and a folder git watches is one you think twice before dropping a
hundred megabytes into.

```
web/.gallery/
├── pins/
│   ├── gotham-8955ef.jpg
│   └── halftone-123501.jpg
├── holidays/
│   └── ...
└── something-loose.png
```

Every folder is a **collection**. Anything sitting loose at the top is a
collection too, called *Loose*, so dropping one jpeg in works before you have
thought about how to file things. An empty folder is not offered.

There is no upload, no album table and no "add picture" button - the same
bargain the extension format makes everywhere else. Copy files in and they are
in the inspector's menu on the next request; nothing needs restarting.

## Putting things in it

`cp` is a complete answer. The script exists for the two things `cp` gets
wrong - fetching over http, and naming the file after the picture:

```bash
cd web
npx tsx --env-file=.env.local scripts/gallery-add.mts pins \
  --title "Gotham" https://example.com/8955ef8955ef8955.jpg \
  ~/Pictures/*.jpg
```

**The filename is the caption.** `long-shadow.jpg` captions as "Long shadow";
a name that is nothing but a hash captions as nothing at all, because
"B8c8f0a9d3603be4" under a photograph is worse than white space. The digest the
script appends is a filing detail and is stripped before the caption is read,
so two pictures called `sunset.jpg` can both be in one folder.

Nothing is converted on the way in. Cropping, tone and the dither all happen at
render time, at the size of the box being drawn, so the original is the right
thing to keep.

## What it does to a picture

Every design asks for its crop at the exact pixel size of the box it is drawing
into, and gets back grey - never black and white.

- **Cropped to the widget, not to the panel.** Sizes are free, so the same
  photograph is a different rectangle as a 12×12 wallpaper and as a 3×12 strip
  down the side of a screen. The crop is chosen around whatever is most
  detailed in the picture rather than through the middle, which is what makes a
  portrait pin work on a widescreen panel at all.
- **Never dithered here.** The render pipeline already ends in Floyd-Steinberg
  over the whole panel. An image dithered twice - once into a stipple, then
  again after the browser resampled that stipple - is moire. So this hands over
  continuous tone and lets the panel's own dither be the only one.
- **Enlarged by repeating pixels, never by interpolating them.** A 524-pixel
  pixel drawing on an 800-pixel panel grows with `nearest`, because Lanczos
  grows it into a blur and a blur dithers into mush.

Four tones are offered, and *Lift* is the one to reach for first: the panel's
paper is brighter and its ink weaker than any screen's, so a photograph that
looked right on a phone often comes out muddy.

## The designs

| | |
|---|---|
| **Wallpaper** | The picture, edge to edge, nothing else on it. 6–12 × 5–12 |
| **Print** | Matted, ruled and captioned, like something hung. 4–12 × 4–12 |
| **Strip** | A shallow full-width crop, for the head or foot of a screen. 6–12 × 2–4 |
| **Column** | A tall narrow crop down the side. 2–5 × 6–12 |
| **Contact sheet** | The whole collection at once, the current one ringed. 5–12 × 4–12 |

All five take notices, drawn on paper along the foot rather than over the
picture, because type on a photograph at one bit is either backed or gone.

## When it changes

Hourly by default; *Never* pins one picture and leaves it. Nothing faster than
a quarter of an hour is worth asking for - the panel is only redrawn that often,
and every change costs the device a redraw and a slice of battery.

Which picture is up is a **pure function of the clock**, and that is load-
bearing rather than tidy. A widget's data is refetched whenever it has aged out,
and the render fingerprint is taken over that data - so a pick that involved a
cursor or a random number would produce a different answer on every refetch, and
a gallery meant to change once an hour would hand the panel a new file every
five minutes for as long as it hung there. Derived from the clock, the answer is
byte-identical everywhere inside a hold. See `web/src/lib/gallery/pick.ts`.

Shuffling is per *cycle*, not per change: every picture appears exactly once
before any appears twice, in a different order each time round. Two collections
of the same size are seeded apart, so two gallery widgets on one screen do not
turn over together like a departure board.

*Daily* turns over at local midnight rather than every 86,400 seconds, because
the local day containing a clocks change is 23 or 25 hours long.

## When there is nothing there

The extension says so. It does not draw a sample - it has none, deliberately -
because the only sample a gallery could invent is a picture id naming a file
that is not there. A new installation with an empty folder gets the fault card
with the path to put things in, which is the honest first-run picture.

Branch on it if you like: the gallery reports `count`, so a tree can send a
device somewhere else when a folder has been emptied.
