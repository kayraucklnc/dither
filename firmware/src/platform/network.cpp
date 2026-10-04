#include "network.h"

#include <Arduino.h>
#include <WiFi.h>
#include <esp_sntp.h>
#include <sys/time.h>

#include "log.h"

namespace dither {
namespace {

constexpr int64_t kEarliestPlausible = 1700000000;  // 2023-11; anything before is an unset clock

}  // namespace

WifiResult joinWifi(const std::vector<WifiNetwork>& networks) {
  WifiResult result;
  if (networks.empty()) return result;
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  for (const auto& n : networks) {
    dlog("wifi: joining '%s'", n.ssid.c_str());
    WiFi.begin(n.ssid.c_str(), n.pass.c_str());
    const uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < kWifiTimeoutMs) delay(100);
    if (WiFi.status() == WL_CONNECTED) {
      result.online = true;
      result.rssi = WiFi.RSSI();
      dlog("wifi: joined '%s' in %lu ms, rssi %d dBm, ip %s", n.ssid.c_str(),
           static_cast<unsigned long>(millis() - start), static_cast<int>(*result.rssi),
           WiFi.localIP().toString().c_str());
      return result;
    }
    dlog("wifi: '%s' failed (status %d)", n.ssid.c_str(), static_cast<int>(WiFi.status()));
    WiFi.disconnect(true);
  }
  WiFi.mode(WIFI_OFF);
  return result;
}

void stopWifi() {
  if (WiFi.getMode() == WIFI_OFF) return;
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

bool syncTime(const std::string& server) {
  sntp_set_sync_status(SNTP_SYNC_STATUS_RESET);
  configTime(0, 0, server.c_str());
  const uint32_t start = millis();
  while (sntp_get_sync_status() != SNTP_SYNC_STATUS_COMPLETED) {
    if (millis() - start > kNtpTimeoutMs) {
      dlog("ntp: no answer from %s", server.c_str());
      esp_sntp_stop();
      return false;
    }
    delay(50);
  }
  esp_sntp_stop();
  dlog("ntp: synced with %s in %lu ms, now %lld", server.c_str(), static_cast<unsigned long>(millis() - start),
       static_cast<long long>(time(nullptr)));
  return true;
}

std::optional<int64_t> clockNow() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < kEarliestPlausible) return std::nullopt;
  return static_cast<int64_t>(tv.tv_sec);
}

}  // namespace dither
