// The pure decisions of a wake (format.md §5) and the built-in values (§2),
// kept free of hardware so the host tests can check them.
#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "program.h"
#include "source.h"
#include "timezone.h"
#include "value.h"

namespace dither {

constexpr uint32_t kMinSleep = 60;
constexpr uint32_t kRetrySleep = 300;  // the partition could not be read: try again soon
constexpr uint32_t kCrashLimit = 3;
constexpr uint32_t kCrashBackoff = 15 * 60;
constexpr uint32_t kNotSetUpSleep = 86400;

struct SourceState {
  bool attempted = false;
  bool ok = false;  // the most recent fetch succeeded
  bool everSucceeded = false;
  std::optional<int64_t> lastAttempt;  // unknown when the clock was
  std::optional<int64_t> lastSuccess;
};

struct DeviceStatus {
  std::optional<double> battery;
  bool usb = false;
  bool online = false;
  std::optional<double> rssi;
};

// clock.* from `now`; all null when the clock is unknown.
void setClockValues(ValueStore& values, std::optional<int64_t> now, const TimeZone& tz);
void setDeviceValues(ValueStore& values, const DeviceStatus& device);
// <id>._ok and <id>._age (whole minutes since the last success).
void setSourceStatus(ValueStore& values, const std::string& id, const SourceState& state,
                     std::optional<int64_t> now);

// After kCrashLimit consecutive crash resets, wait before trying again.
uint32_t crashBackoffSeconds(uint32_t consecutiveCrashes);

bool sourceDue(const SourceState& state, uint32_t every, std::optional<int64_t> now);
// A source with time placeholders cannot be asked while the clock is unknown.
bool sourceFetchable(const SourceSpec& source, std::optional<int64_t> now);
// Wi-Fi is joined only when a source is due or the clock has never been set.
bool needsNetwork(const std::vector<SourceSpec>& sources, const std::vector<SourceState>& states,
                  std::optional<int64_t> now);
bool inQuietHours(const QuietHours& quiet, int minuteOfDay);
// Seconds from `local` until the next time the local clock reads `minute`.
uint32_t secondsUntilMinute(const CivilTime& local, int minute);
constexpr uint32_t kMinQuietSleep = 30;
// Until quiet hours end, but at least 30 s.
uint32_t quietSleepSeconds(const CivilTime& local, int toMinute);

// The screen's interval, shortened so the next source due is fetched on
// time, never below 60 s.
uint32_t sleepSeconds(uint32_t refresh, const std::vector<SourceSpec>& sources,
                      const std::vector<SourceState>& states, std::optional<int64_t> now);

}  // namespace dither
