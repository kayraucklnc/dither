# Dither

Design an e-ink display in your browser, see exactly what it will show, and
flash it over USB. No server, no account, no app on your phone: the panel
fetches its own data, follows your rules, and draws its own screens.

```
┌──────────── your browser ────────────┐          ┌──── the panel ────┐
│ screens · widgets · rules · Wi-Fi    │  USB-C   │ wakes, joins Wi-Fi │
│ simulator (same renderer as panel) ──┼─────────▶│ fetches, decides,  │
│ compile → one binary blob            │  flash   │ draws, sleeps      │
└──────────────────────────────────────┘          └────────────────────┘
```

Supported today: the **Seeed XIAO 7.5" ePaper Panel** (ESP32-C3, 800 × 480).

Widgets: clock, date, weather (Open-Meteo), Google Calendar, trains (Trenord),
revenue (Stripe), text, messages, countdown, picture, crypto prices, any number
from a JSON address, and panel status. Rules switch screens ("show Night
between 23:00 and 07:00", "show Commute when my next train leaves in under 20
minutes"); alerts interrupt whatever is showing ("Trouble on your line",
"Take an umbrella").

## Use it

```bash
make setup      # once
make firmware   # once, and after firmware changes (needs uv: https://docs.astral.sh/uv/)
make dev        # http://localhost:5173 — open it in Chrome or Edge
```

1. Pick your display, a starting layout, your city and your Wi-Fi.
2. Arrange widgets on the panel, add screens, write rules like *"show Night
   between 23:00 and 07:00"* or *"show Rainy when it rains"*. The preview is the
   panel's own renderer, fed live data where your browser can fetch it.
3. Plug the panel in with USB-C and press **Flash to panel**.

Your project is saved in the browser as you go, can be saved to a
`.dither.json` file, and travels onto the panel with every flash — plug the
panel into another computer and **Load the panel's project** to carry on.

## How it works

- **The app compiles, the panel interprets.** Everything that can be decided
  in advance — layout, fonts, icons, pictures, settings, URLs — is decided in
  the browser and packed into one blob in the panel's `dither` flash
  partition. The firmware is a small interpreter: it never needs updating to
  get a new widget.
- **One renderer, written twice, held together by tests.** The format is
  specified in [`docs/format.md`](docs/format.md). The simulator
  (`app/src/runtime/`, TypeScript) and the firmware (`firmware/src/runtime/`,
  C++) both implement it, and both must draw the images in
  [`spec/fixtures/`](spec/fixtures) bit for bit.
- **Values are bound, not baked.** A widget draws "the temperature" as a
  reference to a value the panel fetches when it wakes, so the screen stays
  current between flashes.

## Repository

| Path | What |
|---|---|
| `app/` | The web app: editor, simulator, compiler, USB flasher (Vite, React, TypeScript) |
| `app/src/extensions/` | Widgets. One folder each — see [docs/extensions.md](docs/extensions.md) |
| `firmware/` | The panel's firmware (PlatformIO, Arduino-ESP32 core 3) |
| `docs/format.md` | The contract between the two |
| `spec/fixtures/` | Shared golden images |
| `tools/` | Font and icon generators (Inter, Lucide → 1-bit) |

## Checks

```bash
make test       # app unit tests, types, firmware host tests, golden images
make goldens    # redraw the golden images after an intended change
```

## Licence

MIT — see [LICENSE.adoc](LICENSE.adoc). Inter is under the SIL Open Font
Licence and Lucide under ISC; their licences ship next to the generated assets.
