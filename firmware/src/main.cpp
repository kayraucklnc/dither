// Dither firmware: interprets the blob in the `dither` partition on the panel.
// See docs/format.md. Everything runs from setup(); loop() is never reached.
#include <Arduino.h>
#include <esp_system.h>

#include "platform/device.h"
#include "platform/log.h"
#include "platform/persist.h"
#include "platform/power.h"
#include "platform/serial_commands.h"
#include "runtime/wake.h"

// The JSON reader, the condition evaluator and TLS all recurse or keep big
// frames; the 8 KB Arduino default is not enough headroom.
SET_LOOP_TASK_STACK_SIZE(16 * 1024);

namespace {

constexpr uint32_t kSerialWaitMs = 3000;

void startSerial() {
  Serial.begin(115200);
  Serial.setTxTimeoutMs(0);  // never block on a host that is not reading
  // Give a freshly attached host a moment to open the port so the first
  // lines are not lost.
  if (dither::usbHostConnected()) {
    const uint32_t start = millis();
    while (!Serial && millis() - start < kSerialWaitMs) delay(10);
  }
}

bool crashReset(esp_reset_reason_t reason) {
  return reason == ESP_RST_PANIC || reason == ESP_RST_INT_WDT || reason == ESP_RST_TASK_WDT ||
         reason == ESP_RST_WDT || reason == ESP_RST_BROWNOUT;
}

// Sleeps `seconds`, or waits them awake while a computer is attached.
void rest(uint32_t seconds, dither::Device& device, dither::SerialCommands& commands) {
  if (!dither::usbHostConnected()) dither::deepSleep(seconds);
  uint32_t remaining = 0;
  auto end = dither::waitAwake(seconds, [&] { return commands.poll(device.panelFrame()); }, remaining);
  if (end == dither::AwakeEnd::UsbGone && remaining > 0) {
    dither::dlog("USB host gone");
    dither::deepSleep(remaining);
  }
}

}  // namespace

void setup() {
  startSerial();
  dither::Device device;
  dither::SerialCommands commands;
  const bool crashed = crashReset(esp_reset_reason());
  const uint32_t crashes = dither::recordReset(crashed);
  const uint32_t backoff = crashed ? dither::crashBackoffSeconds(crashes) : 0;
  if (backoff > 0) {
    dither::dlog("%lu crash resets in a row: waiting %lu s before trying again", static_cast<unsigned long>(crashes),
                 static_cast<unsigned long>(backoff));
    rest(backoff, device, commands);
  }
  while (true) {
    uint32_t seconds = device.wake();
    dither::clearCrashes();
    dither::dlog("stack headroom %u bytes, heap %lu (lowest %lu)", static_cast<unsigned>(uxTaskGetStackHighWaterMark(nullptr)),
                 static_cast<unsigned long>(ESP.getFreeHeap()), static_cast<unsigned long>(ESP.getMinFreeHeap()));
    rest(seconds, device, commands);
  }
}

void loop() {}
