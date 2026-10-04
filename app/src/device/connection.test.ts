import { describe, expect, it } from "vitest";
import { readHeader } from "@/runtime/blob";
import { APP_DESC_ADDRESS } from "./appDesc";
import { FAST_BAUD, openWithFallback, PanelConnection, SAFE_BAUD, type FlashProgress } from "./connection";
import { DeviceError } from "./errors";
import { BOARD, DITHER_DESC, fakeSession, GZIP_PROJECT, makeAppDesc, makeBlob } from "./fixtures.test-util";
import type { DeviceSession } from "./session";

const PARTITION = BOARD.dataPartition.offset;

async function rejection(promise: Promise<unknown>): Promise<DeviceError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof DeviceError)) throw new Error(`expected a DeviceError, got ${String(err)}`);
  return err;
}

describe("PanelConnection.info", () => {
  it("reports Dither firmware and the blob header", async () => {
    const blob = makeBlob(GZIP_PROJECT);
    const session = fakeSession([DITHER_DESC, { address: PARTITION, data: blob }]);
    const info = await new PanelConnection(BOARD, session).info();
    expect(info).toMatchObject({
      board: "xiao-epaper-75",
      chip: "ESP32-C3",
      mac: "aa:bb:cc:dd:ee:ff",
      flashSize: "4MB",
      firmware: { project: "dither", version: "0.3.1" },
      isDither: true,
      blob: readHeader(blob),
    });
    expect(session.reads).toEqual([
      [APP_DESC_ADDRESS, 256],
      [PARTITION, 48],
    ]);
  });

  it("reports a blank panel as no firmware and no blob", async () => {
    const info = await new PanelConnection(BOARD, fakeSession()).info();
    expect(info).toMatchObject({ firmware: null, isDither: false, blob: null });
  });

  it("reports other firmware as not Dither", async () => {
    const other = { address: APP_DESC_ADDRESS, data: makeAppDesc("trmnl", "1.5.0") };
    const info = await new PanelConnection(BOARD, fakeSession([other])).info();
    expect(info).toMatchObject({ firmware: { project: "trmnl" }, isDither: false });
  });
});

describe("PanelConnection.readProject", () => {
  it("reads exactly the project section and reports progress", async () => {
    const blob = makeBlob(GZIP_PROJECT);
    const session = fakeSession([{ address: PARTITION, data: blob }]);
    const progress: number[] = [];
    const project = await new PanelConnection(BOARD, session).readProject((f) => progress.push(f));
    expect(project).toEqual(GZIP_PROJECT);
    const [offset] = readHeader(blob)!.project;
    expect(session.reads).toEqual([
      [PARTITION, 48],
      [PARTITION + offset, GZIP_PROJECT.length],
    ]);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
  });

  it("returns null without a blob, without a project, or when the project is not gzip", async () => {
    expect(await new PanelConnection(BOARD, fakeSession()).readProject()).toBeNull();
    const bare = fakeSession([{ address: PARTITION, data: makeBlob() }]);
    expect(await new PanelConnection(BOARD, bare).readProject()).toBeNull();
    expect(bare.reads).toHaveLength(1);
    const junk = fakeSession([{ address: PARTITION, data: makeBlob(new Uint8Array([1, 2, 3])) }]);
    expect(await new PanelConnection(BOARD, junk).readProject()).toBeNull();
  });
});

describe("PanelConnection.flash", () => {
  it("writes firmware at 0x0 and the blob at the partition, restarts, then releases the port", async () => {
    const session = fakeSession();
    const conn = new PanelConnection(BOARD, session);
    const firmware = new Uint8Array(4096).fill(7);
    const blob = makeBlob(GZIP_PROJECT);
    const progress: FlashProgress[] = [];
    await conn.flash({ firmware, blob }, (p) => progress.push(p));
    expect(session.writes).toEqual([
      [
        { data: firmware, address: 0 },
        { data: blob, address: PARTITION },
      ],
    ]);
    expect(progress.map((p) => p.stage)).toEqual(["firmware", "firmware", "settings", "settings", "restarting", "restarting"]);
    expect(progress.at(-1)).toEqual({ stage: "restarting", fraction: 1 });
    expect(session.resets).toBe(1);
    expect(session.closes).toBe(1);
    expect(conn.isOpen).toBe(false);
  });

  it("writes only the blob onto a panel already running Dither", async () => {
    const session = fakeSession([DITHER_DESC]);
    await new PanelConnection(BOARD, session).flash({ blob: makeBlob() }, () => {});
    expect(session.writes[0].map((f) => f.address)).toEqual([PARTITION]);
  });

  it("refuses a blob-only flash onto a panel without Dither, and stays connected", async () => {
    const session = fakeSession();
    const conn = new PanelConnection(BOARD, session);
    expect((await rejection(conn.flash({ blob: makeBlob() }, () => {}))).kind).toBe("not-dither");
    expect(session.writes).toHaveLength(0);
    expect(conn.isOpen).toBe(true);
  });

  it("refuses a blob larger than the partition before touching flash", async () => {
    const session = fakeSession([DITHER_DESC]);
    const conn = new PanelConnection(BOARD, session);
    const huge = makeBlob(new Uint8Array(BOARD.dataPartition.size));
    expect((await rejection(conn.flash({ blob: huge }, () => {}))).kind).toBe("too-big");
    expect(session.writes).toHaveLength(0);
    expect(conn.isOpen).toBe(true);
  });

  it("refuses firmware for a different chip", async () => {
    const conn = new PanelConnection(BOARD, fakeSession([], "ESP32-S3"));
    const err = await rejection(conn.flash({ firmware: new Uint8Array(10), blob: makeBlob() }, () => {}));
    expect(err.kind).toBe("unsupported");
  });
});

describe("PanelConnection errors", () => {
  it("maps a transport failure to an io error and releases the port", async () => {
    const session = fakeSession();
    session.failNextRead = new Error("Timeout");
    const conn = new PanelConnection(BOARD, session);
    expect((await rejection(conn.info())).kind).toBe("io");
    expect(session.closes).toBe(1);
    expect((await rejection(conn.info())).message).toMatch(/Connect/);
  });

  it("runs one operation at a time", async () => {
    const conn = new PanelConnection(BOARD, fakeSession());
    const first = conn.info();
    expect((await rejection(conn.info())).kind).toBe("busy");
    await first;
  });

  it("disconnects once", async () => {
    const session = fakeSession();
    const conn = new PanelConnection(BOARD, session);
    await conn.disconnect();
    await conn.disconnect();
    expect(session.closes).toBe(1);
  });

  it("is unsupported outside a browser with Web Serial", async () => {
    expect(PanelConnection.isSupported()).toBe(false);
    expect((await rejection(PanelConnection.connect(BOARD))).kind).toBe("unsupported");
  });
});

describe("openWithFallback", () => {
  const port = {} as SerialPort;
  const ok = fakeSession() as DeviceSession;

  it("uses 921600 when it works", async () => {
    const bauds: number[] = [];
    const session = await openWithFallback(async (_p, baud) => (bauds.push(baud), ok), port);
    expect(session).toBe(ok);
    expect(bauds).toEqual([FAST_BAUD]);
  });

  it("falls back to 115200 after an io failure", async () => {
    const bauds: number[] = [];
    const open = async (_p: SerialPort, baud: number) => {
      bauds.push(baud);
      if (baud === FAST_BAUD) throw new Error("Failed to connect with the device");
      return ok;
    };
    expect(await openWithFallback(open, port)).toBe(ok);
    expect(bauds).toEqual([FAST_BAUD, SAFE_BAUD]);
  });

  it("does not retry a busy port", async () => {
    const bauds: number[] = [];
    const open = async (_p: SerialPort, baud: number): Promise<DeviceSession> => {
      bauds.push(baud);
      throw new DOMException("Failed to open serial port.", "NetworkError");
    };
    const err = await rejection(openWithFallback(open, port));
    expect(err.kind).toBe("busy");
    expect(err.message).toMatch(/Arduino IDE/);
    expect(bauds).toEqual([FAST_BAUD]);
  });
});
