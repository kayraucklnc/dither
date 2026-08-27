import type { Field } from "./manifest";

/**
 * Whether a field's `visible_when` is satisfied.
 *
 * A settings form should follow the choice already made rather than asking
 * every question at once: pick "money taken" and a period appears, pick "how
 * many subscribers" and it does not, because there is no such thing as
 * subscribers over the last seven days. `design` is the reserved name for the
 * style the widget is drawn in, so a design can bring its own settings.
 *
 * The catalogue asks the same question for a different reason - a design that
 * does not take a setting must not be previewed at every value of it - so this
 * lives here rather than inside the form.
 */
export function visible(
  field: Field,
  values: Record<string, unknown>,
  design: string,
): boolean {
  const rule = field.visible_when;
  if (!rule) return true;

  const actual = rule.field === "design" ? design : values[rule.field];
  return rule.any_of.includes(String(actual ?? ""));
}

/** One extra picture of a design: the same template, one answer changed. */
export interface Look {
  /** Unique within a design, and part of the preview URL. */
  key: string;
  /** The field being varied, as a person reads it. */
  field: string;
  /** The value, as a person reads it. */
  value: string;
  /** The settings that draw it - the defaults with one answer replaced. */
  settings: Record<string, unknown>;
}

/** A select's choices as `[value, label]`, however the manifest spelled them. */
function choices(field: Field): [string, string][] {
  return (field.options ?? []).map((option) =>
    typeof option === "string" ? [option, option] : [option.value, option.label],
  );
}

/**
 * Every other picture a design can be drawn as, one answer at a time.
 *
 * The design's own card is already drawn with the defaults, so these are the
 * *alternatives* to it - `numerals: all` but not `numerals: none` when none is
 * what the extension ships with. That keeps the catalogue a list of looks
 * rather than a list of looks with the first one printed twice.
 *
 * One answer at a time, never crossed. Revenue declares five chart periods and
 * five line styles; the cross product is twenty-five pictures of one design
 * and nobody is choosing between twenty-five. Ten is a catalogue. Twenty-five
 * is a wall.
 */
export function looksFor(
  fields: Field[],
  design: string,
  defaults: Record<string, unknown>,
): Look[] {
  const looks: Look[] = [];

  for (const field of fields) {
    if (!field.variants) continue;
    if (!visible(field, defaults, design)) continue;

    if (field.field_type === "boolean") {
      const now = defaults[field.keyname] !== false && defaults[field.keyname] !== "";
      looks.push({
        key: `${field.keyname}-${!now}`,
        field: field.name,
        value: now ? "off" : "on",
        settings: { ...defaults, [field.keyname]: !now },
      });
      continue;
    }

    if (field.field_type !== "select") continue;

    // A list the server resolves - stations, calendars, symbols - cannot be
    // enumerated here, and would not be a set of *looks* if it could.
    const now = String(defaults[field.keyname] ?? "");
    for (const [value, label] of choices(field)) {
      if (value === now) continue;
      looks.push({
        key: `${field.keyname}-${value}`,
        field: field.name,
        value: label,
        settings: { ...defaults, [field.keyname]: value },
      });
    }
  }

  return looks;
}
