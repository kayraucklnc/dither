// A connected panel: what is on it, read its project back, write a new one.

import { HEADER_SIZE, type Header } from "@/runtime/blob";
import { APP_DESC_ADDRESS, APP_DESC_SIZE, isDitherFirmware, parseAppDescriptor, type FirmwareIdentity } from "./appDesc";
import type { Board } from "./boards";
import { DeviceError, MESSAGES, toDeviceError } from "./errors";
import { checkBlob, checkFirmware, isGzip, parseBlobHeader, planFlash, projectRange, type FlashStage } from "./plan";
import type { DeviceSession, SessionOpener } from "./session";

export const FAST_BAUD = 921600;
export const SAFE_BAUD = 115200;

export interface PanelInfo {
  readonly board: string;
  readonly chip: string;
  readonly mac: string;
  readonly flashSize: string | null;
  readonly firmware: FirmwareIdentity | null;
  /** True when the installed firmware is Dither. */
  readonly isDither: boolean;
  readonly blob: Header | null;
}

export interface FlashProgress {
  readonly stage: FlashStage;
  readonly fraction: number;
}

export interface FlashInput {
  readonly firmware?: Uint8Array;
  readonly blob: Uint8Array;
}

/** Open at 921600, and once more at 115200 if that fails for any reason but a busy port. */
export async function openWithFallback(open: SessionOpener, port: SerialPort): Promise<DeviceSession> {
  try {
    return await open(port, FAST_BAUD);
  } catch (first) {
    const mapped = toDeviceError(first);
    if (mapped.kind !== "io") throw mapped;
  }
  try {
    return await open(port, SAFE_BAUD);
  } catch (second) {
    throw toDeviceError(second);
  }
}

export class PanelConnection {
  readonly board: Board;
  private readonly session: DeviceSession;
  private working = false;
  private closed = false;

  constructor(board: Board, session: DeviceSession) {
    this.board = board;
    this.session = session;
  }

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator && globalThis.isSecureContext === true;
  }

  static async connect(board: Board): Promise<PanelConnection> {
    if (typeof navigator === "undefined" || !("serial" in navigator)) {
      throw new DeviceError("unsupported", MESSAGES.unsupported);
    }
    if (!globalThis.isSecureContext) throw new DeviceError("unsupported", MESSAGES.insecure);
    let port: SerialPort;
    try {
      port = await navigator.serial.requestPort({ filters: [...board.usbFilters] });
    } catch (err) {
      throw toDeviceError(err);
    }
    const { openEspSession } = await import("./espSession");
    return new PanelConnection(board, await openWithFallback(openEspSession, port));
  }

  /** The serial port, for openMonitor after flashing. */
  get port(): SerialPort | null {
    return this.session.port;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  /** esptool-js's recent output, for bug reports. */
  get log(): readonly string[] {
    return this.session.log;
  }

  async info(): Promise<PanelInfo> {
    return this.run(async () => {
      const firmware = await this.readFirmwareIdentity();
      const blob = await this.readBlobHeader();
      const { chip, mac, flashSize } = this.session;
      return { board: this.board.id, chip, mac, flashSize, firmware, isDither: isDitherFirmware(firmware), blob };
    });
  }

  /** The gzip'd project stored on the panel, or null when there is none. Reads only that section. */
  async readProject(onProgress?: (fraction: number) => void): Promise<Uint8Array | null> {
    return this.run(async () => {
      const header = await this.readBlobHeader();
      const range = header ? projectRange(header) : null;
      if (!range) return null;
      onProgress?.(0);
      const address = this.board.dataPartition.offset + range.offset;
      const bytes = await this.session.readFlash(address, range.length, (done, total) =>
        onProgress?.(Math.min(1, done / total)),
      );
      onProgress?.(1);
      return isGzip(bytes) ? bytes : null;
    });
  }

  /**
   * Write the blob (and firmware at 0x0 when given), then restart the panel.
   * The panel reboots, so this ends the connection and releases the port.
   */
  async flash(input: FlashInput, onProgress: (p: FlashProgress) => void): Promise<void> {
    await this.run(async () => {
      checkBlob(input.blob, this.board);
      if (input.firmware) {
        checkFirmware(input.firmware, this.board, this.session.chip);
      } else if (!isDitherFirmware(await this.readFirmwareIdentity())) {
        throw new DeviceError("not-dither", "This panel doesn't have Dither on it yet. Install Dither first.");
      }
      const plan = planFlash(input, this.board);
      await this.session.writeFlash(plan.files, (index, written, total) =>
        onProgress({ stage: plan.stages[index] ?? "settings", fraction: total > 0 ? written / total : 1 }),
      );
      onProgress({ stage: "restarting", fraction: 0 });
      await this.session.hardReset();
      onProgress({ stage: "restarting", fraction: 1 });
    });
    await this.disconnect();
  }

  /** Release the port. Safe to call more than once. */
  async disconnect(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.session.close();
  }

  private async readFirmwareIdentity(): Promise<FirmwareIdentity | null> {
    return parseAppDescriptor(await this.session.readFlash(APP_DESC_ADDRESS, APP_DESC_SIZE));
  }

  private async readBlobHeader(): Promise<Header | null> {
    const { offset } = this.board.dataPartition;
    return parseBlobHeader(await this.session.readFlash(offset, HEADER_SIZE), this.board.dataPartition);
  }

  /** One operation at a time; a transport failure releases the port. */
  private async run<T>(op: () => Promise<T>): Promise<T> {
    if (this.closed) throw new DeviceError("io", MESSAGES.closed);
    if (this.working) throw new DeviceError("busy", MESSAGES.inProgress);
    this.working = true;
    try {
      return await op();
    } catch (err) {
      if (!(err instanceof DeviceError)) await this.disconnect();
      throw toDeviceError(err);
    } finally {
      this.working = false;
    }
  }
}
