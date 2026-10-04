#include "program.h"

#include <algorithm>

#include "condition.h"
#include "elements.h"

namespace dither {
namespace {

constexpr int kMaxDimension = 4096;

uint32_t seconds(JsonView v, uint32_t fallback) {
  if (!v.isNumber() || !(v.number() > 0)) return fallback;
  return static_cast<uint32_t>(std::min(v.number(), 4.0e9));
}

}  // namespace

std::unique_ptr<Program> Program::load(ByteSpan blob, std::string& error) {
  std::unique_ptr<Program> p(new Program());
  BlobError be = verifyBlob(blob, p->header_);
  if (be != BlobError::None) {
    error = std::string("blob: ") + blobErrorName(be);
    return nullptr;
  }
  if (!p->configure(blob, error)) return nullptr;
  return p;
}

bool Program::configure(ByteSpan blob, std::string& error) {
  ByteSpan rt = blob.sub(header_.runtimeOffset, header_.runtimeLength);
  JsonParseResult r = doc_.parse(std::string_view(reinterpret_cast<const char*>(rt.data), rt.size));
  if (!r.ok) {
    error = "runtime JSON: " + r.error + " at " + std::to_string(r.offset);
    return false;
  }
  JsonView root = doc_.root();
  if (!root.isObject() || root["v"].number(0) != 1) {
    error = "runtime JSON: not version 1";
    return false;
  }
  width_ = root["width"].integer(0);
  height_ = root["height"].integer(0);
  rotation_ = root["rotation"].integer(0);
  if (width_ <= 0 || height_ <= 0 || width_ > kMaxDimension || height_ > kMaxDimension) {
    error = "runtime JSON: bad width/height";
    return false;
  }
  if (rotation_ != 0 && rotation_ != 90 && rotation_ != 180 && rotation_ != 270) {
    error = "runtime JSON: bad rotation";
    return false;
  }
  const double sectionStart = header_.assetsOffset;
  const double sectionEnd = sectionStart + header_.assetsLength;
  for (JsonView a = root["assets"].first(); a.exists(); a = a.next()) {
    double off = a[size_t{0}].number(-1), len = a[size_t{1}].number(-1);
    if (!(off >= sectionStart && len >= 0 && off + len <= sectionEnd)) {
      error = "runtime JSON: asset " + std::to_string(assets_.size()) + " out of bounds";
      return false;
    }
    assets_.push_back(blob.sub(static_cast<size_t>(off), static_cast<size_t>(len)));
  }
  tzValid_ = tz_.parse(root["tz"].string());
  locale_ = Locale::fromJson(root["locale"]);
  ntp_ = root["ntp"].isString() ? std::string(root["ntp"].string()) : "pool.ntp.org";
  for (JsonView w = root["wifi"].first(); w.exists(); w = w.next()) {
    if (w["ssid"].isString()) wifi_.push_back({std::string(w["ssid"].string()), std::string(w["pass"].string())});
  }
  sources_ = parseSources(root["sources"]);
  refresh_ = seconds(root["refresh"], kDefaultRefresh);
  JsonView quiet = root["quiet"];
  if (quiet["from"].isNumber() && quiet["to"].isNumber()) {
    quiet_.enabled = true;
    quiet_.from = std::clamp(quiet["from"].integer(0), 0, 1439);
    quiet_.to = std::clamp(quiet["to"].integer(0), 0, 1439);
  }
  return true;
}

FormatContext Program::formatContext(std::optional<int64_t> now) const {
  FormatContext ctx;
  ctx.now = now;
  ctx.tz = &tz_;
  ctx.locale = &locale_;
  return ctx;
}

int Program::chooseScreen(const ValueStore& values, std::optional<int64_t> now) const {
  const int count = static_cast<int>(screenCount());
  const FormatContext ctx = formatContext(now);
  for (JsonView rule = root()["rules"].first(); rule.exists(); rule = rule.next()) {
    if (!evalCondition(rule["when"], values, ctx)) continue;
    int screen = rule["screen"].integer(0);
    return screen >= 0 && screen < count ? screen : 0;
  }
  return 0;
}

uint32_t Program::refreshFor(int screen) const {
  return seconds(root()["screens"][static_cast<size_t>(std::max(screen, 0))]["refresh"], refresh_);
}

void Program::render(int screen, const ValueStore& values, std::optional<int64_t> now, Framebuffer& fb) const {
  if (fb.width() != width_ || fb.height() != height_) fb = Framebuffer(width_, height_);
  RenderContext ctx;
  ctx.values = &values;
  ctx.format = formatContext(now);
  ctx.format.values = &values;
  ctx.assets = &assets_;
  renderElements(fb, root()["screens"][static_cast<size_t>(std::max(screen, 0))]["elements"], ctx);
}

}  // namespace dither
