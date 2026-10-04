export { BOARDS, getBoard, isBoardId, listBoards, type Board, type BoardId, type FlashRegion } from "./boards";
export { DeviceError, toDeviceError, type DeviceErrorKind } from "./errors";
export {
  FirmwareError,
  loadFirmware,
  manifestEntry,
  sha256Hex,
  type Firmware,
  type FirmwareEntry,
  type FirmwareErrorKind,
  type FirmwareManifest,
  type LoadOptions,
} from "./firmware";
export {
  APP_DESC_ADDRESS,
  DITHER_PROJECT,
  isDitherFirmware,
  parseAppDescriptor,
  type FirmwareIdentity,
} from "./appDesc";
export {
  PanelConnection,
  openWithFallback,
  type FlashInput,
  type FlashProgress,
  type PanelInfo,
} from "./connection";
export { type FlashStage } from "./plan";
export { DITHER_PREFIX, openMonitor, type Monitor, type MonitorOptions } from "./monitor";
export type { DeviceSession, FlashFile, SessionOpener } from "./session";
