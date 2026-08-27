# Firmware images

What the flasher on `/devices/new` offers. Anything here is written to a board
at offset `0x0`, so every file must be a **merged** image — bootloader,
partition table and application in one file, each already at the offset the
chip expects inside it. A bare `firmware.bin` written at `0x0` produces a board
that does not boot, and it looks exactly as plausible in a file listing.

Do not copy them in by hand. `scripts/firmware.mts` opens each candidate and
checks it before copying, which is the whole reason it exists:

```bash
cd web
npx tsx scripts/firmware.mts                     # ~/Projects/trmnl-firmware
npx tsx scripts/firmware.mts ../../trmnl-firmware
```

It reads whatever a build already left in that checkout's `.pio/build/<env>/`
or `.pio/release/<env>/flash/`. To get something there in the first place,
build it in the firmware repo:

```bash
.venv/bin/pio run -e waveshare-esp32-driver
```

The `.bin` files are gitignored; this file is not.

## You do not need to rebuild to point a board at Dither

The server address is a runtime preference (`api_url` in NVS), not a compile-time
constant — `API_BASE_URL` in `include/config.h` is only the fallback. The
firmware's own Wi-Fi setup portal has a field for it. So one generic image per
board is enough: flash it, join the board's network, and give it the address
`/devices/new` shows.
