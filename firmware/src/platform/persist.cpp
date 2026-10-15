#include "persist.h"

#include <Arduino.h>
#include <Preferences.h>

#include <vector>

#include "../runtime/history.h"
#include "log.h"

namespace dither {
namespace {

constexpr const char* kNamespace = "dither";
constexpr const char* kCacheKey = "cache";
constexpr const char* kHistoryNamespace = "dither-log";
constexpr const char* kHistoryCountKey = "n";
constexpr uint32_t kRtcMagic = 0xD17E0001;
constexpr uint32_t kCrashMagic = 0xC4A5D17E;

// Deep-sleep persistence: the only state kept outside a wake.
struct RtcState {
  uint32_t magic;
  uint32_t panelHash;
  uint32_t boots;
  bool panelKnown;
};
RTC_DATA_ATTR RtcState rtc;

// RTC_DATA_ATTR is reloaded from the image after a panic or watchdog reset;
// RTC_NOINIT_ATTR is not, which is what a crash counter needs.
struct CrashState {
  uint32_t magic;
  uint32_t consecutive;
};
RTC_NOINIT_ATTR CrashState crashes;

void ensureRtc() {
  if (rtc.magic == kRtcMagic) return;
  rtc = RtcState{kRtcMagic, 0, 0, false};
}

std::vector<uint8_t> readStored() {
  Preferences prefs;
  // Read-write so a missing namespace is created rather than logged as an error.
  if (!prefs.begin(kNamespace, false)) return {};
  std::vector<uint8_t> bytes(prefs.getBytesLength(kCacheKey));
  if (!bytes.empty()) prefs.getBytes(kCacheKey, bytes.data(), bytes.size());
  prefs.end();
  return bytes;
}

std::string historyKey(size_t slot) {
  return "h" + std::to_string(slot);
}

// The history is the expendable part of NVS: when the cache does not fit, it goes.
void clearHistory() {
  Preferences prefs;
  if (!prefs.begin(kHistoryNamespace, false)) return;
  prefs.clear();
  prefs.end();
}

size_t writeCache(const std::vector<uint8_t>& bytes) {
  Preferences prefs;
  if (!prefs.begin(kNamespace, false)) return 0;
  size_t written = prefs.putBytes(kCacheKey, bytes.data(), bytes.size());
  prefs.end();
  return written;
}

}  // namespace

ValueCache loadCache(uint32_t blobCrc) {
  ValueCache cache;
  std::vector<uint8_t> bytes = readStored();
  if (!bytes.empty() && !decodeCache({bytes.data(), bytes.size()}, cache)) {
    dlog("cache: stored cache unreadable, starting empty");
    cache = ValueCache();
  }
  if (cache.blobCrc != blobCrc) {
    if (!bytes.empty()) dlog("cache: written for another blob, starting empty");
    cache = ValueCache();
    cache.blobCrc = blobCrc;
  }
  return cache;
}

void saveCache(const ValueCache& original) {
  ValueCache cache = original;
  for (const std::string& ref : fitCache(cache)) {
    dlog("cache: WARNING over %u bytes - '%s' not kept across sleep", static_cast<unsigned>(kMaxCacheBytes),
         ref.c_str());
  }
  std::vector<uint8_t> bytes = encodeCache(cache);
  if (bytes == readStored()) return;
  size_t written = writeCache(bytes);
  if (written != bytes.size()) {
    dlog("cache: NVS full, dropping the wake history to make room");
    clearHistory();
    written = writeCache(bytes);
  }
  if (written != bytes.size()) {
    dlog("cache: NVS write failed (%u of %u bytes)", static_cast<unsigned>(written),
         static_cast<unsigned>(bytes.size()));
  } else {
    dlog("cache: saved %u bytes", static_cast<unsigned>(bytes.size()));
  }
}

bool panelShows(uint32_t frameHash) {
  ensureRtc();
  return rtc.panelKnown && rtc.panelHash == frameHash;
}

void rememberPanel(uint32_t frameHash) {
  ensureRtc();
  rtc.panelHash = frameHash;
  rtc.panelKnown = true;
}

void forgetPanel() {
  ensureRtc();
  rtc.panelKnown = false;
}

uint32_t countWake() {
  ensureRtc();
  return ++rtc.boots;
}

uint32_t recordReset(bool crashed) {
  if (crashes.magic != kCrashMagic) crashes = CrashState{kCrashMagic, 0};
  if (crashed) crashes.consecutive++;
  return crashes.consecutive;
}

void clearCrashes() {
  crashes = CrashState{kCrashMagic, 0};
}

void appendHistory(const std::string& line) {
  Preferences prefs;
  if (!prefs.begin(kHistoryNamespace, false)) return;
  const uint32_t written = prefs.getUInt(kHistoryCountKey, 0);
  // The line first, then the count: a wake cut short leaves the ring as it was.
  if (prefs.putString(historyKey(historySlot(written)).c_str(), line.c_str()) == line.size()) {
    prefs.putUInt(kHistoryCountKey, written + 1);
  } else {
    dlog("history: not saved (NVS full)");
  }
  prefs.end();
}

void forEachHistory(const std::function<void(const std::string&)>& visit) {
  Preferences prefs;
  if (!prefs.begin(kHistoryNamespace, true)) return;
  for (size_t slot : historyOrder(prefs.getUInt(kHistoryCountKey, 0))) {
    String line = prefs.getString(historyKey(slot).c_str(), "");
    if (line.length() > 0) visit(line.c_str());
  }
  prefs.end();
}

}  // namespace dither
