/* Copy-to-clipboard for elements marked with data-copy-target.
 *
 * The dashboard's API endpoint is the one string you must retype into a
 * device's captive portal, so getting it onto the clipboard matters more
 * than it looks.
 */

const RESET_MS = 1600;

async function copy(button) {
  const source = document.getElementById(button.dataset.copyTarget);
  if (!source) return;

  const text = source.textContent.trim();

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers, and any non-secure context, reject the async API.
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand("copy");
    } catch {
      return;
    } finally {
      field.remove();
    }
  }

  const original = button.textContent;
  button.textContent = "Copied";
  button.dataset.copied = "true";
  setTimeout(() => {
    button.textContent = original;
    delete button.dataset.copied;
  }, RESET_MS);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy-target]");
  if (button) copy(button);
});
