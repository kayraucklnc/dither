# tools

Generators for the assets the app bundles: bitmap fonts and icon packs, in the
binary formats of `docs/format.md` §3. Their output is committed under
`app/src/assets/`; run these only to change it. Both are deterministic: an
unchanged tree rebuilds byte-for-byte identical files.

## Fonts

```bash
uvx --with freetype-py==2.5.1 python tools/fonts/build.py
```

Run from the repository root. Reads the vendored Inter 4.1 static TTFs in
`tools/fonts/src/` (SIL OFL, `LICENSE-Inter.txt` beside them; from the
`extras/ttf/` folder of the rsms/inter release zip), so it needs no network
beyond fetching freetype-py once. It rasterizes with FreeType in 1-bit mono
mode with the fonts' own TrueType hinting (`FT_LOAD_TARGET_MONO`,
`FT_RENDER_MODE_MONO`), for weights 400 and 700 at 12-128 px.

Writes `app/src/assets/fonts/inter-<weight>-<size>.dfnt`, `fonts.json` and
`LICENSE-Inter.txt`. Sizes up to 48 carry Latin-1, Latin Extended-A and some
punctuation, arrows and shapes; 64 and up carry ASCII, `°`, the Turkish letters
and a few symbols. A codepoint the font lacks is skipped, never drawn as a
box. The script prints which.

freetype-py bundles its own FreeType, and the version is pinned because a
different FreeType can hint differently.

## Icons

```bash
cd tools && npm install && npm run icons
```

Renders Lucide icons (`lucide-static`, ISC) with sharp at 16-128 px and
thresholds alpha at 50% into DBMP masks. Small sizes use a heavier pen than
Lucide's stock 2 so strokes stay whole on e-ink; the table is `STROKE` in
`icons/build.mjs`. Writes `app/src/assets/icons/icons-<size>.pack`,
`icons.json` and `LICENSE-Lucide.txt`. `ALIASES` maps a requested name to the
Lucide icon used for it; it is empty today, since every name exists in Lucide.

## Checking them

```bash
uvx --with pillow python tools/preview.py /tmp/assets-sheet.png
```

Decodes the generated files with an independent reader and checks their
structure (sorted glyph table, contiguous bitmaps, lengths, alignment). Then it
draws a contact sheet of sample text, with baselines marked in grey, and every
icon at 16, 24 and 64 px. Look at it after changing either generator.
