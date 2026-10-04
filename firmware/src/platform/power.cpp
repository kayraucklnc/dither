#include "power.h"

#include <Arduino.h>
#include <esp_sleep.h>
#include <esp_timer.h>

#include "log.h"

namespace dither {
namespace {

// usb_serial_jtag_is_connected() is driven by a timer that needs a moment
// after boot before it reports a host; give it a few consecutive reads.
constexpr int kUsbProbes = 3;
constexpr uint32_t kUsbProbeGapMs = 20;
constexpr uint32_t kUsbGoneGraceMs = 3000;

// millis() wraps after 49 days; a board on USB can stay awake that long.
uint64_t millis64() {
  return static_cast<uint64_t>(esp_timer_get_time() / 1000);
}

}  // namespace

bool usbHostConnected() {
  for (int i = 0; i < kUsbProbes; ++i) {
    if (HWCDC::isPlugged()) return true;
    delay(kUsbProbeGapMs);
  }
  return false;
}

void deepSleep(uint32_t seconds) {
  dlog("sleeping %lu s (deep sleep)", static_cast<unsigned long>(seconds));
  Serial.flush();
  esp_sleep_enable_timer_wakeup(static_cast<uint64_t>(seconds) * 1000000ULL);
  esp_deep_sleep_start();
}

AwakeEnd waitAwake(uint32_t seconds, const std::function<bool()>& onIdle, uint32_t& remaining) {
  dlog("USB host connected: staying awake %lu s", static_cast<unsigned long>(seconds));
  const uint64_t start = millis64();
  const uint64_t total = static_cast<uint64_t>(seconds) * 1000ULL;
  uint64_t lastSeen = start;
  AwakeEnd end = AwakeEnd::Elapsed;
  while (millis64() - start < total) {
    if (onIdle && onIdle()) {
      end = AwakeEnd::WakeRequested;
      break;
    }
    if (HWCDC::isPlugged()) {
      lastSeen = millis64();
    } else if (millis64() - lastSeen > kUsbGoneGraceMs) {
      end = AwakeEnd::UsbGone;
      break;
    }
    delay(20);
  }
  const uint64_t elapsed = millis64() - start;
  remaining = elapsed < total ? static_cast<uint32_t>((total - elapsed) / 1000ULL) : 0;
  return end;
}

}  // namespace dither
