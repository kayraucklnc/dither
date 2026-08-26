/* Light/dark toggle.
 *
 * Three states, cycled in this order: system -> light -> dark -> system.
 * "system" removes the attribute entirely so the CSS media query takes over,
 * which is why colours.css defines every token on bare :root as well.
 *
 * The pre-paint application lives in the layout's inline script; this module
 * only handles the button, so a slow bundle can't cause a flash of light mode.
 */

const STORAGE_KEY = "dither:theme";
const ORDER = ["system", "light", "dark"];
const GLYPH = { system: "◐", light: "☀", dark: "☾" };

function read() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return ORDER.includes(value) ? value : "system";
  } catch {
    // Private windows and blocked site-data both throw here.
    return "system";
  }
}

function write(value) {
  try {
    if (value === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Nothing to do — the in-memory state below still drives this page. */
  }
}

function apply(value) {
  const root = document.documentElement;
  if (value === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", value);
}

function label(value) {
  return `Theme: ${value}. Click to change.`;
}

function mount() {
  const button = document.querySelector(".site-theme-toggle");
  if (!button) return;

  let current = read();
  button.textContent = GLYPH[current];
  button.setAttribute("aria-label", label(current));

  button.addEventListener("click", () => {
    current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    apply(current);
    write(current);
    button.textContent = GLYPH[current];
    button.setAttribute("aria-label", label(current));
  });
}

document.addEventListener("DOMContentLoaded", mount);
// htmx swaps can replace the header, so re-bind afterwards.
document.addEventListener("htmx:afterSwap", mount);
