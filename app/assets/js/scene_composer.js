// Scene composer.
//
// Drag an extension onto a slot; the panel re-renders through the real
// screenshot-and-dither pipeline so what you see is what the hardware gets.
//
// The rule the whole interaction enforces: a slot only accepts an extension
// that declares that slot's shape. Illegal drops are not validated after the
// fact, they are refused at drag time - the slot never lights up, and the
// cursor says no.

const composer = document.getElementById("composer");

if (composer) {
  const slotsHost = document.getElementById("panel-slots");
  const image = document.getElementById("panel-image");
  const status = document.getElementById("panel-status");
  const modelSelect = document.getElementById("composer-model");

  const assignments = new Map();
  let dragged = null;
  let pending = 0;

  const layout = () =>
    composer.querySelector(".layout-option.is-active")?.dataset.layout;

  const setStatus = (message, tone = "") => {
    if (!message) {
      status.hidden = true;
      return;
    }

    status.textContent = message;
    status.dataset.tone = tone;
    status.hidden = false;
  };

  // Renders through the server. Each request supersedes the last, so dropping
  // three extensions quickly shows the final state rather than whichever
  // render happened to finish last.
  const refresh = () => {
    const current = ++pending;
    const parameters = new URLSearchParams({ layout: layout() });

    if (modelSelect?.value) parameters.set("model_id", modelSelect.value);
    assignments.forEach((id, slot) => parameters.set(`slots[${slot}]`, id));

    if (assignments.size === 0) {
      image.hidden = true;
      setStatus("Drop an extension to see it render.");
      return;
    }

    setStatus("Rendering…", "busy");

    fetch(`${composer.dataset.previewPath}?${parameters}`, {
      headers: { Accept: "image/png" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error);
        return response.blob();
      })
      .then((blob) => {
        if (current !== pending) return;

        const previous = image.src;
        image.src = URL.createObjectURL(blob);
        image.hidden = false;
        setStatus("");
        if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
      })
      .catch((error) => {
        if (current !== pending) return;
        setStatus(error.message, "error");
      });
  };

  const paintSlot = (slot) => {
    const id = assignments.get(slot.dataset.slot);
    const item = id && composer.querySelector(`[data-extension-id="${id}"]`);

    slot.classList.toggle("is-filled", Boolean(item));
    slot.querySelector(".slot-filled").textContent = item
      ? item.dataset.extensionLabel
      : "";
    slot.querySelector(".slot-clear").hidden = !item;
  };

  const eachSlot = (callback) =>
    slotsHost.querySelectorAll(".slot-target").forEach(callback);

  // ---- Dragging ---------------------------------------------------------

  composer.querySelectorAll(".palette-item").forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      dragged = item;
      event.dataTransfer.effectAllowed = "copy";
      // Firefox will not start a drag without payload, even an unused one.
      event.dataTransfer.setData("text/plain", item.dataset.extensionId);
      item.classList.add("is-dragging");

      const shapes = item.dataset.shapes.split(" ");

      composer.classList.add("is-dragging");
      eachSlot((slot) => {
        slot.dataset.droppable = shapes.includes(slot.dataset.shape);
      });
    });

    item.addEventListener("dragend", () => {
      dragged = null;
      item.classList.remove("is-dragging");
      composer.classList.remove("is-dragging");
      eachSlot((slot) => {
        delete slot.dataset.droppable;
        slot.classList.remove("is-over");
      });
    });
  });

  eachSlot((slot) => {
    const accepts = () => slot.dataset.droppable === "true";

    slot.addEventListener("dragover", (event) => {
      if (!accepts()) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      slot.classList.add("is-over");
    });

    slot.addEventListener("dragleave", () => slot.classList.remove("is-over"));

    slot.addEventListener("drop", (event) => {
      if (!accepts() || !dragged) return;

      event.preventDefault();
      slot.classList.remove("is-over");
      assignments.set(slot.dataset.slot, dragged.dataset.extensionId);
      paintSlot(slot);
      refresh();
    });

    slot.querySelector(".slot-clear").addEventListener("click", () => {
      assignments.delete(slot.dataset.slot);
      paintSlot(slot);
      refresh();
    });
  });

  // ---- Layout and panel changes ----------------------------------------

  composer.querySelectorAll(".layout-option").forEach((option) => {
    option.addEventListener("click", () => {
      // Slot keys and shapes differ per layout, so carrying assignments across
      // would silently place things where they were never allowed. Reload with
      // the new layout instead and start it clean.
      const parameters = new URLSearchParams(window.location.search);

      parameters.set("layout", option.dataset.layout);
      if (modelSelect?.value) parameters.set("model_id", modelSelect.value);
      window.location.search = parameters.toString();
    });
  });

  modelSelect?.addEventListener("change", () => {
    const parameters = new URLSearchParams(window.location.search);

    parameters.set("layout", layout());
    parameters.set("model_id", modelSelect.value);
    window.location.search = parameters.toString();
  });

  setStatus("Drop an extension to see it render.");
}
