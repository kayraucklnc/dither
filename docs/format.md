# The panel format

This is the contract between the Dither app and the Dither firmware. The app
*compiles* a project into one binary blob; the firmware *interprets* it. Every
pixel the simulator shows comes from the same rules written here, implemented
twice — `app/src/runtime/` (TypeScript) and `firmware/src/runtime/` (C++) — and
held together by the golden fixtures in `spec/fixtures/`.

If the two implementations disagree, this document decides. If this document is
silent, that is a bug in this document.

Everything below is version **1**.

---

## 1. The blob

The blob is written to the board's `dither` data partition (see the board table
in §9). All integers are little-endian.

### Header (48 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | `char[4]` | magic `"DTHR"` |
| 4 | `u16` | format version, `1` |
| 6 | `u16` | header size, `48` |
| 8 | `u32` | total length in bytes, header included |
| 12 | `u32` | CRC-32 (IEEE 802.3, the zlib one) of bytes `[48, total)` |
| 16 | `u32` | runtime offset |
| 20 | `u32` | runtime length |
| 24 | `u32` | project offset |
| 28 | `u32` | project length (0 when absent) |
| 32 | `u32` | assets offset |
| 36 | `u32` | assets length |
| 40 | `u32` | build time, Unix seconds |
| 44 | `u32` | reserved, 0 |

Sections are laid out in this order, each starting on a 4-byte boundary:
**assets**, **runtime**, **project**. Offsets are from the start of the blob.

- **runtime** — UTF-8 JSON, §2. What the firmware runs.
- **project** — gzip of the editor's project JSON. The firmware never reads it;
  it is there so the app can read a panel back and carry on where it left off.
- **assets** — fonts and bitmaps, §3, concatenated, each 4-byte aligned.
  The runtime JSON's `assets` array gives each one's `[offset, length]`
  (offsets from the start of the blob).

A blob whose magic, version or CRC is wrong is treated as no blob at all.

---

## 2. Runtime JSON

```jsonc
{
  "v": 1,
  "board": "xiao-epaper-75",
  "width": 800, "height": 480,          // logical size, after rotation
  "rotation": 0,                        // 0 | 90 | 180 | 270, clockwise
  "wifi": [{ "ssid": "home", "pass": "…" }],
  "tz": "CET-1CEST,M3.5.0,M10.5.0/3",   // POSIX TZ string
  "ntp": "pool.ntp.org",
  "locale": {
    "days":   ["Sunday", …],  "daysShort":   ["Sun", …],
    "months": ["January", …], "monthsShort": ["Jan", …]
  },
  "refresh": 900,                       // seconds; default wake interval
  "quiet": { "from": 1380, "to": 420 }, // optional, minutes of the day
  "sources": [ Source… ],
  "screens": [ Screen… ],
  "rules":   [ Rule… ],
  "assets":  [[offset, length], …]
}
```

### Sources

```jsonc
{
  "id": "w1",
  "url": "https://api.open-meteo.com/v1/forecast?latitude=45.46&…",
  "headers": [["Accept", "application/json"]],
  "every": 1800,                         // seconds between fetches
  "values": [
    { "key": "temp", "path": "current.temperature_2m" },
    { "key": "code", "path": "current.weather_code" },
    { "key": "hourly", "path": "hourly.temperature_2m", "count": 24 }
  ]
}
```

A source is one HTTP GET returning JSON. Each value picks one thing out of the
response with a `path`: dot-separated keys, where a segment of only digits
indexes an array (`daily.time.0`). A path that ends on an object or an array
gives `null`.

With `agg`, the target must be an array and the value is worked out over its
elements: `"agg": "count"` is how many there are; `"agg": "sum"` adds up
each element's `field` (a path inside the element), skipping elements where it
is not a number — `{ "key": "gross", "path": "data", "agg": "sum", "field":
"amount" }`. An empty array sums to 0; a target that is not an array is `null`.

`"agg": "buckets"` adds each element's `field` into a series of `count`
totals (at most 64) by when the element happened — its `time` field, a time
value (§ times). With `"by": "day"` the last total is today and the one before
it yesterday, counted in local calendar days; with `"by": "hour"` total `h` is
local hour `h` of today. Elements outside the range, or without a numeric
`field` or a time, are skipped; a total with nothing in it is 0:
`{ "key": "daily", "path": "data", "agg": "buckets", "field": "amount",
"time": "created", "by": "day", "count": 30 }`.

With `count`, the target must be an array and its first `count`
(at most 64) elements are kept as a **series**; the series ends early at the
first element that is not a number.

Everything the browser already knows — settings, coordinates, API keys — is
baked into the URL and headers by the compiler. The one thing it cannot know is
*when* the panel asks, so `url` and header values may hold time placeholders:

| Placeholder | Becomes |
|---|---|
| `{{now}}` | Unix seconds |
| `{{now\|PATTERN}}` | local time in the time tokens below (plus `Z` → `+02:00`) |
| `{{now+N\|PATTERN}}`, `{{now-N\|PATTERN}}` | the same, `N` seconds later or earlier |
| `{{today}}`, `{{today+N}}`, `{{today-N}}` | Unix seconds of local midnight today, moved by `N` seconds |

In `url` the substituted text is percent-encoded (letters, digits and `-._~`
are kept); in headers it is inserted as is. Anything else in braces is left
alone. While the clock is unknown, a source whose URL or headers use a
placeholder is not fetched (and not counted as attempted).

`{{now+N}}` without a pattern is not a placeholder and stays as written.

A kept string is cut to at most 256 bytes, at a UTF-8 character boundary.

Two optional blocks cover APIs that are not a plain GET:

```jsonc
"auth": {                        // OAuth 2 refresh, e.g. Google
  "url": "https://oauth2.googleapis.com/token",
  "form": [["grant_type", "refresh_token"], ["refresh_token", "…"], ["client_id", "…"], ["client_secret", "…"]],
  "token": "access_token",       // path in the reply
  "expires": "expires_in"        // path, seconds; 3600 if absent
},
"decode": { "aes256ecb": "<64 hex digits>" }   // the reply is AES-256-ECB, PKCS#7 padded
```

With `auth`, the panel POSTs `form` as `application/x-www-form-urlencoded`
(every byte outside `A–Z a–z 0–9 - . _ ~` percent-encoded, space as `%20`),
keeps the token until a minute before it expires (across sleeps), and sends
`Authorization: Bearer <token>` with the GET. A failed token request fails the
source. With `decode`, the body is decrypted before it is read as JSON.

### Merges

Some lists come from several sources — one calendar per account — and read
best as one. A merge builds that list on the panel, after fetching, from values
the sources already keep:

```jsonc
"merges": [{
  "id": "m0",
  "from": ["s0", "s1"],             // source ids, in priority order
  "fields": ["t", "s", "a", "e", "w"],
  "count": 6,                       // records read per source, and records kept
  "skip": ["s"],                    // a record with any of these null is left out
  "sort": ["s", "a"],               // by the first of these that is a time
  "unique": ["t", "s", "a"]         // equal on all of these to an earlier record: dropped
}]
```

Record `n` of a source is its values `<field><n>` (`t0`, `s0`, … for `n = 0`);
a record whose fields are all `null` does not exist (a short list, a source
never fetched). `count` is clamped to 0–64.
Records with any `skip` field `null` are left out. The rest are ordered by the
instant of their first `sort` field that is a time (§ times); records with
none go last; ties keep source order, then record order. A record whose
`unique` fields all equal an earlier kept record's (same type and value,
`null` equal to `null`) is dropped — "earlier" in the sorted order, so on a tie the earlier source
wins; an empty `unique` drops nothing. The first `count` become the merge's own
values: `m0.t0`, `m0.s0`, … and `m0.from0` — the position in `from` (0, 1, …)
of the source each came from. Positions past the end are `null`.

Merges run in order, after every source has been read on a wake, and in the
simulator likewise. A merge's id is a reference prefix like a source's.

### Values and references

A **reference** is a string `"<source>.<key>"`. Each value is one of:
`null`, number (double), string, boolean, series (array of numbers).

Built-in sources, always present:

| Reference | Type | Meaning |
|---|---|---|
| `clock.epoch` | number | Unix seconds now |
| `clock.hour` | number | 0–23, local |
| `clock.minute` | number | 0–59 |
| `clock.minutes` | number | minutes since local midnight, 0–1439 |
| `clock.weekday` | number | 0 = Sunday … 6 |
| `clock.day` | number | 1–31 |
| `clock.month` | number | 1–12 |
| `clock.year` | number | e.g. 2026 |
| `device.battery` | number \| null | percent, null when unknown |
| `device.usb` | boolean | powered over USB |
| `device.online` | boolean | Wi-Fi joined on this wake |
| `device.rssi` | number \| null | dBm |

Every fetched source also has two derived values:

| Reference | Type | Meaning |
|---|---|---|
| `<id>._ok` | boolean | the most recent fetch succeeded |
| `<id>._age` | number \| null | whole minutes since the last success, null if never |

A source that fails keeps the values of its last success.

### Conditions

```jsonc
{ "all": [Condition…] }
{ "any": [Condition…] }
{ "not": Condition }
{ "v": "w1.temp", "op": "gt", "x": 25 }
{ "v": "c1.start", "f": { "until": true }, "op": "lt", "x": 15 }
```

A leaf may compare against another value instead of a constant: `"vs": ref`
in place of `x` (with `lt`, `le`, `gt`, `ge`, `eq`, `ne`); the other value goes
through the leaf's `f` as well. `{ "v": "s1.today", "op": "gt", "vs":
"s2.yesterday" }`.

A leaf may carry a format `f`: the value goes through its `shift`, `days`, `until`,
`scale`, `add`, `steps` and `map` steps (the rest are ignored) before it is compared,
and a step that gives `null` makes the value `null`.

| `op` | true when |
|---|---|
| `eq`, `ne` | equal / not equal. Number vs number, string vs string, bool vs bool. Mismatched types: `eq` false, `ne` true |
| `lt`, `le`, `gt`, `ge` | both numbers and the comparison holds; otherwise false |
| `between` | `x` is `[a, b]`; number with `a <= v < b`. If `a > b` it wraps: `v >= a || v < b` (for `clock.minutes` across midnight) |
| `in` | `x` is an array; `v` equals any element (as `eq`) |
| `contains` | both strings and `x` is a substring of `v` |
| `present`, `absent` | value is / is not `null` |
| `true`, `false` | value is the boolean `true` / `false` |

An empty `all` is true, an empty `any` is false.

### Rules

```jsonc
{ "screen": 1, "when": Condition }   // or "when": null for "always"
```

Evaluated in order; the first whose `when` is true chooses its screen. If none
matches, screen `0` is shown.

### Screens

```jsonc
{ "name": "Home", "refresh": 300, "elements": [Element…] }
```

`refresh` (optional) overrides the top-level wake interval while this screen is
showing.

### Formats

A **format** turns a value into text. All fields optional; applied in this order:

0. `shift: { "v": ref, "scale": n }` — value is a time; it becomes the instant
   (Unix seconds) moved by the referenced value × `scale` seconds (`scale`
   defaults to 1). A reference that is not a number moves it by 0. A
   timetable's "08:15" plus its delay in minutes (`scale: 60`) is when the
   train actually leaves.
1. `days: true` — value is a time; becomes the number of local calendar days
   from today to its local date: 0 today, 1 tomorrow, −1 yesterday. (A date
   alone, `2026-10-05`, is that date.) When a format sets both `days` and
   `until`, `days` is used and `until` ignored.
2. `until: true` — value is a time (§ times below); becomes whole minutes from
   now to it, `floor((t - now) / 60)`. A time in the past becomes `null`.
3. `scale: n` — multiply. `add: n` — add (after `scale`).
4. `steps: { "t": [t0, t1, …], "o": [o0, o1, …, oN] }` — numeric value becomes
   `o[k]` where `k` is how many thresholds are `<= value`. `o` has one more
   entry than `t`.
5. `map: { "k": [k0, …], "o": [o0, …], "d": default }` — exact match (number to
   number, string to string); unmatched becomes `d` (or `null` if no `d`).
6. `num: { "d": decimals, "sep": ",", "compact": true }` — fixed decimals
   (§ numbers); `sep` inserts a thousands separator into the integer part.
   With `compact`, a value whose magnitude is at least 1,000 is divided by the
   largest of 10⁹, 10⁶, 10³ not above it, printed with 1 decimal (a trailing
   `.0` dropped) and suffixed `B`, `M` or `k`: 74,120 → `74.1k`, 2,000,000 →
   `2M`; smaller values print as without `compact`.
7. `time: "HH:mm"` — value is a time; rendered with the tokens below.
8. `upper: true` — the value becomes text, then: `a–z` → `A–Z`; U+00E0–U+00FE
   except U+00F7 → minus 0x20; `ğ→Ğ`, `ş→Ş`, `ı→I`. With `"tr": true` also set,
   `i→İ` instead of `i→I`. Nothing else changes.

If the value is `null` at any step, the result is `fallback` (default `"–"`,
U+2013).

A value with no format becomes text like this: `null` as `–`; string as is; boolean `"true"` /
`"false"`; series `""`; number per § numbers with `d` = automatic.

#### Numbers

With fixed decimals `d`: round half away from zero to `d` places, print with
exactly `d` decimals, `.` as the decimal point. `-0` prints as `0`.

Automatic: round half away from zero to 2 decimals, then strip trailing zeros
and a trailing point. `20.50 → "20.5"`, `3.0 → "3"`.

Implementations must not use the platform's float printing for the rounding
step: compute `r = round_half_away(v * 10^d)` as a 64-bit integer, then format
the integer and insert the point.

#### Times

A time value is either a number (Unix seconds) or an ISO-8601 string
`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`, `YYYY-MM-DDTHH:MM:SS`, the last optionally
with fractional seconds (ignored); a form with a time may end in `Z` or
`±HH:MM`. A bare wall-clock time, `HH:MM` or `HH:MM:SS` (timetables send
these), is local time on yesterday, today or tomorrow — whichever puts it
nearest to now, the earlier on a tie. (On ordinary days that is the window from
12 hours before now to 12 hours after; on the days the clocks change it still
gives exactly one answer.) While the clock is unknown it is `null`, and so is
anything `until` would count against. Without a zone it is **local time** (Open-Meteo with `timezone=auto`
sends these); a date alone is local midnight. Anything else is `null`.

Formatting a local time uses its fields as written. Where a local time has to
become an instant (`until`), it is taken with the standard offset if the zone
is on standard time at that instant, otherwise with the daylight offset.

`tz` is a POSIX TZ string; only the `Mm.w.d[/time]` rule form is used, e.g.
`STD-1DST,M3.5.0,M10.5.0/3`, or a bare `STD-3` with no daylight time.

Tokens: `YYYY` `MMMM` (month name) `MMM` (short) `MM` `M` `DD` `D` `dddd` (day
name) `ddd` (short) `HH` `H` `hh` `h` (12-hour) `mm` `ss` `A` (`AM`/`PM`), `Z`
(the UTC offset in effect, `+02:00`).
Longest token first; anything else is literal. Text in `[brackets]` is literal
with the brackets removed.

### Elements

Every element has a type `t`, optionally `"c": 0` to draw in white (default `1`,
black), and optionally `"when": Condition` — it is drawn only if that holds.
Elements are drawn in order onto a white screen. All coordinates are integers in
logical pixels.

| `t` | Fields |
|---|---|
| `rect` | `x y w h`, `fill` (default true), `stroke` (width, used when `fill` is false, default 1), `r` (corner radius, default 0) |
| `circle` | `x y` (centre) `r`, `fill` (default true), `stroke` |
| `line` | `x1 y1 x2 y2`, `w` (thickness, default 1) |
| `hand` | `x y` (centre) `len w`, `v` (reference), `max` — a clock hand at angle `v / max` of a turn, clockwise from 12 o'clock |
| `text` | `x y w h`, `font` (asset index), `a` (`l`/`c`/`r`, default `l`), `va` (`t`/`m`/`b`, default `t`), `parts`, `wrap` (default false), `lines` (max lines when wrapping) |
| `bitmap` | `x y`, `a` (asset index) |
| `icon` | `x y w h`, `v` (reference), `f` (format, optional), `set` (`{ "name": assetIndex }`) — the value, formatted, picks a bitmap drawn centred in the box |
| `bar` | `x y w h`, `v`, `min max`, `dir` (`r` grows rightwards, `u` upwards; default `r`) |
| `group` | `els` — elements drawn in order, and only when the group's `when` holds. Groups nest up to 8 deep; a group's `c` is ignored |
| `chart` | `x y w h`, `v` (a series), `kind` (`bars`/`line`/`steps`/`area`), `min max` (optional, else from the data), `gap` (bars, default 1), `lw` (line thickness, default 2) |

`parts` is an array; each part is a literal string, `{ "v": ref, "f": format }`,
or `{ "k": constant, "f": format }` — a fixed value (number, string, boolean or
null) put through a format, for things like "days until a date the user typed".

### Edge cases

Both implementations agree on these; tests hold them to it.

- **Numbers.** `round_half_away` is exact (C `llround`; JS `sign(x)·round(|x|)`),
  never `floor(x + 0.5)`, and `v · 10^d` is one double multiplication. `d` is
  clamped to 0–15; `num` without `d` means automatic; a non-finite value, or
  one whose scaled form reaches 2^63, is `null`. JSON numbers must be parsed
  correctly rounded (`strtod`, `JSON.parse`).
- **Times.** Out-of-range fields (month 13, 30 February, hour 24, minute 60)
  are `null`. Local to instant: try `local − standard offset`; if the zone is
  on daylight time at that instant, use `local − daylight offset` instead. A TZ
  string that cannot be parsed is UTC.
- **Conditions.** `eq` holds only for number/number, string/string and
  bool/bool — `null` never equals `null`. An unknown `op` or a malformed node
  is false; a missing or `null` `when` is true.
- **Formats.** `scale`, `add`, `steps` and `num` on a non-number give `null`;
  `map` never matches booleans; the fallback is used as is (no `upper`).
- **Rules.** A rule naming a screen that does not exist shows screen 0.
- **Elements.** `bar` without `min` or `max` draws nothing. `chart` `kind`
  defaults to `bars`, and a line of one point draws nothing. `hand` with
  `max <= 0` draws nothing; its angle is `((2π) · v) / max`. A `circle` with
  `r < 0` draws nothing. A DBMP kind other than 1 is a mask. Coordinates are
  integers within ±32767.
- **Text.** Spaces and `\n` are decided before glyph substitution; only U+0020
  separates words; a trailing `\n` makes an empty last line when wrapping.
- **Paths.** A digits-only segment on an object is a key. With duplicate JSON
  keys, the last wins.
- **Rotation** turns the image clockwise: logical `(x, y)` at 90° lands on
  panel `(H − 1 − y, x)`. Golden images are in logical orientation.

---

## 3. Assets

### Font — magic `"DFNT"`

| Offset | Type | Field |
|---|---|---|
| 0 | `char[4]` | `"DFNT"` |
| 4 | `u8` | version, 1 |
| 5 | `u8` | reserved |
| 6 | `u16` | line height |
| 8 | `i16` | ascent (pixels above the baseline, positive) |
| 10 | `i16` | descent (pixels below, positive) |
| 12 | `u16` | glyph count |
| 14 | `u16` | reserved |
| 16 | glyph table | `count` × 20 bytes, sorted by codepoint |
| … | bitmaps | |

Glyph record (20 bytes): `u32 codepoint`, `u32 bitmap offset` (from the start of
the font asset), `u16 width`, `u16 height`, `i16 xOffset`, `i16 yOffset`,
`u16 advance`, `u16 reserved`.

A glyph's bitmap is `height` rows of `ceil(width / 8)` bytes, most significant
bit first; a set bit is ink. Its top-left pixel lands at
`(penX + xOffset, baseline + yOffset)` — `yOffset` is negative for anything
above the baseline.

### Bitmap — magic `"DBMP"`

| Offset | Type | Field |
|---|---|---|
| 0 | `char[4]` | `"DBMP"` |
| 4 | `u16` | width |
| 6 | `u16` | height |
| 8 | `u8` | kind: `0` mask, `1` opaque |
| 9 | `u8[3]` | reserved |
| 12 | rows | `ceil(width / 8)` bytes per row, MSB first |

A **mask** draws its set bits in the element's colour and leaves the rest
untouched (icons). An **opaque** bitmap writes every pixel: set is black, clear
is white (pictures).

---

## 4. Drawing

The framebuffer is `width × height`, one bit per pixel, `1` = black. A pixel
outside the screen — or outside the element's clip box, where there is one — is
never written.

- **rect, filled.** Pixel `(px, py)` with `x <= px < x+w`, `y <= py < y+h`;
  nothing when `w <= 0` or `h <= 0`. With radius `r` (clamped to
  `min(w, h) / 2`, integer division), let `u = min(px - x, x + w - 1 - px)` and
  `v = min(py - y, y + h - 1 - py)`. If `u < r` and `v < r`, the pixel is kept
  only when `(2(r - u) - 1)² + (2(r - v) - 1)² <= (2r)²`.
- **rect, outline** of width `s`: the filled rect, minus the filled rect inset
  by `s` on every side, whose radius is `max(0, r' - s)` with `r'` the outer
  radius after clamping (then clamped again to the inner rect). If the inner
  rect has no area, nothing is removed.
- **circle, filled.** Pixel with `(px - x)² + (py - y)² <= r² + r`.
  **Outline** of width `s`: the filled circle minus the filled circle of radius
  `r - s` (nothing removed if `r - s < 0`).
- **line.** Bresenham from `(x1, y1)` to `(x2, y2)`, inclusive, exactly this
  variant: `dx = |x2 - x1|`, `sx = x1 < x2 ? 1 : -1`, `dy = -|y2 - y1|`,
  `sy = y1 < y2 ? 1 : -1`, `err = dx + dy`; loop: plot; stop if at the end;
  `e2 = 2·err`; if `e2 >= dy` then `err += dy, x += sx`; if `e2 <= dx` then
  `err += dx, y += sy`. At each point
  `(px, py)` fill the square `x ∈ [px - k, px - k + w)`, `y ∈ [py - k, py - k + w)`
  with `k = floor((w - 1) / 2)`.
- **hand.** `a = 2π · v / max`; end point `(x + round(sin(a) · len),
  y - round(cos(a) · len))`, `round` being half away from zero; drawn as a
  `line` of thickness `w`. A non-number `v` draws nothing.
- **bar.** `f = clamp((v - min) / (max - min), 0, 1)`. `dir: r` fills
  `(x, y, floor(f · w), h)`; `dir: u` fills `(x, y + h - floor(f · h), w,
  floor(f · h))`. Non-number `v`, or `max <= min`, draws nothing.
- **chart.** `n` = series length; nothing if `n = 0`. `lo/hi` = `min/max` if
  given, else the series' own minimum and maximum; if `hi <= lo`, `hi = lo + 1`.
  For value `s`: `f = clamp((s - lo) / (hi - lo), 0, 1)`.
  - `bars`: bar `i` spans `x + floor(i · w / n)` to `x + floor((i + 1) · w / n)
    - gap` (exclusive), height `max(1, floor(f · h))`, bottom-aligned at `y + h`.
  - `line`: point `i` is `(x + floor(i · (w - 1) / max(1, n - 1)),
    y + (h - 1) - floor(f · (h - 1)))`; consecutive points joined by `line` of
    thickness `lw` (default 2).
  - `steps`: the same points, joined by a horizontal `line` from point `i` to
    `(x of point i+1, y of point i)` and a vertical one from there to point
    `i+1`; the last point is extended horizontally to `x + w - 1`.
  - `area`: the `line`, with the region beneath it shaded. For each column
    `px` from `x` to `x + w - 1`, the line's height there is linear between
    the two points around it: `ly = y0 + floor((y1 - y0) · (px - x0) / (x1 -
    x0))` (the point's own y where `x1 = x0`). Every pixel `(px, py)` with
    `ly < py < y + h` is inked when `B[py mod 4][px mod 4] < L`, where `B` is
    the 4×4 Bayer matrix `[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]`
    and `L = 2 + floor(8 · (y + h - py) / max(1, y + h - ly))` — denser near
    the line, fading towards the bottom. The line is drawn after the shading.
- **bitmap.** Top-left at `(x, y)`.
- **icon.** Value through `f`, then to text (§ formats); if `set` has that
  name, the bitmap is drawn at `(x + floor((w - bw) / 2), y + floor((h - bh) / 2))`
  and clipped to the box.

### Text

1. Build the string: each part rendered (§ formats), concatenated.
2. Decode UTF-8 to codepoints. A codepoint the font lacks is replaced by `?`;
   if the font lacks `?` too, it is skipped.
3. Width of a run = sum of `advance`. No kerning.
4. **Lines.**
   **Ellipsize** a run: drop codepoints from its end until its width plus the
   ellipsis' fits in `w` (possibly dropping none, possibly all), then append the
   ellipsis — `…` (U+2026), or `...` if the font lacks it.
   - Not wrapping: one line, with every `\n` read as a space. If wider than `w`,
     it is ellipsized.
   - Wrapping: max lines `L = min(lines or ∞, floor(h / lineHeight))`, at least
     1. Split on `\n` into paragraphs (an empty paragraph is an empty line).
     Within one, words are separated by spaces (runs of spaces are one break,
     leading and trailing spaces dropped); a line takes words while
     `width(line + " " + word) <= w`. A word wider than `w` starts its own line
     and is broken after the most codepoints that fit (at least one); that piece
     is a line of its own and the rest carries on as a word. If more than `L` lines result, only the first `L`
     are kept and the last of them is ellipsized.
5. Block height `bh = lines · lineHeight`. Top: `va: t` → `y`; `m` → `y +
   floor((h - bh) / 2)`; `b` → `y + h - bh`.
6. Line `i` baseline = `top + i · lineHeight + ascent`. Its start x: `a: l` →
   `x`; `c` → `x + floor((w - lw) / 2)`; `r` → `x + w - lw`.
7. Glyphs are drawn as masks in the element's colour, clipped to the box
   `[x, x + w) × [y, y + h)`.

`floor` of a negative number rounds towards −∞ throughout.

---

## 5. A wake

1. Read and verify the blob. If there is none, draw the built-in "Not set up"
   screen and sleep for a day.
2. If inside `quiet` hours (and the clock is known), sleep until `quiet.to`.
3. If any source is due, or the clock has never been set, join Wi-Fi (each
   network in order, 15 s each) and sync time over NTP. `device.online` records
   the outcome; on a wake that needed no network it keeps the last outcome.
   A due source on a wake that could not get online counts as attempted, with
   `_ok` false. With the clock unknown, `clock.*` is `null` and every source is
   due. A blob with a new CRC starts with an empty value cache.
4. Fetch every source whose `every` has elapsed since its last attempt (or that
   has never been fetched). Values are cached across sleeps.
5. Evaluate the rules, draw the chosen screen.
6. If the framebuffer is identical to what the panel already shows, leave the
   panel alone.
7. Sleep for the screen's `refresh` (or the default), shortened so the next
   source due is fetched on time, but never below 60 s.

While a computer is connected over USB the firmware does not deep-sleep — it
waits the same interval awake, so the port stays open for flashing.

---

## 6. Simulator

The app renders with `app/src/runtime/`, the same rules, on the same blob. Its
values come from fetching the source URLs in the browser (where CORS allows),
else from the extension's sample data, and can be overridden by hand.

---

## 7. Golden fixtures

`spec/fixtures/<name>/` holds `blob.bin`, `values.json` (`{ "now": epoch,
"values": { ref: value } }`) and `expected.pbm` (P4). `clock.*` is derived from
`now` in the blob's `tz`; `values` override anything, and a `device.*` value not
given is `null`. The TypeScript runtime
writes them (`npm run goldens` in `app/`); both test suites read them, and the
C++ host test fails on any pixel that differs.

---

## 8. Firmware identity

The firmware's app descriptor (`esp_app_desc_t`) has project name `dither` and
the version string of the release. The app reads it at flash offset
`0x10000 + 0x20` to tell whether Dither is installed, and which version.

---

## 9. Boards

| Board id | Panel | Chip | `dither` partition |
|---|---|---|---|
| `xiao-epaper-75` | Seeed XIAO 7.5" ePaper Panel, 800 × 480, UC8179 | ESP32-C3, 4 MB | `0x300000`, 1 MB |
