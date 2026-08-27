# The device API contract

Dither serves **stock TRMNL firmware**. The device is not ours to change, so
this contract is fixed: it is the one part of the system a rewrite may not
redesign. Everything here was read off the running Hanami server's request
specs (`spec/requests/display_spec.rb`, `spec/requests/setup_spec.rb`) and is
the reference for any port.

## What the device sends

Every request carries these headers. Names are HTTP headers, shown here without
the `HTTP_` prefix Rack adds.

| Header | Example | Meaning |
|---|---|---|
| `access-token` | `abc123` | The device's API key. Identifies the device on `/api/display`. |
| `id` | `A1:B2:C3:D4:E5:F6` | MAC address. Identifies the device on `/api/setup`. |
| `model` | `og` | Hardware model slug. |
| `fw-version` | `1.2.3` | Firmware currently flashed. |
| `width` / `height` | `800` / `480` | Panel size in pixels. |
| `battery-voltage` | `4.74` | Volts. |
| `percent-charged` | `85` | Battery percentage. |
| `usb-connected` | `false` | Whether it is on the cable. |
| `rssi` | `-54` | Wi-Fi signal strength, dBm. |
| `wifi-band` | `2.4` | Wi-Fi band. |
| `refresh-rate` | `25` | Seconds the device thinks it should sleep. |
| `wake-time` | `20` | Seconds it stayed awake. |
| `image-cached` | `false` | Whether it already holds the image. |
| `temperature-profile` | `true` | Whether it supports temperature profiles. |
| `update-source` | `Button pressed.` | Why it woke. **This is the button-press trigger.** |
| `sensors` | `make=Sensirion;model=SCD41;kind=humidity;value=26;unit=percent;created_at=1735714800` | Semicolon-delimited key=value pairs, one sensor reading. |
| `user-agent` | `ESP32HTTPClient` | |

## `GET /api/setup`

Identified by the `id` (MAC) header. Answers a device that has never been seen
by provisioning one and handing back its API key; answers a known device with
an empty key.

```json
{
  "api_key": "<generated, or \"\" when the device is already known>",
  "image_url": "<api_uri>/assets/setup.bmp",
  "message": "Welcome to Dither!",
  "status": 200
}
```

On failure it answers an RFC 9457 problem document, `type:
/problem_details#device_setup`.

## `GET /api/display`

The hot path. Identified by the `access-token` header. Every field below is
always present; `firmware_url` and `firmware_version` are `null` when the
device already runs the latest firmware or no firmware is on file.

```json
{
  "filename": "welcome_1-1735714800",
  "firmware_url": "memory://abc123.bin",
  "firmware_version": "0.0.0",
  "image_url": "https://host/uploads/<32 hex>.png",
  "image_url_timeout": 0,
  "maximum_compatibility": false,
  "refresh_rate": 900,
  "reset_firmware": false,
  "special_function": "none",
  "temperature_profile": "default",
  "touchbar_mode": "tap",
  "update_firmware": false
}
```

Notes that cost time to rediscover:

- `filename` is `<screen name>-<unix timestamp>`. The device uses it as a cache
  key, so it **must** change whenever the image changes, and must **not** change
  when it hasn't.
- `refresh_rate` is **seconds**, not minutes. Default 900.
- `image_url_timeout` comes from the device's own `image_timeout` column.
- `firmware_url` is dropped (null) when the device's `fw-version` matches the
  newest firmware on file, or when there is no firmware at all.
- The image is fetched by the device in a **second, unauthenticated request**.
  It must be reachable at `image_url` without headers.

## `POST /api/log`

The device posts its own logs here. Kept as-is.

## Image requirements

1-bit PNG for the monochrome panels, Floyd–Steinberg dithered. The og_plus
panel is 800x480. Colour panels dither to a declared palette. See
`app/aspects/screens/converters/` for the exact ImageMagick invocations.
