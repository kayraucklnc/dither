# Dither

Design an e-ink panel in the browser, simulate it exactly, flash it over USB.
The panel does everything else itself. Repo: github.com/kayraucklnc/dither.
Read `README.md` for the shape of it and `docs/format.md` before touching
either renderer.

## The one rule

**`docs/format.md` is the contract, and it is implemented twice** — the
simulator in `app/src/runtime/` (TypeScript) and the panel in
`firmware/src/runtime/` (C++). A change to how anything is drawn, formatted or
decided changes the spec, both implementations and the golden images, in the
same commit. `make test` fails if the two disagree on a single pixel.

After an intended visual change: `make goldens`, look at what changed, then
`make test`.

## Layout

- `app/src/runtime/` — the format: blob, values, conditions, formats, text, drawing.
- `app/src/compiler/` — project → blob. Grid, facts (what rules can test), the
  `Draw` that extensions use, timezone (IANA → POSIX), locale, pictures.
- `app/src/extensions/` — widgets; `api.ts` is the whole extension API.
- `app/src/project/` — the project schema (zod) and starters.
- `app/src/state/` — undo store, browser/file storage, compile and simulation hooks.
- `app/src/device/` — Web Serial: boards, firmware manifest, connect/info/flash/read-back.
- `app/src/ui/` — React. `kit.tsx` holds every primitive control.
- `firmware/src/runtime/` portable C++17; `firmware/src/platform/` Arduino side.
- `tools/` — font (FreeType mono) and icon (Lucide via sharp) generators.

## Commands

```bash
make dev        # app on :5173
make test       # app tests + types + firmware host tests + goldens
make firmware   # build, package, copy to app/public/firmware (needs uv)
make goldens    # redraw spec/fixtures from the TS runtime
make -C firmware flash PORT=/dev/cu.usbmodem101   # by hand, without the app
```

## Traps already paid for

- **ArduinoJson is not correctly rounded** (it stores short mantissas as
  float). The firmware has its own streaming JSON reader on `strtod`; keep it.
- **Never use `localtime_r` or `Intl` to render.** Both sides run their own
  POSIX-TZ engine so they agree by construction; `Intl` is only used to
  *derive* the POSIX string (`compiler/timezone.ts`).
- **Opening the serial port with DTR and RTS both false resets the C3** on
  USB-Serial/JTAG. DTR high, RTS low does not.
- **A deep-sleeping C3 has no USB port.** The firmware stays awake while a USB
  host is attached so the browser can always reach it; if it is asleep, hold
  BOOT while plugging in.
- **esptool-js `after("hard_reset")` does not reset this board.** The device
  module uses a custom `D0|R1|W100|R0` sequence.
- **Reading flash over this USB is ~10 KB/s.** Read the header first and then
  only the project section; never read the partition.
- **Some glyphs reach above the font's ascent** (Å, `|`). A text box exactly
  one line tall clips them; give headline boxes a few pixels of air.
- **Lay out for the worst case, not the sample.** Values arrive after drawing.
- **Units come from the time zone, not the language.** `en-US` in Istanbul is
  still Celsius.
- **The XIAO panel cannot measure its battery.** `device.battery` is null on
  it; widgets must look right with it absent.
- **Fonts dominate the blob**, so they are trimmed to the characters a screen can
  show (`compiler/subset.ts`; ~95 KB for a starter). A raw string value keeps
  its font whole. The partition is 1 MB.
- **A glyph the font lacks draws as `?`.** Currency signs (₺ ₹ ₿ …) are in the
  generator's `CURRENCY` list; anything new a widget prints goes there too, then
  `uvx --with freetype-py==2.5.1 python tools/fonts/build.py` and `make goldens`.
- **Widget conditions use bare keys for the widget's own values.** `d.when`,
  flag facts and `shift` references are scoped to the widget's source by the
  compiler; anything with a dot (`clock.minutes`, `device.online`) is global.
- **A widget's layout is fixed at compile time; only bindings move.** Anything
  that depends on a value (which train is next, how many digits a countdown
  has) is drawn once per case and chosen with `d.when` — see `arrangements()`
  in the Trenord widget.
