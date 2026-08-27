/**
 * What the panel tells us about itself on every request.
 *
 * These names are fixed by the firmware, which is not ours to change - see
 * docs/device-api-contract.md. Everything is optional because a device mid-boot
 * or mid-flash may send a subset, and a missing header must never be an error.
 */
export interface DeviceReport {
  accessToken?: string;
  macAddress?: string;
  model?: string;
  firmwareVersion?: string;
  width?: number;
  height?: number;
  batteryVoltage?: number;
  percentCharged?: number;
  usbConnected: boolean;
  rssi?: number;
  wifiBand?: string;
  refreshRate?: number;
  imageCached: boolean;
  updateSource?: string;
}

const number = (value: string | null) => {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const flag = (value: string | null) => value === "true" || value === "1";

export function readDevice(headers: Headers): DeviceReport {
  return {
    accessToken: headers.get("access-token") ?? undefined,
    macAddress: headers.get("id") ?? undefined,
    model: headers.get("model") ?? undefined,
    firmwareVersion: headers.get("fw-version") ?? undefined,
    width: number(headers.get("width")),
    height: number(headers.get("height")),
    batteryVoltage: number(headers.get("battery-voltage")),
    percentCharged: number(headers.get("percent-charged")),
    usbConnected: flag(headers.get("usb-connected")),
    rssi: number(headers.get("rssi")),
    wifiBand: headers.get("wifi-band") ?? undefined,
    refreshRate: number(headers.get("refresh-rate")),
    imageCached: flag(headers.get("image-cached")),
    updateSource: headers.get("update-source") ?? undefined,
  };
}
