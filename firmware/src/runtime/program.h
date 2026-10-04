// A loaded blob: the runtime JSON plus the assets it points at.
#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "blob.h"
#include "format.h"
#include "bytes.h"
#include "framebuffer.h"
#include "json.h"
#include "source.h"
#include "time_format.h"
#include "timezone.h"
#include "value.h"

namespace dither {

struct WifiNetwork {
  std::string ssid, pass;
};

struct QuietHours {
  bool enabled = false;
  int from = 0, to = 0;  // minutes of the day
};

constexpr uint32_t kDefaultRefresh = 900;

class Program {
 public:
  // Verifies the blob (§1) and parses its runtime JSON. On failure returns
  // null and says why in `error`. The blob's bytes must outlive the Program.
  static std::unique_ptr<Program> load(ByteSpan blob, std::string& error);

  const BlobHeader& header() const { return header_; }
  std::string_view board() const { return root()["board"].string(); }
  int width() const { return width_; }
  int height() const { return height_; }
  int rotation() const { return rotation_; }
  const TimeZone& timeZone() const { return tz_; }
  bool timeZoneValid() const { return tzValid_; }
  const Locale& locale() const { return locale_; }
  const std::string& ntpServer() const { return ntp_; }
  const std::vector<WifiNetwork>& wifi() const { return wifi_; }
  const std::vector<SourceSpec>& sources() const { return sources_; }
  uint32_t defaultRefresh() const { return refresh_; }
  const QuietHours& quiet() const { return quiet_; }
  size_t screenCount() const { return root()["screens"].size(); }

  // Rules in order; the first that holds picks its screen, else screen 0.
  int chooseScreen(const ValueStore& values, std::optional<int64_t> now) const;
  uint32_t refreshFor(int screen) const;  // the screen's own, or the default
  void render(int screen, const ValueStore& values, std::optional<int64_t> now, Framebuffer& fb) const;
  FormatContext formatContext(std::optional<int64_t> now) const;

 private:
  Program() = default;
  JsonView root() const { return doc_.root(); }
  bool configure(ByteSpan blob, std::string& error);

  BlobHeader header_;
  JsonDoc doc_;
  std::vector<ByteSpan> assets_;
  int width_ = 0, height_ = 0, rotation_ = 0;
  TimeZone tz_;
  bool tzValid_ = false;
  Locale locale_;
  std::string ntp_;
  std::vector<WifiNetwork> wifi_;
  std::vector<SourceSpec> sources_;
  uint32_t refresh_ = kDefaultRefresh;
  QuietHours quiet_;
};

}  // namespace dither
