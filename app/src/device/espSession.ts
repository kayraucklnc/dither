// DeviceSession over esptool-js 0.7. Loaded lazily by PanelConnection.connect,
// so esptool-js (and its flasher stubs) stay out of the main bundle.

import { CustomReset, ESPLoader, Transport, type IEspLoaderTerminal } from "esptool-js";
import type { DeviceSession, FlashFile, ReadProgress, WriteProgress } from "./session";

const ROM_BAUD = 115200;
const LOG_LINES = 200;

/**
 * esptool.py's hard reset for USB-Serial/JTAG: hold reset with IO9 high, then
 * release. (esptool-js 0.7's HardReset only releases RTS, which never asserts
 * reset on a C3 left in the "idle" state by its connect sequence.)
 */
const HARD_RESET_SEQUENCE = "D0|R1|W100|R0";

class EspSession implements DeviceSession {
  readonly port: SerialPort;
  readonly chip: string;
  readonly mac: string;
  readonly flashSize: string | null;
  private readonly loader: ESPLoader;
  private readonly logLines: () => readonly string[];

  constructor(loader: ESPLoader, mac: string, flashSize: string | null, logLines: () => readonly string[]) {
    this.loader = loader;
    this.port = loader.transport.device;
    this.chip = loader.chip.CHIP_NAME;
    this.mac = mac;
    this.flashSize = flashSize;
    this.logLines = logLines;
  }

  get log(): readonly string[] {
    return this.logLines();
  }

  async readFlash(address: number, size: number, onProgress?: ReadProgress): Promise<Uint8Array> {
    const bytes = await this.loader.readFlash(address, size, (_packet, done, total) => onProgress?.(done, total));
    return bytes.subarray(0, size);
  }

  async writeFlash(files: readonly FlashFile[], onProgress: WriteProgress): Promise<void> {
    await this.loader.writeFlash({
      fileArray: files.map((f) => ({ data: f.data, address: f.address })),
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: onProgress,
    });
  }

  async hardReset(): Promise<void> {
    await new CustomReset(this.loader.transport, HARD_RESET_SEQUENCE).reset();
  }

  async close(): Promise<void> {
    await closeTransport(this.loader.transport);
  }
}

/** Release the port; a port that is already closed or gone is not an error here. */
async function closeTransport(transport: Transport): Promise<void> {
  try {
    await transport.disconnect();
  } catch {
    // Teardown: the port may never have opened, or the device may have gone.
  }
}

function createLog(): { terminal: IEspLoaderTerminal; lines: () => readonly string[] } {
  let lines: readonly string[] = [];
  const push = (line: string) => {
    lines = [...lines.slice(-(LOG_LINES - 1)), line];
  };
  return { terminal: { clean: () => (lines = []), write: push, writeLine: push }, lines: () => lines };
}

/** Open the port, sync with the ROM, load the stub and identify the chip. */
export async function openEspSession(port: SerialPort, baudrate: number): Promise<DeviceSession> {
  const log = createLog();
  const transport = new Transport(port, false);
  const loader = new ESPLoader({ transport, baudrate, romBaudrate: ROM_BAUD, terminal: log.terminal });
  try {
    await loader.main("default_reset");
    const mac = await loader.chip.readMac(loader);
    const flashSize = (await loader.detectFlashSize()) ?? null;
    return new EspSession(loader, mac, flashSize, log.lines);
  } catch (err) {
    await closeTransport(transport);
    throw err;
  }
}
