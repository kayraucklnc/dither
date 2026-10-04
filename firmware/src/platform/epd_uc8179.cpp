#include "epd_uc8179.h"

#include <Arduino.h>
#include <SPI.h>

#include "board.h"
#include "log.h"

namespace dither {
namespace {

// Register values and LUTs from Seeed_GFX (MIT), TFT_Drivers/UC8179_Defines.h
// EPD_INIT_FAST / EPD_SET_WINDOW / EPD_SLEEP - the sequence the known-good
// sketch drives this panel with.
const uint8_t kLutVcom[42] = {0x26, 0x0F, 0x18, 0x18, 0x14, 0x01, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x01};
const uint8_t kLutToWhite[42] = {0x55, 0x06, 0x0C, 0x17, 0x02, 0x01, 0x2A, 0x02, 0x1C, 0x02, 0x0D, 0x01, 0x80, 0x02};
const uint8_t kLutToBlack[42] = {0xAA, 0x06, 0x0C, 0x17, 0x02, 0x01, 0x15, 0x02, 0x1C, 0x02, 0x0D, 0x01, 0x40, 0x02};

constexpr uint32_t kPowerTimeoutMs = 5000;
constexpr uint32_t kRefreshTimeoutMs = 30000;

const SPISettings kSpi(board::kSpiHz, MSBFIRST, SPI_MODE0);

}  // namespace

void Uc8179::begin() {
  if (begun_) return;
  pinMode(board::kPinCs, OUTPUT);
  pinMode(board::kPinDc, OUTPUT);
  pinMode(board::kPinRst, OUTPUT);
  pinMode(board::kPinBusy, INPUT);
  digitalWrite(board::kPinCs, HIGH);
  digitalWrite(board::kPinRst, HIGH);
  SPI.begin(board::kPinSck, -1, board::kPinMosi, -1);
  begun_ = true;
}

void Uc8179::reset() {
  digitalWrite(board::kPinRst, LOW);
  delay(10);
  digitalWrite(board::kPinRst, HIGH);
  delay(10);
}

bool Uc8179::waitIdle(uint32_t timeoutMs) {
  const uint32_t start = millis();
  while (digitalRead(board::kPinBusy) == LOW) {
    if (millis() - start > timeoutMs) {
      dlog("panel: busy for more than %u ms", static_cast<unsigned>(timeoutMs));
      return false;
    }
    delay(5);
  }
  return true;
}

void Uc8179::command(uint8_t c) {
  SPI.beginTransaction(kSpi);
  digitalWrite(board::kPinDc, LOW);
  digitalWrite(board::kPinCs, LOW);
  SPI.transfer(c);
  digitalWrite(board::kPinCs, HIGH);
  digitalWrite(board::kPinDc, HIGH);
  SPI.endTransaction();
}

void Uc8179::data(const uint8_t* bytes, size_t n) {
  SPI.beginTransaction(kSpi);
  digitalWrite(board::kPinDc, HIGH);
  digitalWrite(board::kPinCs, LOW);
  SPI.writeBytes(bytes, n);
  digitalWrite(board::kPinCs, HIGH);
  SPI.endTransaction();
}

void Uc8179::data(uint8_t d) {
  data(&d, 1);
}

bool Uc8179::initFast() {
  const uint8_t power[] = {0x07, 0x17, 0x3F, 0x3F, 0x09};
  command(0x01);  // power setting
  data(power, sizeof power);
  command(0x30);  // PLL
  data(0x06);
  command(0x82);  // VCOM DC
  data(0x16);
  const uint8_t booster[] = {0x17, 0x17, 0x28, 0x17};
  command(0x06);  // booster soft start
  data(booster, sizeof booster);
  command(0x04);  // power on
  delay(100);
  if (!waitIdle(kPowerTimeoutMs)) return false;
  command(0x00);  // panel setting: KW mode, LUT from registers
  data(0x3F);
  const uint8_t resolution[] = {board::kPanelWidth >> 8, board::kPanelWidth & 0xFF, board::kPanelHeight >> 8,
                                board::kPanelHeight & 0xFF};
  command(0x61);
  data(resolution, sizeof resolution);
  const uint8_t interval[] = {0x10, 0x07};
  command(0x50);
  data(interval, sizeof interval);
  command(0x20);
  data(kLutVcom, sizeof kLutVcom);
  command(0x21);  // W -> W
  data(kLutToWhite, sizeof kLutToWhite);
  command(0x22);  // K -> W
  data(kLutToWhite, sizeof kLutToWhite);
  command(0x23);  // W -> K
  data(kLutToBlack, sizeof kLutToBlack);
  command(0x24);  // K -> K
  data(kLutToBlack, sizeof kLutToBlack);
  return true;
}

void Uc8179::setFullWindow() {
  // With this VCOM/data-interval setting a set bit on the wire is white.
  const uint8_t interval[] = {0xA9, 0x07};
  command(0x50);
  data(interval, sizeof interval);
  command(0x91);  // partial in
  constexpr int kX2 = board::kPanelWidth - 1, kY2 = board::kPanelHeight - 1;
  const uint8_t window[] = {0, 0, kX2 >> 8, kX2 & 0xFF, 0, 0, kY2 >> 8, kY2 & 0xFF, 0x01};
  command(0x90);
  data(window, sizeof window);
}

void Uc8179::writePlane(uint8_t cmd, const Framebuffer& frame) {
  command(cmd);
  const int stride = frame.stride();
  uint8_t row[board::kPanelWidth / 8];
  for (int y = 0; y < frame.height(); ++y) {
    const uint8_t* src = frame.bytes().data() + static_cast<size_t>(y) * static_cast<size_t>(stride);
    for (int i = 0; i < stride; ++i) row[i] = static_cast<uint8_t>(~src[i]);  // ours: 1 = black
    data(row, static_cast<size_t>(stride));
  }
}

bool Uc8179::deepSleep() {
  command(0x50);
  data(0xF7);
  command(0x02);  // power off
  bool ok = waitIdle(kPowerTimeoutMs);
  command(0x07);  // deep sleep
  data(0xA5);
  return ok;
}

bool Uc8179::show(const Framebuffer& frame) {
  if (frame.width() != board::kPanelWidth || frame.height() != board::kPanelHeight) {
    dlog("panel: frame is %dx%d, expected %dx%d", frame.width(), frame.height(), board::kPanelWidth,
         board::kPanelHeight);
    return false;
  }
  begin();
  const uint32_t start = millis();
  reset();
  bool refreshed = waitIdle(kPowerTimeoutMs) && initFast();
  if (refreshed) {
    setFullWindow();
    writePlane(0x10, frame);  // old data
    writePlane(0x13, frame);  // new data
    command(0x12);            // refresh
    delay(1);
    refreshed = waitIdle(kRefreshTimeoutMs);
  }
  // Power down whatever happened: a panel left powered on degrades.
  bool slept = deepSleep();
  dlog("panel: %s in %lu ms", refreshed ? "refreshed" : "FAILED", static_cast<unsigned long>(millis() - start));
  return refreshed && slept;
}

}  // namespace dither
