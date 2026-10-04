// Every failure that reaches the UI is a DeviceError with a sentence a person
// can act on. The original error is kept as `cause` for debugging.

export type DeviceErrorKind = "unsupported" | "cancelled" | "busy" | "not-dither" | "too-big" | "io";

export class DeviceError extends Error {
  readonly kind: DeviceErrorKind;

  constructor(kind: DeviceErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DeviceError";
    this.kind = kind;
  }
}

export const MESSAGES = {
  unsupported:
    "This browser can't talk to USB devices. Open Dither in Chrome or Edge on a computer (not a phone).",
  insecure: "USB access needs a secure page. Open Dither over https:// or from localhost.",
  cancelled: "No panel was chosen. Click Connect and pick the panel from the list.",
  busy: "The port is in use by another program — close Arduino IDE or any serial monitor and try again.",
  inProgress: "The panel is still busy with the last step. Wait for it to finish, then try again.",
  noAnswer:
    "The panel didn't answer. Unplug it, plug it back in and try again. If it still doesn't answer, hold the BOOT button while plugging it in.",
  lost: "The panel was unplugged or went to sleep. Plug it back in and connect again.",
  closed: "The panel is no longer connected. Click Connect to connect again.",
  generic: "Something went wrong talking to the panel. Unplug it, plug it back in and try again.",
} as const;

function errorName(err: unknown): string {
  return typeof err === "object" && err !== null && "name" in err ? String(err.name) : "";
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Map anything thrown by Web Serial or esptool-js to a DeviceError. */
export function toDeviceError(err: unknown): DeviceError {
  if (err instanceof DeviceError) return err;
  const name = errorName(err);
  const text = errorText(err).toLowerCase();
  const wrap = (kind: DeviceErrorKind, message: string) => new DeviceError(kind, message, { cause: err });

  if (name === "NotFoundError" || text.includes("no port selected")) return wrap("cancelled", MESSAGES.cancelled);
  if (name === "SecurityError") return wrap("unsupported", MESSAGES.insecure);
  if (text.includes("failed to open serial port") || text.includes("already open")) {
    return wrap("busy", MESSAGES.busy);
  }
  if (text.includes("device has been lost") || text.includes("device was disconnected")) {
    return wrap("io", MESSAGES.lost);
  }
  if (name === "TimeoutError" || text.includes("failed to connect") || text.includes("timeout")) {
    return wrap("io", MESSAGES.noAnswer);
  }
  return wrap("io", MESSAGES.generic);
}
