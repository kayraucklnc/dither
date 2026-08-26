# Dither — product brief

The durable statement of what we are building and why. Written down because
conversation context gets compacted; this file does not.

Last updated: 2026-08-27.

---

## The one-sentence goal

Setting up what appears on an e-ink display should be **extremely easy** from
this dashboard — and you should be able to see exactly what the display will
show **before you own a device**.

## Where we are

Forked from usetrmnl/terminus. The plumbing is sound: devices provision
themselves, screens render through Chromium and dither to 1-bit, extensions
fetch data over Liquid-templated HTTP. The domain model and the UI on top of it
are not. We are free to scrap what does not serve the goal.

Already done: self-hosted screen framework (no trmnl.com), rebrand, dashboard
rebuild, WebSerial flashing, dev stack with hot reload, bundled extension format
with an authoring guide (`extensions/README.md`).

---

## The model we are moving to

### Extensions declare their own layout variants

An extension is a block of content. Each one declares **which shapes it can
render in** — that declaration is part of its `configuration.yml`:

- full page
- half width, half height
- one third width, one third height
- any other fraction it chooses to support

Supporting a shape is **optional**. An extension may only support full page.
The composer must respect this: **if an extension does not declare a half
variant, it cannot be dropped into a half slot.** Never fake it by scaling.

Every extension must support full page as the floor.

### Screens are composed, not authored

A screen is built by **dragging extensions into slots**. Stacking is allowed
wherever the extensions involved declare support for the resulting size. The
composer should make illegal arrangements impossible rather than merely
discouraged — invalid drop targets should not accept the drag.

### Screens are chosen by triggers

Each screen opens on a **trigger**. Planned trigger types:

- time-based (window, cron, sunrise/sunset)
- battery percentage
- webhook
- API result / condition on fetched data
- extension status

**Multiple triggers can be true at once.** This is the hard part and needs a
deliberate resolution model — priority ordering, specificity, or explicit
precedence. Do not leave it to insertion order.

Different devices may show different things, so targeting is per-device.

### Naming

Current names confuse: Design → Screen → Playlist is three nouns for one idea,
and "Playlist" implies shuffle. Proposed:

| Now | Proposed | Means |
|---|---|---|
| Design | **Layout** | how blocks are arranged |
| Screen | **View** | a layout filled with extension blocks |
| Playlist | **Schedule** | trigger rules deciding which View a device shows |

Not final. The test is whether someone new understands it without help.

### Preview

A preview tab showing **what the device would be seeing at this moment** —
driven by the same API the device calls. This is what makes the product
evaluable without hardware, so it is not a nice-to-have.

---

## Principles

1. **Extendability is the point.** Every layer takes new entries as data or
   files, never as edits to core code. The bar: a generator that has read
   `extensions/README.md` can produce a working extension without reading app
   source.
2. **Make the illegal impossible.** Prefer constraints the UI enforces over
   documentation asking people to behave.
3. **Design for 1-bit.** Pure black on white, heavy rules, big type. Greys,
   shadows and opacity dither to noise.
4. **No external dependencies at render time.** Nothing on the critical path we
   do not host.
5. **Scrap freely.** Inherited code and inherited nouns get no deference.

## Open questions

- How do simultaneous triggers resolve? Priority, specificity, or explicit order?
- Does a View pin to one device, a group, or all?
- What happens when a composed View has a slot whose extension fails to fetch?
- Do we keep the recipe gallery (fetches trmnl.com) or replace it with our own
  library? Current inclination: delete it.
