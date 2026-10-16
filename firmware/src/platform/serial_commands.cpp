#include "serial_commands.h"

#include <Arduino.h>

#include <algorithm>
#include <cstdlib>

#include "board.h"
#include "log.h"
#include "persist.h"
#include "power.h"

namespace dither {
namespace {

constexpr size_t kMaxLine = 64;
constexpr uint32_t kScreenshotTimeoutMs = 10000;
constexpr uint32_t kMaxTestSleep = 600;

}  // namespace

bool SerialCommands::poll(const Framebuffer& lastFrame) {
  bool wake = false;
  while (Serial.available() > 0) {
    int c = Serial.read();
    if (c < 0) break;
    if (c == '\n' || c == '\r') {
      if (!line_.empty()) run(line_, lastFrame, wake);
      line_.clear();
    } else if (line_.size() < kMaxLine) {
      line_ += static_cast<char>(c);
    }
  }
  return wake;
}

void SerialCommands::run(const std::string& line, const Framebuffer& lastFrame, bool& wake) {
  if (line == "CMD:SCREENSHOT") {
    const size_t stride = static_cast<size_t>(lastFrame.stride());
    const size_t total = stride * static_cast<size_t>(lastFrame.height());
    Serial.printf("SCREENSHOT_START:%u\n", static_cast<unsigned>(total));
    // The TX timeout is 0 so logging never blocks; feed the frame only as
    // fast as the port drains, or most of it would be dropped.
    size_t sent = 0;
    const uint32_t start = millis();
    while (sent < total && millis() - start < kScreenshotTimeoutMs) {
      int room = Serial.availableForWrite();
      if (room <= 0) {
        delay(1);
        continue;
      }
      const size_t offset = sent % stride;  // within the row being sent
      const size_t n = std::min(stride - offset, static_cast<size_t>(room));
      sent += Serial.write(lastFrame.row(static_cast<int>(sent / stride)) + offset, n);
    }
    Serial.flush();
    dlog("screenshot: sent %u of %u bytes (%dx%d)", static_cast<unsigned>(sent), static_cast<unsigned>(total),
         lastFrame.width(), lastFrame.height());
  } else if (line == "CMD:WAKE") {
    dlog("wake requested over serial");
    wake = true;
  } else if (line.rfind("CMD:SLEEP:", 0) == 0) {
    // Lets a deep-sleep cycle be tested without unplugging the board.
    long seconds = std::strtol(line.c_str() + 10, nullptr, 10);
    if (seconds < 1 || seconds > static_cast<long>(kMaxTestSleep)) {
      dlog("CMD:SLEEP:<1-%lu>", static_cast<unsigned long>(kMaxTestSleep));
      return;
    }
    deepSleep(static_cast<uint32_t>(seconds));
  } else if (line == "CMD:HISTORY") {
    // Between begin and end, so a reader knows it has the whole ring.
    dlog("history: begin");
    size_t count = 0;
    forEachHistory([&](const std::string& record) {
      dlog("history: %s", record.c_str());
      ++count;
      Serial.flush();  // the TX timeout is 0: let each line drain before the next
    });
    dlog("history: end %u", static_cast<unsigned>(count));
  } else if (line == "CMD:INFO") {
    dlog("version %s, board %s", DITHER_VERSION, board::kId);
  } else {
    dlog("unknown command '%s'", line.c_str());
  }
}

}  // namespace dither
