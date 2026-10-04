#include "wake.h"

#include <algorithm>

namespace dither {
namespace {

Value optionalNumber(const std::optional<double>& v) {
  return v ? Value::number(*v) : Value();
}

}  // namespace

void setClockValues(ValueStore& values, std::optional<int64_t> now, const TimeZone& tz) {
  const char* const kNames[] = {"clock.epoch", "clock.hour", "clock.minute", "clock.minutes",
                                "clock.weekday", "clock.day", "clock.month", "clock.year"};
  if (!now) {
    for (const char* name : kNames) values.set(name, Value());
    return;
  }
  CivilTime t = tz.toLocal(*now);
  const double fields[] = {static_cast<double>(*now), static_cast<double>(t.hour), static_cast<double>(t.minute),
                           static_cast<double>(t.hour * 60 + t.minute), static_cast<double>(t.weekday),
                           static_cast<double>(t.day), static_cast<double>(t.month), static_cast<double>(t.year)};
  for (size_t i = 0; i < 8; ++i) values.set(kNames[i], Value::number(fields[i]));
}

void setDeviceValues(ValueStore& values, const DeviceStatus& device) {
  values.set("device.battery", optionalNumber(device.battery));
  values.set("device.usb", Value::boolean(device.usb));
  values.set("device.online", Value::boolean(device.online));
  values.set("device.rssi", optionalNumber(device.rssi));
}

void setSourceStatus(ValueStore& values, const std::string& id, const SourceState& state,
                     std::optional<int64_t> now) {
  values.set(id + "._ok", Value::boolean(state.attempted && state.ok));
  Value age;
  if (state.everSucceeded && state.lastSuccess && now) {
    age = Value::number(static_cast<double>(std::max<int64_t>(0, floorDiv(*now - *state.lastSuccess, 60))));
  }
  values.set(id + "._age", age);
}

bool sourceDue(const SourceState& state, uint32_t every, std::optional<int64_t> now) {
  if (!state.attempted || !now || !state.lastAttempt) return true;
  return *now - *state.lastAttempt >= static_cast<int64_t>(every);
}

uint32_t crashBackoffSeconds(uint32_t consecutiveCrashes) {
  return consecutiveCrashes >= kCrashLimit ? kCrashBackoff : 0;
}

bool sourceFetchable(const SourceSpec& source, std::optional<int64_t> now) {
  return now.has_value() || !source.usesPlaceholders;
}

bool needsNetwork(const std::vector<SourceSpec>& sources, const std::vector<SourceState>& states,
                  std::optional<int64_t> now) {
  if (!now) return true;
  for (size_t i = 0; i < sources.size(); ++i) {
    if (sourceDue(i < states.size() ? states[i] : SourceState(), sources[i].every, now) &&
        sourceFetchable(sources[i], now)) {
      return true;
    }
  }
  return false;
}

bool inQuietHours(const QuietHours& quiet, int minute) {
  if (!quiet.enabled || quiet.from == quiet.to) return false;
  if (quiet.from < quiet.to) return minute >= quiet.from && minute < quiet.to;
  return minute >= quiet.from || minute < quiet.to;
}

uint32_t quietSleepSeconds(const CivilTime& local, int toMinute) {
  return std::max(secondsUntilMinute(local, toMinute), kMinQuietSleep);
}

uint32_t secondsUntilMinute(const CivilTime& local, int minute) {
  int nowSeconds = (local.hour * 60 + local.minute) * 60 + local.second;
  int delta = minute * 60 - nowSeconds;
  if (delta <= 0) delta += 86400;
  return static_cast<uint32_t>(delta);
}

uint32_t sleepSeconds(uint32_t refresh, const std::vector<SourceSpec>& sources,
                      const std::vector<SourceState>& states, std::optional<int64_t> now) {
  int64_t sleep = refresh;
  if (now) {
    for (size_t i = 0; i < sources.size() && i < states.size(); ++i) {
      if (!states[i].attempted || !states[i].lastAttempt) continue;
      int64_t due = *states[i].lastAttempt + sources[i].every - *now;
      sleep = std::min(sleep, due);
    }
  }
  return static_cast<uint32_t>(std::max<int64_t>(sleep, kMinSleep));
}

}  // namespace dither
