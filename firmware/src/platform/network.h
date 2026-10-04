// Wi-Fi, NTP and the system clock.
#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "../runtime/program.h"

namespace dither {

constexpr uint32_t kWifiTimeoutMs = 15000;  // per network, format.md §5
constexpr uint32_t kNtpTimeoutMs = 10000;

struct WifiResult {
  bool online = false;
  std::optional<double> rssi;
};

// Tries each network in order; leaves the radio on when one joins.
WifiResult joinWifi(const std::vector<WifiNetwork>& networks);
void stopWifi();

bool syncTime(const std::string& server);

// Unix seconds, or nothing while the clock has never been set (it survives
// deep sleep, not a power loss).
std::optional<int64_t> clockNow();

}  // namespace dither
