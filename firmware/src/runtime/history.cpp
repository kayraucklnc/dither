#include "history.h"

#include <algorithm>
#include <cstdio>

namespace dither {
namespace {

const char* yesNo(bool v) { return v ? "yes" : "no"; }

void cutAtCharacter(std::string& s, size_t max) {
  if (s.size() <= max) return;
  size_t end = max;
  // Back off continuation bytes so a character is never split.
  while (end > 0 && (static_cast<unsigned char>(s[end]) & 0xC0) == 0x80) --end;
  s.resize(end);
}

}  // namespace

std::string historyLine(const WakeRecord& r) {
  char at[24] = "-";
  if (r.at) std::snprintf(at, sizeof at, "%lld", static_cast<long long>(*r.at));
  char rssi[16] = "";
  if (r.rssi) std::snprintf(rssi, sizeof rssi, " rssi=%d", *r.rssi);
  char line[256];
  std::snprintf(line, sizeof line,
                "at=%s v=%s reset=%d wake=%lu state=%s frame=%s online=%s clock=%s usb=%s net=%s%s ok=%d fail=%d "
                "offline=%d noclock=%d sleep=%lu ms=%lu heap=%lu",
                at, r.version.c_str(), r.reset, static_cast<unsigned long>(r.wake), r.state, r.frame, yesNo(r.online),
                r.clockSet ? "set" : "unknown", yesNo(r.usb), r.network ? "used" : "skipped", rssi, r.ok, r.fail,
                r.offline, r.noclock, static_cast<unsigned long>(r.sleep), static_cast<unsigned long>(r.awakeMs),
                static_cast<unsigned long>(r.lowestHeap));
  std::string out = line;
  if (!r.error.empty()) out += " err=" + r.error;
  cutAtCharacter(out, kHistoryLineMax);
  return out;
}

size_t historySlot(uint32_t index, size_t slots) {
  return static_cast<size_t>(index) % slots;
}

std::vector<size_t> historyOrder(uint32_t written, size_t slots) {
  const size_t count = std::min<size_t>(written, slots);
  std::vector<size_t> order;
  order.reserve(count);
  for (size_t i = 0; i < count; ++i) order.push_back(historySlot(written - count + static_cast<uint32_t>(i), slots));
  return order;
}

}  // namespace dither
