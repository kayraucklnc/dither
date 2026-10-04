# Dither firmware

Interprets the blob the Dither app writes to the board's `dither` partition and
draws it on the panel. The contract is [`docs/format.md`](../docs/format.md);
the browser simulator and this firmware must produce the same pixels.

Board: `xiao-epaper-75` — Seeed XIAO 7.5" ePaper Panel (XIAO ESP32-C3, 4 MB,
800×480 UC8179).

## Layout

```
src/runtime/    portable C++17, no Arduino: blob + CRC, JSON (own reader - see
                json.h for why: responses stream through a filter into a
                small budgeted tree; the runtime JSON is validated once and
                read in place from mapped flash, so it costs no heap), values,
                conditions, formats, time zones, URL placeholders, chunked and
                AES-ECB body decoding, fonts/bitmaps, text layout, drawing,
                wake decisions, the value cache
src/platform/   Arduino side: partition mmap, UC8179 driver, Wi-Fi + NTP,
                HTTPS (CA bundle, same-origin redirects, OAuth refresh,
                mbedtls AES), NVS/RTC persistence, crash back-off, sleep,
                serial commands
src/main.cpp    one wake after another; deep sleep unless a USB host is attached
test/           host tests (unit + golden fixtures from ../spec/fixtures)
tools/          make_test_blob.py (shapes-only blob), package.py (merged image)
partitions.csv  nvs 0x9000, factory app 0x10000 (2.9 MB), dither 0x300000 (1 MB)
```

## Test

```bash
make test                 # clang++/g++, ASan + UBSan; FILTER=golden to run a subset
```

The golden runner renders every `../spec/fixtures/<name>/` (blob.bin +
values.json + expected.pbm) and fails on any differing pixel, writing
`build/golden-out/<name>/actual.pbm`. `clock.*` is derived from `now` in the
blob's `tz`; entries in `values` override it. With no fixtures it skips.
`spec/fixtures/handmade-shapes` is drawn by an independent Python reading of
§4 (`tools/make_test_blob.py --fixture`).

## Build

```bash
make build                # pioarduino (Arduino-ESP32 3.x) via uvx
make image                # + merge, verify (bootloader at 0x0, AA 50 at 0x8000,
                          #   app descriptor "dither"), copy to
                          #   ../app/public/firmware/ and update manifest.json
```

The version comes from `VERSION` and lands in the app descriptor at
`0x10000 + 0x20` (format.md §8).

## Flash by hand

```bash
make flash                # build/xiao-epaper-75.bin at 0x0
make flash-blob           # tools/make_test_blob.py -> 0x300000
esptool --chip esp32c3 erase_region 0x300000 0x100000   # back to "Not set up"
```

(`ESPTOOL=` and `PORT=` override the defaults.)

`make test` also prints, per golden fixture, the heap the load and the render
peak at. Limits worth knowing: a source response keeps at most 2048 JSON values and
16 KB of text, strings are cut at 256 bytes, kept nesting is at most 20 deep
(skipped parts of a response are not limited), and the value cache that
survives sleep is capped at 6 KB - the largest values are dropped first, with
a `WARNING` line in the log. Three crash resets in a row make the board wait
15 minutes before the next attempt. Log lines on the USB serial
port start with `[dither]`. While a USB host is attached the board stays awake
and accepts `CMD:INFO`, `CMD:WAKE`, `CMD:SCREENSHOT` (the panel frame, P4
layout) and `CMD:SLEEP:<s>`. Open the port with DTR high and RTS low, or the
USB-Serial/JTAG resets the chip.
