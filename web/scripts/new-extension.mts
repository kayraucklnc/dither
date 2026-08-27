import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Scaffold an extension.
 *
 * The point is not saving typing - it is that the file it writes is a *working*
 * extension with sample data, four shapes and a fact, so the first thing you
 * see is a render rather than an error. Nobody learns a format from an empty
 * directory.
 */
const [name, ...rest] = process.argv.slice(2);
const label = rest.join(" ") || name;

if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error("Usage: npx tsx scripts/new-extension.mts <name> [Label]");
  console.error("The name is a directory name: lower case, digits and underscores.");
  process.exit(1);
}

const root = path.join(process.cwd(), "..", "extensions", name);
await mkdir(path.join(root, "templates"), { recursive: true });

const manifest = `# Dither extension: ${label}.
#
# Everything below is picked up on the next request - there is no registration
# step. See extensions/README.md for what each part does.

version: "1.0.0"
name: ${name}
label: ${label}
description: >
  One sentence on what this puts on a panel.

# static = draws from its settings and fetches nothing. Change to poll (and
# add exchanges), or connection (and name one), when it needs data.
kind: static
mode: text
tags: []

interval: 15
unit: minute
days: []
last_day_of_month: false
start_at: "2026-01-01T00:00:00Z"

static_body: {}
data: {}

fields:
  - keyname: heading
    name: Heading
    field_type: string
    default: "${label}"
    help_text: Shown at the top. Blank hides it.
    optional: true

# Its designs have a strip where another extension's notice can appear.
accepts_notices: true

# Every fact here becomes something a device can branch on.
facts:
  - key: value
    label: The number
    type: number
    path: reading.value
    unit: ""

# Used in previews until something real has been fetched. Never sent to a
# device, so make it plausible and make it exercise the awkward cases.
sample:
  reading:
    value: 42
    caption: "Stand-in data"

exchanges: []
`;

const notices = `
  {% comment %} Where another extension gets to say something on this screen. {% endcomment %}
  {% if notices.size > 0 %}
    <div class="notice-strip">
      {% for notice in notices %}
        <span class="notice{% if notice.loud %} notice--loud{% endif %}">
          <span class="i i-{{ notice.icon }}"></span>{{ notice.text }}
        </span>
      {% endfor %}
    </div>
  {% endif %}
`;

const full = `{% comment %} Full: 800x480. {% endcomment %}

<div class="screen">
  <div class="title-bar">
    <div class="title">{{ extension.values.heading | default: "${label}" }}</div>
  </div>

  <div class="content layout layout--col layout--center" style="gap: 8px">
    <p class="t-bold" style="font-size: 96px; line-height: 1">{{ reading.value }}</p>
    <p class="caption">{{ reading.caption }}</p>
  </div>
${notices}</div>
`;

const band = `{% comment %}
  Third height: 800x160, and taller when the family stands in. \`shape.rows\`
  is how a band fills the extra room instead of leaving it empty.
{% endcomment %}

<div class="screen">
  <div class="content layout layout--row" style="align-items: center; gap: 22px">
    <p class="t-bold" style="font-size: 44px; line-height: 1">{{ reading.value }}</p>
    <div class="fit" style="border-left: var(--rule) solid var(--ink); padding-left: 22px">
      <p class="t-md t-bold">{{ extension.values.heading | default: "${label}" }}</p>
      <p class="t-sm">{{ reading.caption }}</p>
    </div>
  </div>
${notices}</div>
`;

const column = `{% comment %} Third width: 267x480. A narrow full-height column. {% endcomment %}

<div class="screen dense">
  <div class="content content--tight layout layout--col layout--center" style="gap: 8px">
    <p class="t-xs t-upper">{{ extension.values.heading | default: "${label}" }}</p>
    <p class="t-bold" style="font-size: 44px; line-height: 1">{{ reading.value }}</p>
    <p class="t-xs t-center">{{ reading.caption }}</p>
  </div>
${notices}</div>
`;

const corner = `{% comment %} Quarter: 400x240. Only what matters most fits legibly. {% endcomment %}

<div class="screen dense">
  <div class="content layout layout--col" style="justify-content: space-between">
    <p class="t-xs t-upper">{{ extension.values.heading | default: "${label}" }}</p>
    <div>
      <p class="t-bold" style="font-size: 52px; line-height: 1">{{ reading.value }}</p>
      <p class="t-sm">{{ reading.caption }}</p>
    </div>
  </div>
${notices}</div>
`;

await writeFile(path.join(root, "configuration.yml"), manifest);
await writeFile(path.join(root, "template.html.liquid"), full);
await writeFile(path.join(root, "templates", "third_height.html.liquid"), band);
await writeFile(path.join(root, "templates", "third_width.html.liquid"), column);
await writeFile(path.join(root, "templates", "quarter.html.liquid"), corner);

console.log(`extensions/${name} written.

Four templates cover all eight shapes: full, a wide band, a tall column and a
corner, each standing in for the rest of its family.

Next:
  1. Open http://localhost:3000/extensions - it is already there and rendering.
  2. Point it at real data: set kind to poll and add an exchange.
  3. npx tsx --env-file=.env.local scripts/sweep.mts   to see every shape.`);
