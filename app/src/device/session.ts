// What PanelConnection needs from a connected chip. The real one is
// espSession.ts (esptool-js); tests use a fake.

export type ReadProgress = (done: number, total: number) => void;
export type WriteProgress = (fileIndex: number, written: number, total: number) => void;

export interface FlashFile {
  readonly data: Uint8Array;
  readonly address: number;
}

export interface DeviceSession {
  /** The Web Serial port, kept so a monitor can reopen it after flashing. */
  readonly port: SerialPort | null;
  /** Chip family, e.g. "ESP32-C3". */
  readonly chip: string;
  readonly mac: string;
  /** e.g. "4MB", or null when the flash chip could not be identified. */
  readonly flashSize: string | null;
  /** The last lines esptool-js wrote, for bug reports. */
  readonly log: readonly string[];
  readFlash(address: number, size: number, onProgress?: ReadProgress): Promise<Uint8Array>;
  /** Write each file at its address (compressed). Erases only what it writes. */
  writeFlash(files: readonly FlashFile[], onProgress: WriteProgress): Promise<void>;
  /** Reboot into the installed firmware. */
  hardReset(): Promise<void>;
  /** Release the serial port. Never throws. */
  close(): Promise<void>;
}

export type SessionOpener = (port: SerialPort, baudrate: number) => Promise<DeviceSession>;
