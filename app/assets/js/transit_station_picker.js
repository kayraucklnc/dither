// Station combobox used by <transit-settings>.
//
// Split out because it is the only genuinely interactive part: a debounced
// typeahead over a provider's station registry, with keyboard selection and
// the ARIA wiring a combobox needs.

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

export class TransitStationPicker extends HTMLElement {
  static observedAttributes = ["label", "placeholder", "value", "provider", "endpoint"];

  #input = null;
  #list = null;
  #status = null;
  #options = [];
  #active = -1;
  #timer = null;
  #controller = null;
  #id = `transit-station-${Math.random().toString(36).slice(2, 8)}`;

  connectedCallback() {
    if (this.#input) return;

    this.classList.add("transit-field");
    this.innerHTML = `
      <label class="transit-label" for="${this.#id}">${this.getAttribute("label") || "Station"}</label>
      <div class="transit-combobox">
        <input id="${this.#id}"
               class="transit-input"
               type="text"
               role="combobox"
               autocomplete="off"
               spellcheck="false"
               aria-expanded="false"
               aria-autocomplete="list"
               aria-controls="${this.#id}-list"
               placeholder="${this.getAttribute("placeholder") || "Start typing a station"}">
        <ul id="${this.#id}-list" class="transit-options" role="listbox" hidden></ul>
      </div>
      <p class="transit-hint" id="${this.#id}-status" role="status"></p>
    `;

    this.#input = this.querySelector("input");
    this.#list = this.querySelector("ul");
    this.#status = this.querySelector("p");
    this.#input.value = this.getAttribute("value") || "";

    this.#input.addEventListener("input", () => this.#onInput());
    this.#input.addEventListener("keydown", (event) => this.#onKeydown(event));
    this.#input.addEventListener("focus", () => this.#onInput());
    this.#input.addEventListener("blur", () => window.setTimeout(() => this.#close(), 150));
  }

  attributeChangedCallback(name, previous, current) {
    if (name === "value" && this.#input && current !== this.#input.value) this.#input.value = current || "";
  }

  get value() {
    return this.#input ? this.#input.value.trim() : this.getAttribute("value") || "";
  }

  set value(next) {
    this.setAttribute("value", next || "");
    if (this.#input) this.#input.value = next || "";
  }

  #onInput() {
    window.clearTimeout(this.#timer);
    const query = this.#input.value.trim();

    if (query.length < MIN_QUERY) {
      this.#close();
      this.#say(`Type at least ${MIN_QUERY} characters.`);
      return;
    }

    this.#timer = window.setTimeout(() => this.#search(query), DEBOUNCE_MS);
  }

  async #search(query) {
    const endpoint = this.getAttribute("endpoint") || "/transit";
    const provider = this.getAttribute("provider") || "trenord";

    this.#controller?.abort();
    this.#controller = new AbortController();
    this.#say("Searching…");

    try {
      const url = `${endpoint}/stations?provider=${encodeURIComponent(provider)}&query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {headers: {Accept: "application/json"}, signal: this.#controller.signal});
      if (!response.ok) throw new Error(`Station lookup failed (${response.status}).`);

      const payload = await response.json();
      this.#render(payload.data || []);
    } catch (error) {
      if (error.name === "AbortError") return;
      this.#close();
      this.#say(error.message);
    }
  }

  #render(options) {
    this.#options = options;
    this.#active = -1;

    if (options.length === 0) {
      this.#close();
      this.#say("No matching stations.");
      return;
    }

    this.#list.innerHTML = options
      .map((station, index) => {
        const place = [station.city, station.region].filter(Boolean).join(", ");
        return `
          <li id="${this.#id}-option-${index}" class="transit-option" role="option" aria-selected="false" data-index="${index}">
            <span class="transit-option-name">${escape(station.name)}</span>
            <span class="transit-option-meta">${escape(place)}${station.code ? ` · ${escape(station.code)}` : ""}</span>
          </li>`;
      })
      .join("");

    this.#list.hidden = false;
    this.#input.setAttribute("aria-expanded", "true");
    this.#say(`${options.length} station${options.length === 1 ? "" : "s"}.`);

    this.#list.querySelectorAll("li").forEach((node) => {
      node.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.#choose(Number(node.dataset.index));
      });
    });
  }

  #onKeydown(event) {
    if (this.#list.hidden) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.#highlight(this.#active + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.#highlight(this.#active - 1);
        break;
      case "Enter":
        if (this.#active >= 0) {
          event.preventDefault();
          this.#choose(this.#active);
        }
        break;
      case "Escape":
        this.#close();
        break;
      default:
        break;
    }
  }

  #highlight(index) {
    const total = this.#options.length;
    if (total === 0) return;

    this.#active = (index + total) % total;

    this.#list.querySelectorAll("li").forEach((node, position) => {
      const active = position === this.#active;
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-selected", String(active));
      if (active) node.scrollIntoView({block: "nearest"});
    });

    this.#input.setAttribute("aria-activedescendant", `${this.#id}-option-${this.#active}`);
  }

  #choose(index) {
    const station = this.#options[index];
    if (!station) return;

    this.#input.value = station.name;
    this.#close();
    this.#say(station.code ? `Selected ${station.name} (${station.code}).` : `Selected ${station.name}.`);
    this.dispatchEvent(new CustomEvent("change", {bubbles: true, detail: station}));
  }

  #close() {
    this.#list.hidden = true;
    this.#list.innerHTML = "";
    this.#options = [];
    this.#active = -1;
    this.#input.setAttribute("aria-expanded", "false");
    this.#input.removeAttribute("aria-activedescendant");
  }

  #say(message) {
    this.#status.textContent = message;
  }
}

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

if (!customElements.get("transit-station-picker")) {
  customElements.define("transit-station-picker", TransitStationPicker);
}
