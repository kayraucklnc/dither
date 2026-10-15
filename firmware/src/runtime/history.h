// The panel's own record of its wakes: one short line each, kept in flash in a
// ring, so what it did while nobody was watching (and whether it lost power)
// can be read the next time a computer is attached (CMD:HISTORY).
#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace dither {

// 32 lines: 16 hours of wakes every 30 minutes, in 5-8 KB of NVS.
constexpr size_t kHistorySlots = 32;
constexpr size_t kHistoryLineMax = 200;

struct WakeRecord {
  std::optional<int64_t> at;  // when the wake ended; unknown without a clock
  std::string version;
  int reset = 0;              // esp_reset_reason_t: 1 power-on, 8 deep sleep, 9 brownout…
  uint32_t wake = 0;          // since power-on
  const char* state = "ran";  // as in the summary line
  const char* frame = "none";
  bool online = false;
  bool clockSet = false;
  bool usb = false;
  bool network = false;       // Wi-Fi was used this wake
  std::optional<int> rssi;
  int ok = 0, fail = 0, offline = 0, noclock = 0;
  uint32_t sleep = 0;
  uint32_t awakeMs = 0;
  uint32_t lowestHeap = 0;
  std::string error;          // the first failure, "s3:the body took too long"
};

// key=value pairs, `err` last since it has spaces; at most kHistoryLineMax
// bytes, cut at a UTF-8 boundary. Keys are only ever added.
std::string historyLine(const WakeRecord& r);

// The slot the record numbered `index` (0-based, ever written) goes in.
size_t historySlot(uint32_t index, size_t slots = kHistorySlots);
// The slots holding records, oldest first, after `written` records.
std::vector<size_t> historyOrder(uint32_t written, size_t slots = kHistorySlots);

}  // namespace dither
