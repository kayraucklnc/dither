// Boards Dither can drive (docs/format.md §9). Adding a board is adding one
// entry to `boards` below; BoardId and BOARDS follow from it.

export interface FlashRegion {
  readonly offset: number;
  readonly size: number;
}

export interface Board {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly width: number;
  readonly height: number;
  readonly chip: string;
  readonly flash: string;
  /** Where the blob lives: the `dither` data partition. */
  readonly dataPartition: FlashRegion;
  /** Key into firmware/manifest.json `boards`. */
  readonly firmwareKey: string;
  /** Passed to navigator.serial.requestPort({ filters }). */
  readonly usbFilters: readonly SerialPortFilter[];
  /** What the board looks like, so people can tell they have the right one. */
  readonly photoHint: string;
  readonly howToConnect: string;
  /** What to try when the panel isn't found. */
  readonly troubleshoot: string;
}

const ESPRESSIF_VID = 0x303a;
const USB_SERIAL_JTAG_PID = 0x1001;

const boards = {
  "xiao-epaper-75": {
    id: "xiao-epaper-75",
    name: 'Seeed XIAO 7.5" ePaper Panel',
    short: 'XIAO 7.5"',
    width: 800,
    height: 480,
    chip: "ESP32-C3",
    flash: "4MB",
    dataPartition: { offset: 0x300000, size: 0x100000 },
    firmwareKey: "xiao-epaper-75",
    usbFilters: [{ usbVendorId: ESPRESSIF_VID, usbProductId: USB_SERIAL_JTAG_PID }],
    photoHint: "A 7.5-inch black-and-white e-paper screen with a small XIAO board and a USB-C port on the back.",
    howToConnect: "Plug the panel into this computer with a USB-C data cable.",
    troubleshoot:
      "If it doesn't show up, switch the panel on, try another cable (some only charge), or hold BOOT while plugging it in.",
  },
} satisfies Record<string, Board>;

export type BoardId = keyof typeof boards;

export const BOARDS: Readonly<Record<BoardId, Board>> = boards;

export function isBoardId(id: string): id is BoardId {
  return Object.hasOwn(BOARDS, id);
}

/** The board with this id, or null for an unknown id. */
export function getBoard(id: string): Board | null {
  return isBoardId(id) ? BOARDS[id] : null;
}

export function listBoards(): readonly Board[] {
  return Object.values(BOARDS);
}
