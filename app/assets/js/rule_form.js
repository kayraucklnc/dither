/* Rule form.
 *
 * Each condition declares its own fields, so the form shows only the ones
 * belonging to the selected condition. Fields for the others are disabled
 * rather than merely hidden — a hidden input still submits, and a stale
 * setting arriving alongside a different condition is exactly the kind of
 * thing that makes a rule quietly mean something other than it says.
 */

const kindSelect = document.getElementById("condition-kind");

if (kindSelect) {
  const groups = document.querySelectorAll(".condition-fields");

  const show = (kind) => {
    groups.forEach((group) => {
      const active = group.dataset.condition === kind;

      group.hidden = !active;
      group
        .querySelectorAll("input, select")
        .forEach((field) => (field.disabled = !active));
    });
  };

  kindSelect.addEventListener("change", () => show(kindSelect.value));
  show(kindSelect.value);
}
