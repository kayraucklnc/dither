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
  const hint = document.getElementById("palette-hint");
  const saveSlots = document.getElementById("scene-save-slots");
  const saveButton = document.getElementById("scene-save-button");
  let dragged = null;
  let picked = null;
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

  // Renders through the server. The image element loads the URL itself rather
  // than going through fetch and a blob: fewer moving parts, the browser's own
  // caching and decoding, and a real error event when something goes wrong.
  // Each request supersedes the last, so dropping three extensions quickly
  // shows the final state rather than whichever render finished last.
  const refresh = () => {
    const token = ++pending;
    const parameters = new URLSearchParams({layout: layout()});

    if (modelSelect?.value) parameters.set("model_id", modelSelect.value);
    assignments.forEach((id, slot) => parameters.set(`slots[${slot}]`, id));

    // Detach first: removing the source fires an error event, and the handler
    // left over from the previous render would report a failure for a panel
    // that is merely empty.
    image.onload = null;
    image.onerror = null;

    if (assignments.size === 0) {
      image.hidden = true;
      image.removeAttribute("src");
      setStatus("Pick an extension, then click a slot.");
      return;
    }

    // Distinguishes one render from the next so the browser does not reuse a
    // cached response for a URL whose underlying data has moved on.
    parameters.set("t", String(token));

    setStatus("Rendering…", "busy");

    image.onload = () => {
      if (token !== pending) return;
      image.hidden = false;
      setStatus("");
    };

    // The endpoint answers a JSON problem when a composition is refused, which
    // arrives here as a failed image load. Re-request it to read the reason.
    image.onerror = () => {
      if (token !== pending) return;
      image.hidden = true;

      fetch(`${composer.dataset.previewPath}?${parameters}`)
        .then((response) => response.json())
        .then((body) => setStatus(body.error || "Could not render this scene.", "error"))
        .catch(() => setStatus("Could not render this scene.", "error"));
    };

    image.src = `${composer.dataset.previewPath}?${parameters}`;
  };

  // Mirrors the assignments into the save form. Kept in sync on every change
  // rather than gathered on submit, so the button can honestly say whether
  // there is anything worth saving.
  const syncSaveForm = () => {
    if (!saveSlots) return;

    saveSlots.replaceChildren();
    assignments.forEach((id, slot) => {
      const field = document.createElement("input");

      field.type = "hidden";
      field.name = `slots[${slot}]`;
      field.value = id;
      saveSlots.append(field);
    });

    if (saveButton) saveButton.disabled = assignments.size === 0;
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

  // Marks which slots this extension is allowed to fill. Shared by dragging
  // and picking so both refuse the same things for the same reason.
  const markDroppable = (item) => {
    const shapes = item.dataset.shapes.split(" ");

    eachSlot((slot) => {
      slot.dataset.droppable = shapes.includes(slot.dataset.shape);
    });
  };

  // ---- Picking (click to place) -----------------------------------------
  //
  // Drag is a shortcut, not the only way in. HTML5 drag is easy to get subtly
  // wrong by hand and does not exist on touch, so the same job is always
  // available as pick-then-place.

  const clearPick = () => {
    picked = null;
    composer.classList.remove("is-picking");
    composer.querySelectorAll(".palette-item").forEach((item) =>
      item.classList.remove("is-picked"),
    );
    eachSlot((slot) => delete slot.dataset.droppable);
    hint.hidden = true;
  };

  const pick = (item) => {
    if (picked === item) return clearPick();

    clearPick();
    picked = item;
    item.classList.add("is-picked");
    composer.classList.add("is-picking");
    markDroppable(item);
    hint.textContent = `Now click a slot to place ${item.dataset.extensionLabel}.`;
    hint.hidden = false;
  };

  const place = (slot) => {
    if (!picked || slot.dataset.droppable !== "true") return;

    assignments.set(slot.dataset.slot, picked.dataset.extensionId);
    paintSlot(slot);
    clearPick();
    syncSaveForm();
    refresh();
  };

  // ---- Dragging ---------------------------------------------------------

  composer.querySelectorAll(".palette-item").forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      dragged = item;
      event.dataTransfer.effectAllowed = "copy";
      // Firefox will not start a drag without payload, even an unused one.
      event.dataTransfer.setData("text/plain", item.dataset.extensionId);
      item.classList.add("is-dragging");
      composer.classList.add("is-dragging");
      markDroppable(item);
    });

    item.addEventListener("click", () => pick(item));

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
      syncSaveForm();
      refresh();
    });

    slot.addEventListener("click", () => place(slot));

    slot.querySelector(".slot-clear").addEventListener("click", (event) => {
      event.stopPropagation();
      assignments.delete(slot.dataset.slot);
      paintSlot(slot);
      syncSaveForm();
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") clearPick();
  });

  setStatus("Pick an extension, then click a slot.");
}
