import { describe, expect, it } from "vitest";
import { BOARDS, getBoard, isBoardId, listBoards } from "./boards";

describe("boards", () => {
  it("describes the XIAO 7.5in panel per format.md §9", () => {
    const board = getBoard("xiao-epaper-75");
    expect(board).toMatchObject({
      short: 'XIAO 7.5"',
      width: 800,
      height: 480,
      chip: "ESP32-C3",
      flash: "4MB",
      dataPartition: { offset: 0x300000, size: 0x100000 },
      firmwareKey: "xiao-epaper-75",
    });
    expect(board?.usbFilters).toEqual([{ usbVendorId: 0x303a, usbProductId: 0x1001 }]);
    expect(board?.howToConnect).toBe("Plug the panel into this computer with a USB-C data cable.");
  });

  it("looks boards up by id and refuses unknown or inherited keys", () => {
    expect(isBoardId("xiao-epaper-75")).toBe(true);
    expect(isBoardId("nope")).toBe(false);
    expect(isBoardId("toString")).toBe(false);
    expect(getBoard("nope")).toBeNull();
  });

  it("keys every board by its own id", () => {
    for (const [key, board] of Object.entries(BOARDS)) expect(board.id).toBe(key);
    expect(listBoards()).toHaveLength(Object.keys(BOARDS).length);
  });

  it("keeps the data partition inside the flash", () => {
    for (const board of listBoards()) {
      const flashBytes = Number.parseInt(board.flash, 10) * 1024 * 1024;
      expect(board.dataPartition.offset + board.dataPartition.size).toBeLessThanOrEqual(flashBytes);
    }
  });
});
