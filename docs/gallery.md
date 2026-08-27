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
into. Two things always happen to it, and everything after that is a choice.

- **Cropped to the widget, not to the panel.** Sizes are free, so the same
  photograph is a different rectangle as a 12×12 wallpaper and as a 3×12 strip
  down the side of a screen.
- **Enlarged by repeating pixels, never by interpolating them.** A 524-pixel
  pixel drawing on an 800-pixel panel grows with `nearest`, because Lanczos
  grows it into a blur and a blur dithers into mush.

### Turning it, and keeping all of it

A tall picture on a wide panel has two answers before it has a crop.

**Turn it** a quarter, and a 1182×1674 poster becomes 1674×1182 — within a
whisker of the panel's own shape, so almost nothing is lost. You read it
sideways, which is why the four fixed turns are still there to overrule with.
It happens before the crop, so everything below still applies.

**When it fits better** makes that trade for you. It asks the only question a
server can answer from the pixels — is this picture long the other way from the
box it is going into? — and turns a quarter clockwise when the answer is yes by
a clear margin: a fifth or more off square, lying against its box. Anything
nearer square is left where it is, because spinning a photograph that was
nearly the right shape anyway buys a few percent and costs you the ability to
read it. The question is asked against the *widget's* box rather than the
panel's, so one photograph turns as a 12×2 strip and stays upright as a 12×12
wallpaper — the same reason the crop happens at render time. Always clockwise:
which way up the subject is, is not in the file, so the answer is predictably
one way rather than inconsistently either.

It is **not** the default, and the reason is worth seeing rather than
believing. A 736×1308 pin of a figure on a rooftop turned sideways on a wide
panel keeps nearly every pixel and is a picture you have to tilt your head at;
cropped, it loses two-thirds of its height and *finds the figure*, because
that is what the attention crop is for. Turning is the right answer for a
poster, a texture or a diagram — anything without a strong up — and the wrong
one for a photograph, and only you know which you hung.

**How it fills the box → whole picture** stops cropping altogether and
letterboxes instead. The bars take their tone from the picture: paper for a
light one, ink for a dark one, decided by reading the source down to a single
pixel. Almost everything in this idiom is white marks on black, and a black
poster in a white surround reads as a mistake on a panel whose bezel is already
white.

### What to keep

A portrait picture on a landscape panel that is being cropped has to lose
something. *Whatever is
busiest* finds the most detailed region, which is right most of the time —
it is what turns a portrait photograph into a widescreen portrait rather than a
widescreen waistcoat. It is also the setting that surprises people, because
"busiest" is not "the subject": on a poster it finds the lettering, so a comic
cover crops to its own title. The compass points are there to overrule it with,
and on a poster *the middle* is usually what you wanted.

### Contrast and brightness

The most useful controls here, by a distance. A one-bit panel has no tints, so
contrast is not a finishing touch — it decides how much of the picture survives
at all, and the top of the range is where a photograph stops being a photograph
and becomes a graphic. Both run −100 to 100 and both pivot on mid grey, so
raising contrast does not also darken the picture.

Reach for brightness when something comes out muddy: the panel's paper is
brighter and its ink weaker than any screen's, so a photograph that looked
right on a phone is usually sitting too low for it.

### How it is reduced to ink

The panel turns grey into black and white on its own. This decides whether it
gets to — and since there is no colour and no motion here, *how* a picture is
reduced is very nearly the whole of how it feels.

| | |
|---|---|
| **Leave it to the panel** | Floyd-Steinberg over the finished page. The default |
| **Diffusion** | The same kernel, but on the picture's own pixels. Fine, even, photographic |
| **Atkinson** | Throws away a quarter of the error. Crisp, contrasty, blown highlights — everything scanned on a Mac in 1987 |
| **Ordered** | An 8×8 Bayer threshold. A crosshatch laid *over* the picture rather than following it |
| **Halftone** | A dot screen turned to 45°, the way ink on paper works |
| **Noise** | A random threshold. Grainy, like a photocopy of a photocopy |

The last three have a **mark size** in panel pixels: small enough and the screen
is a texture you have to look for, large enough and it is the first thing you
see, which on a picture hung on a wall is usually the point.

Choosing anything but *Leave it to the panel* means the picture comes back
already black and white, which is only safe because every design asks for its
crop at the exact pixel size of the box and places it one for one. Ask for any
other size and the browser resamples the marks back into greys for the page
dither to find — which is the moiré this otherwise avoids.

Two details worth knowing, because both were bugs first. The halftone reads the
*average* of a cell rather than the pixel in the middle of it: a poster that is
already a printed halftone has a middle pixel that is black or white more or
less at random, and sampling it turns the picture to confetti. And the
relationship between tone and dot size is counted rather than derived — area of
a circle is wrong at both ends, so a solid black band printed 92% black with a
sparkle of paper in the corners.

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

## Which picture

**Show** is the first thing to answer, and there are only two answers: a
rotation through the collection, or *just one picture, that I choose*. The
second is half of what a gallery is for — one print on one wall — and it names
the picture, so a picture that has been deleted is refused rather than quietly
replaced by whatever sorts first.

**Only pictures that are** narrows a rotation by shape: landscape, portrait or
square. It is the most useful filter here, because nearly everything in this
idiom was made portrait for a phone and a panel is widescreen — a rotation of
portrait pictures on a landscape wallpaper is a rotation of crops, and the
honest fix is not a cleverer crop. A filter that leaves nothing eligible says
so; it does not fall back to the whole collection.

Shape is read from the file rather than guessed from the name, and a phone
photograph taken sideways is measured the way it will be *shown* — EXIF quarter
turns are undone first, or a portrait would be filed as a landscape and cropped
as one. The picture picker shows the pixels and the shape beside each name, and
narrows itself the same way the widget will.

Naming one picture beats naming a shape, so the shape filter only applies to a
rotation. A pinned portrait is shown; the alternative was a widget reporting one
eligible picture and drawing a different one.

## When it changes

Hourly by default. Nothing faster than a quarter of an hour is worth asking for
- the panel is only redrawn that often, and every change costs the device a
redraw and a slice of battery.

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
