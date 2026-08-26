// <transit-settings> — the configuration surface for a transit extension.
//
// Deliberately self-contained: it owns its markup, talks to /transit/catalog
// and /transit/stations, and its only output is a JSON object written to a
// hidden input and broadcast as a "transit-settings:change" event. Nothing in
// the app mounts it yet; when the extension settings UI lands, mounting is one
// tag and one attribute.
//
//   <transit-settings input="#extension_data"
//                     value='{"values":{"origin":"MILANO CERTOSA"}}'>
//   </transit-settings>
//
// Attributes:
//   endpoint  Base path for catalog/station lookups. Default "/transit".
//   input     CSS selector of a hidden field kept in sync with the JSON.
//   views     JSON array of the views the extension declares. Read only: which
//             one renders is a layout decision, never a setting.
//   value     Initial JSON, in the same {"values": {...}} shape the field is
//             written back as, which is what extension.data already holds.

import "./transit_station_picker.js";

const LEAD_TIMES = [0, 5, 15, 30];

// Wireframes for the shapes a view can take. Shapes, not positions: where a
// horizontal band actually sits is whatever the layout page picks from the
// view's align list, so the frame is drawn unanchored.
const FRAMES = {
  full: '<rect x="1" y="1" width="46" height="28" rx="2"/>',
  horizontal: '<rect x="1" y="11" width="46" height="8" rx="2"/>',
  vertical: '<rect x="17" y="1" width="14" height="28" rx="2"/>',
  overlay: '<rect x="26" y="17" width="19" height="11" rx="2"/>'
};

// Only the things the component can honestly decide for you. Stations are
// deliberately blank: which two you care about is the whole point of the form,
// and a prefilled route is a route somebody forgets to change.
const DEFAULTS = {
  country: "it",
  city: "milan",
  provider: "trenord",
  origin: "",
  destination: "",
  lead_time: 0,
  limit: 5,
  transfers: 0,
  language: "en",
  title: "",
  show_platform: true,
  hide_cancelled: false
};

export class TransitSettings extends HTMLElement {
  // The host may hand over declared views after mounting, so watch for them.
  static observedAttributes = ["views"];

  #countries = [];
  #values = {...DEFAULTS};
  #target = null;

  async connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";

    this.#values = {...DEFAULTS, ...readInitial(this.getAttribute("value"))};
    this.#target = this.getAttribute("input") ? document.querySelector(this.getAttribute("input")) : null;

    this.classList.add("transit-settings");
    this.innerHTML = SKELETON;
    this.#countries = await this.#loadCatalog();
    this.#renderPlace();
    this.#renderRoute();
    this.#renderWhen();
    this.#renderBoard();
    this.#renderViews();
    this.#bind();
    this.#sync();
  }

  attributeChangedCallback(name) {
    if (name === "views" && this.querySelector("[data-role=views]")) this.#renderViews();
  }

  get values() {
    return {...this.#values};
  }

  async #loadCatalog() {
    const endpoint = this.getAttribute("endpoint") || "/transit";

    try {
      const response = await fetch(`${endpoint}/catalog`, {headers: {Accept: "application/json"}});
      if (!response.ok) throw new Error(`Catalog unavailable (${response.status}).`);

      const payload = await response.json();
      return payload.data || [];
    } catch (error) {
      this.querySelector("[data-role=error]").textContent = error.message;
      return [];
    }
  }

  // ---- Sections ------------------------------------------------------

  #renderPlace() {
    const country = this.#country();
    const city = this.#city();

    fill(this.querySelector("[data-role=country]"), this.#countries.map(toOption), this.#values.country);
    fill(this.querySelector("[data-role=city]"), (country?.cities || []).map(toOption), this.#values.city);
    fill(this.querySelector("[data-role=provider]"), (city?.providers || []).map(toOption), this.#values.provider);

    const provider = this.#provider();
    this.querySelector("[data-role=provider-note]").textContent = provider?.description || "";
  }

  #renderRoute() {
    const provider = this.#provider();

    this.querySelectorAll("transit-station-picker").forEach((picker) => {
      picker.setAttribute("endpoint", this.getAttribute("endpoint") || "/transit");
      picker.setAttribute("provider", this.#values.provider);
    });

    this.querySelector("[data-role=origin]").value = this.#values.origin;
    this.querySelector("[data-role=destination]").value = this.#values.destination;

    // A journey planner cannot answer "everything leaving here", so a
    // destination is required rather than optional for this shape of provider.
    const journey = provider?.shape === "journey";
    this.querySelector("[data-role=destination-wrap]").hidden = !journey;
    this.querySelector("[data-role=route-note]").textContent = journey
      ? "Trenord plans journeys, so a board always points at a destination."
      : "";
  }

  #renderWhen() {
    const chosen = Number(this.#values.lead_time) || 0;
    const known = LEAD_TIMES.includes(chosen);

    this.querySelectorAll("[data-lead]").forEach((button) => {
      const active = known && Number(button.dataset.lead) === chosen;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const custom = this.querySelector("[data-role=lead-custom]");
    custom.value = chosen;
    custom.closest("[data-role=lead-custom-wrap]").hidden = known;
    this.querySelector("[data-role=lead-note]").textContent =
      chosen === 0
        ? "Showing the very next train, even if you cannot reach the platform."
        : `Hiding anything leaving within ${chosen} minutes.`;
  }

  // What this extension can be asked to render. Announced, not chosen: a
  // layout page picks a view and a size inside these bounds.
  #renderViews() {
    const views = readViews(this.getAttribute("views"));
    const target = this.querySelector("[data-role=views]");

    if (views.length === 0) {
      target.innerHTML = "";
      return;
    }

    target.innerHTML = views
      .map((view) => `
        <div class="transit-view">
          <svg class="transit-view-frame" viewBox="0 0 48 30" aria-hidden="true">
            <rect x="0.5" y="0.5" width="47" height="29" rx="2" class="transit-view-screen"/>
            ${FRAMES[view.shape || view.name] || FRAMES.full}
          </svg>
          <span class="transit-view-label">${escapeHtml(view.label || view.name)}</span>
          <span class="transit-view-hint">${escapeHtml(view.description || "")}</span>
          <span class="transit-view-bounds">${bounds(view)}</span>
          <span class="transit-view-bounds">Anchors ${(view.align || []).join(", ") || "anywhere"}</span>
        </div>`)
      .join("");
  }

  #renderBoard() {
    this.querySelector("[data-role=limit]").value = this.#values.limit;
    this.querySelector("[data-role=transfers]").value = this.#values.transfers;
    this.querySelector("[data-role=language]").value = this.#values.language;
    this.querySelector("[data-role=title]").value = this.#values.title || "";
    this.querySelector("[data-role=show_platform]").checked = Boolean(this.#values.show_platform);
    this.querySelector("[data-role=hide_cancelled]").checked = Boolean(this.#values.hide_cancelled);
  }

  // ---- Wiring --------------------------------------------------------

  #bind() {
    this.querySelector("[data-role=country]").addEventListener("change", (event) => {
      this.#values.country = event.target.value;
      this.#values.city = this.#country()?.cities?.[0]?.code || "";
      this.#values.provider = this.#city()?.providers?.[0]?.code || "";
      this.#renderPlace();
      this.#renderRoute();
      this.#sync();
    });

    this.querySelector("[data-role=city]").addEventListener("change", (event) => {
      this.#values.city = event.target.value;
      this.#values.provider = this.#city()?.providers?.[0]?.code || "";
      this.#renderPlace();
      this.#renderRoute();
      this.#sync();
    });

    this.querySelector("[data-role=provider]").addEventListener("change", (event) => {
      this.#values.provider = event.target.value;
      this.#renderPlace();
      this.#renderRoute();
      this.#sync();
    });

    ["origin", "destination"].forEach((key) => {
      const picker = this.querySelector(`[data-role=${key}]`);
      picker.addEventListener("change", () => {
        this.#values[key] = picker.value;
        this.#sync();
      });
      picker.querySelector("input").addEventListener("input", () => {
        this.#values[key] = picker.value;
        this.#sync();
      });
    });

    this.querySelectorAll("[data-lead]").forEach((button) => {
      button.addEventListener("click", () => {
        this.#values.lead_time = Number(button.dataset.lead);
        this.#renderWhen();
        this.#sync();
      });
    });

    this.querySelector("[data-role=lead-other]").addEventListener("click", () => {
      this.#values.lead_time = LEAD_TIMES.includes(Number(this.#values.lead_time)) ? 45 : this.#values.lead_time;
      this.#renderWhen();
      this.#sync();
    });

    this.querySelector("[data-role=lead-custom]").addEventListener("input", (event) => {
      this.#values.lead_time = clamp(Number(event.target.value), 0, 720);
      this.querySelector("[data-role=lead-note]").textContent =
        `Hiding anything leaving within ${this.#values.lead_time} minutes.`;
      this.#sync();
    });

    this.querySelector("[data-role=limit]").addEventListener("input", (event) => {
      this.#values.limit = clamp(Number(event.target.value), 1, 20);
      this.#sync();
    });

    this.querySelector("[data-role=transfers]").addEventListener("input", (event) => {
      this.#values.transfers = clamp(Number(event.target.value), 0, 5);
      this.#sync();
    });

    this.querySelector("[data-role=language]").addEventListener("change", (event) => {
      this.#values.language = event.target.value;
      this.#sync();
    });

    this.querySelector("[data-role=title]").addEventListener("input", (event) => {
      this.#values.title = event.target.value;
      this.#sync();
    });

    ["show_platform", "hide_cancelled"].forEach((key) => {
      this.querySelector(`[data-role=${key}]`).addEventListener("change", (event) => {
        this.#values[key] = event.target.checked;
        this.#sync();
      });
    });
  }

  #sync() {
    const payload = {values: this.#values};
    const json = JSON.stringify(payload, null, 2);

    const incomplete = this.#missing().length > 0;

    this.querySelector("[data-role=preview]").textContent = json;
    this.querySelector("[data-role=summary]").textContent = this.#summary();
    this.querySelector("[data-role=summary]").classList.toggle("is-incomplete", incomplete);
    if (this.#target) this.#target.value = json;

    this.dispatchEvent(new CustomEvent("transit-settings:change", {bubbles: true, detail: payload}));
  }

  #summary() {
    const {origin, destination, limit, lead_time: lead} = this.#values;
    const missing = this.#missing();

    if (missing.length > 0) return `Pick ${missing.join(" and ")} to finish setting this up.`;

    const when = lead === 0 ? "leaving now" : `leaving in ${lead} minutes or more`;

    return `Next ${limit} trains from ${origin} to ${destination}, ${when}.`;
  }

  #missing() {
    const journey = this.#provider()?.shape === "journey";
    const missing = [];

    if (!this.#values.origin) missing.push("an origin station");
    if (journey && !this.#values.destination) missing.push("a destination station");

    return missing;
  }

  // ---- Catalog lookups ------------------------------------------------

  #country() {
    return this.#countries.find((item) => item.code === this.#values.country);
  }

  #city() {
    return (this.#country()?.cities || []).find((item) => item.code === this.#values.city);
  }

  #provider() {
    return (this.#city()?.providers || []).find((item) => item.code === this.#values.provider);
  }
}

const SKELETON = `
  <p class="transit-error" data-role="error"></p>

  <section class="transit-section">
    <h3 class="transit-heading">Where</h3>
    <div class="transit-grid transit-grid--3">
      <div class="transit-field">
        <label class="transit-label" for="transit-country">Country</label>
        <select id="transit-country" class="transit-input" data-role="country"></select>
      </div>
      <div class="transit-field">
        <label class="transit-label" for="transit-city">City</label>
        <select id="transit-city" class="transit-input" data-role="city"></select>
      </div>
      <div class="transit-field">
        <label class="transit-label" for="transit-provider">Provider</label>
        <select id="transit-provider" class="transit-input" data-role="provider"></select>
      </div>
    </div>
    <p class="transit-hint" data-role="provider-note"></p>
  </section>

  <section class="transit-section">
    <h3 class="transit-heading">Route</h3>
    <div class="transit-grid transit-grid--2">
      <transit-station-picker data-role="origin" label="From" placeholder="Search a station"></transit-station-picker>
      <div data-role="destination-wrap">
        <transit-station-picker data-role="destination" label="To" placeholder="Search a station"></transit-station-picker>
      </div>
    </div>
    <p class="transit-hint" data-role="route-note"></p>
  </section>

  <section class="transit-section">
    <h3 class="transit-heading">When</h3>
    <div class="transit-segmented" role="group" aria-label="Lead time">
      <button type="button" class="transit-segment" data-lead="0" aria-pressed="false">Now</button>
      <button type="button" class="transit-segment" data-lead="5" aria-pressed="false">+5 min</button>
      <button type="button" class="transit-segment" data-lead="15" aria-pressed="false">+15 min</button>
      <button type="button" class="transit-segment" data-lead="30" aria-pressed="false">+30 min</button>
      <button type="button" class="transit-segment" data-role="lead-other">Other…</button>
    </div>
    <div class="transit-field transit-field--narrow" data-role="lead-custom-wrap" hidden>
      <label class="transit-label" for="transit-lead">Lead time (minutes)</label>
      <input id="transit-lead" class="transit-input" type="number" min="0" max="720" data-role="lead-custom">
    </div>
    <p class="transit-hint" data-role="lead-note"></p>
  </section>

  <section class="transit-section">
    <h3 class="transit-heading">Board</h3>
    <div class="transit-grid transit-grid--4">
      <div class="transit-field">
        <label class="transit-label" for="transit-limit">Departures</label>
        <input id="transit-limit" class="transit-input" type="number" min="1" max="20" data-role="limit">
      </div>
      <div class="transit-field">
        <label class="transit-label" for="transit-transfers">Max changes</label>
        <input id="transit-transfers" class="transit-input" type="number" min="0" max="5" data-role="transfers">
      </div>
      <div class="transit-field">
        <label class="transit-label" for="transit-language">Alert language</label>
        <select id="transit-language" class="transit-input" data-role="language">
          <option value="en">English</option>
          <option value="it">Italiano</option>
        </select>
      </div>
      <div class="transit-field">
        <label class="transit-label" for="transit-title">Title</label>
        <input id="transit-title" class="transit-input" type="text" placeholder="Origin station" data-role="title">
      </div>
    </div>

    <div class="transit-checks">
      <label class="transit-check">
        <input type="checkbox" data-role="show_platform"> Show platform when published
      </label>
      <label class="transit-check">
        <input type="checkbox" data-role="hide_cancelled"> Hide cancelled trains
      </label>
    </div>
  </section>

  <section class="transit-section">
    <h3 class="transit-heading">Views this extension supports</h3>
    <div class="transit-views" data-role="views"></div>
    <p class="transit-hint">
      Not a setting. The extension declares what it can render and at what sizes; the
      layout page decides which view goes where.
    </p>
  </section>

  <section class="transit-section transit-section--output">
    <h3 class="transit-heading">Result</h3>
    <p class="transit-summary" data-role="summary"></p>
    <pre class="transit-preview" data-role="preview"></pre>
  </section>
`;

function readViews(raw) {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function bounds(view) {
  const width = span(view.width, "wide");
  const height = span(view.height, "tall");

  return [width, height].filter(Boolean).join(" · ") || "any size";
}

function span(limits, word) {
  if (!limits || (!limits.min && !limits.max)) return "";
  if (limits.min === limits.max) return `${limits.min}px ${word}`;

  return `${limits.min}–${limits.max}px ${word}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function readInitial(raw) {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed.values || parsed;
  } catch {
    return {};
  }
}

function toOption(item) {
  return {value: item.code, label: item.label};
}

function fill(select, options, selected) {
  select.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  select.value = selected;
  select.disabled = options.length < 2;
}

function clamp(value, low, high) {
  if (Number.isNaN(value)) return low;

  return Math.min(high, Math.max(low, value));
}

if (!customElements.get("transit-settings")) {
  customElements.define("transit-settings", TransitSettings);
}
