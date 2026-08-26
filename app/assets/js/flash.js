/* Browser-based firmware flashing over WebSerial.
 *
 * Replaces the vendor-hosted flash tool: the binaries are served by this
 * server, so DIY boards that no upstream tool lists (Waveshare driver board,
 * for one) can be flashed straight from the dashboard.
 *
 * Constraint worth knowing: navigator.serial only exists in a secure context.
 * https://localhost is fine, https://<host> is fine, plain http://<lan-ip> is
 * NOT -- the page detects this and says so rather than failing at click time.
 */

import { ESPLoader, Transport } from "esptool-js";

const state = { transport: null, loader: null, busy: false };

function el(id) {
  return document.getElementById(id);
}

function log(line) {
  const out = el("flash-log");
  if (!out) return;
  out.textContent += line.endsWith("\n") ? line : line + "\n";
  out.scrollTop = out.scrollHeight;
}

function setStatus(message, kind = "idle") {
  const node = el("flash-status");
  if (!node) return;
  node.textContent = message;
  node.dataset.kind = kind;
}

function setProgress(ratio) {
  const bar = el("flash-progress-bar");
  const wrap = el("flash-progress");
  if (!bar || !wrap) return;
  wrap.hidden = ratio === null;
  if (ratio !== null) bar.style.inlineSize = `${Math.round(ratio * 100)}%`;
}

/* esptool-js wants a binary string, not an ArrayBuffer. */
function toBinaryString(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return out;
}

const terminal = {
  clean() {
    const out = el("flash-log");
    if (out) out.textContent = "";
  },
  writeLine(data) {
    log(data);
  },
  write(data) {
    const out = el("flash-log");
    if (out) out.textContent += data;
  },
};

function supported() {
  return "serial" in navigator;
}

function explainUnsupported() {
  const secure = window.isSecureContext;
  if (!secure) {
    return (
      "This page is not a secure context, so the browser hides the serial API. " +
      "Open the dashboard at http://localhost:2300 on the machine running Dither, " +
      "or put it behind HTTPS."
    );
  }
  return "This browser has no WebSerial support. Use Chrome, Edge, or Opera on desktop.";
}

async function connect() {
  const device = await navigator.serial.requestPort();
  state.transport = new Transport(device, true);
  state.loader = new ESPLoader({
    transport: state.transport,
    baudrate: Number(el("flash-baud").value),
    romBaudrate: 115200,
    terminal,
  });
  const chip = await state.loader.main();
  return chip;
}

async function disconnect() {
  try {
    if (state.transport) await state.transport.disconnect();
  } catch {
    /* Already gone; nothing to release. */
  }
  state.transport = null;
  state.loader = null;
}

async function run() {
  if (state.busy) return;
  state.busy = true;
  const button = el("flash-start");
  button.disabled = true;
  setProgress(null);

  try {
    setStatus("Requesting serial port…", "working");
    const chip = await connect();
    setStatus(`Connected: ${chip}`, "working");
    log(`Detected chip: ${chip}`);

    const url = el("flash-image").value;
    log(`Fetching ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not fetch image (HTTP ${response.status}).`);
    const buffer = await response.arrayBuffer();
    log(`Image is ${buffer.byteLength.toLocaleString()} bytes.`);

    setStatus("Writing flash…", "working");
    setProgress(0);
    await state.loader.writeFlash({
      fileArray: [{ data: toBinaryString(buffer), address: 0 }],
      flashSize: "keep",
      flashMode: "keep",
      flashFreq: "keep",
      eraseAll: false,
      compress: true,
      reportProgress(_index, written, total) {
        setProgress(total ? written / total : 0);
      },
    });

    setProgress(1);
    setStatus("Done — power-cycle the board.", "ok");
    log("Flash complete.");
    await state.loader.after();
  } catch (error) {
    setStatus(error.message || String(error), "error");
    log(`ERROR: ${error.message || error}`);
  } finally {
    await disconnect();
    button.disabled = false;
    state.busy = false;
  }
}

function mount() {
  const button = el("flash-start");
  if (!button) return;

  if (!supported()) {
    button.disabled = true;
    setStatus(explainUnsupported(), "error");
    const warning = el("flash-unsupported");
    if (warning) warning.hidden = false;
    return;
  }

  button.addEventListener("click", run);
}

document.addEventListener("DOMContentLoaded", mount);
