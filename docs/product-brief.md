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

### Nothing is ever authored as a combination

The trap this design exists to avoid: *"to show clock plus trains I make a
screen, to show clock plus weather I make another, to show all three I make a
third"*. That is 2^N screens for N things you own, and every new extension
doubles the work.

So a scene is never authored as a picture. It is **resolved** from rules, in
two layers that answer two different questions.

### Layer 1 — Mode: what is going on right now?

A **mode** is a named situation. Modes are **exclusive**: exactly one is active
at any moment, and there is always a `Default` mode at priority 0 whose
condition is always true. The highest-priority mode whose *enter* condition
holds wins. That single rule is the whole answer to "many triggers fire at
once" for behaviour.

```
Mode: Commute                    priority 50
  enter when   calendar.next_event starts within 30 minutes
  exit when    calendar.next_event has started
  while active refresh every 5 minutes   (default is 15)
```

Enter and exit are **separate conditions on purpose**. A single condition that
flickers on its boundary would thrash the panel, and an e-ink refresh is both
visible and expensive. Separate conditions give hysteresis: this is the finite
state machine, and it is the part that changes *behaviour*, not just content.

A mode carries: its refresh cadence, optional per-extension poll overrides, an
optional pinned layout, and the slot rules that only apply while it is active.

### Layer 2 — Rules: what fills each slot?

A **rule** is one sentence:

> put **{extension}** on screen when **{condition}**, at priority **{n}**

Rules are **additive**, not exclusive. Several can be true at once, and they do
not conflict because they compete slot by slot, not screen by screen.

```
Clock        priority 0    always                    ← the base
Departures   priority 50   while mode is Commute
Weather      priority 60   when weather is rain
```

- Ordinary day: Clock alone, full page.
- Commuting: Departures appears, Clock keeps what is left.
- Raining while commuting: all three, each in its own slot.

**Three rules, not eight screens.** Adding a fourth extension adds one rule, not
eight more screens. This is the answer to the combinatorics.

### Elastic layout

The layout is **derived, not chosen**. Each active rule asks for a slot; the
resolver picks the smallest layout that can seat every active rule, given what
shapes each extension declares.

One active rule → `full`. Two → `split_vertical`, or `sidebar` if one of them
only declares a narrow shape. Three → `columns`, or `banner` plus a split.

This is only possible because extensions declare shapes: the resolver is a
short search over the ten known layouts, and it can always explain itself —
*"chose Banner and body, because Weather only declares third_height."*

Pinning a mode to a fixed layout stays available as an escape hatch, but it is
not the default. The default is that adding a thing rearranges the panel and
you never touch a layout picker.

### Conditions

A condition is a flat **list of checks, all of which must hold**. Each check is
built from dropdowns, never typed:

```
[Weather]    [condition]    [is]             [rain]
[Calendar]   [next event]   [starts within]  [30 minutes]
[Battery]    [level]        [below]          [20 %]
[Time]       [clock]        [between]        [07:00] [09:30]
[Departures] [last fetch]   [failed]
```

There is **no OR and no nesting**. Two alternatives means two rules. That
limitation is deliberate: it keeps every rule readable at a glance and keeps
the editor a set of dropdowns rather than an expression builder.

Extensions extend the vocabulary the same way they extend shapes — by
declaring the facts they can be asked about:

```yaml
facts:
  - key: next_departure_in
    label: Next departure in
    type: duration
```

Anything declared becomes selectable in every condition editor. Built-in
providers (Time, Battery, Device, Webhook) work identically.

### Resolution, end to end

1. Evaluate every mode's enter/exit condition; the active mode is the
   highest-priority one satisfied. Hysteresis applies.
2. Collect rules that are active: base rules plus the active mode's own.
3. Ask the layout resolver for the smallest layout seating them all.
4. Fill slots highest priority first; ties break on explicit rule order.
5. A rule whose extension fails to fetch keeps its slot and renders its own
   stale-or-empty state — a failed fetch must never silently reshuffle the
   panel.

### Naming

Current names confuse: Design → Screen → Playlist is three nouns for one idea,
and "Playlist" implies shuffle. Settled:

| Now | Becomes | Means |
|---|---|---|
| — | **Shape** | a footprint an extension can be designed for |
| Design | **Layout** | how the panel is divided into slots |
| Screen | **Scene** | a layout with its slots filled — what the panel shows |
| Playlist | **Mode** + **Rules** | what is going on, and what that puts on screen |

"View" was rejected: `Terminus::Views` is already Hanami's view layer, so the
domain noun would collide with the framework in every file. "Scene" also reads
better against triggers — scenes change on cue.

### Preview and the simulator

A preview showing **what the device would be seeing at this moment**, driven by
the same path the device takes: compose, screenshot, dither. Implemented.

On top of it, a **simulator**: toggles for every fact any provider declares.
Turn on rain, put a calendar event 20 minutes out, drop the battery to 15% —
and watch the mode stack and the panel respond. This is what makes the rule
system understandable, and it is what makes the product evaluable with no
hardware at all.

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

- Does a mode pin to one device, a group, or all? Leaning per-device, with
  rules shared across devices and modes scoped to a device.
- How far does the layout resolver go before giving up — is there a point where
  it should refuse and ask for a pinned layout instead?
- Do we keep the recipe gallery (fetches trmnl.com) or replace it with our own
  library? Current inclination: delete it.

## Settled, previously open

- **Simultaneous triggers.** Modes are exclusive and priority-ordered with
  hysteresis; rules are additive and resolved per slot by priority. Never
  insertion order.
- **A slot whose extension fails to fetch** keeps its slot and renders its own
  empty state. The panel must not reshuffle because a fetch failed.
