#include "cache_codec.h"

#include <cstring>

#include "source.h"

namespace dither {
namespace {

constexpr uint32_t kMagic = 0x33435644;  // "DVC3"

class Writer {
 public:
  std::vector<uint8_t> out;
  void u8(uint8_t v) { out.push_back(v); }
  void u32(uint32_t v) {
    for (int i = 0; i < 4; ++i) out.push_back(static_cast<uint8_t>(v >> (8 * i)));
  }
  void i64(int64_t v) {
    uint64_t u = static_cast<uint64_t>(v);
    for (int i = 0; i < 8; ++i) out.push_back(static_cast<uint8_t>(u >> (8 * i)));
  }
  void f64(double v) {
    int64_t bits = 0;
    std::memcpy(&bits, &v, sizeof bits);
    i64(bits);
  }
  void str(const std::string& s) {
    u32(static_cast<uint32_t>(s.size()));
    out.insert(out.end(), s.begin(), s.end());
  }
};

class Reader {
 public:
  explicit Reader(ByteSpan b) : b_(b) {}
  bool ok() const { return ok_; }
  bool atEnd() const { return pos_ == b_.size; }
  uint8_t u8() { return need(1) ? b_.data[pos_++] : 0; }
  uint32_t u32() {
    if (!need(4)) return 0;
    uint32_t v = readU32(b_.data + pos_);
    pos_ += 4;
    return v;
  }
  int64_t i64() {
    if (!need(8)) return 0;
    uint64_t v = 0;
    for (int i = 0; i < 8; ++i) v |= static_cast<uint64_t>(b_.data[pos_ + static_cast<size_t>(i)]) << (8 * i);
    pos_ += 8;
    return static_cast<int64_t>(v);
  }
  double f64() {
    int64_t bits = i64();
    double v = 0;
    std::memcpy(&v, &bits, sizeof v);
    return v;
  }
  std::string str() {
    uint32_t n = u32();
    if (!need(n)) return {};
    std::string s(reinterpret_cast<const char*>(b_.data + pos_), n);
    pos_ += n;
    return s;
  }

 private:
  bool need(size_t n) {
    if (!ok_ || b_.size - pos_ < n) ok_ = false;
    return ok_;
  }
  ByteSpan b_;
  size_t pos_ = 0;
  bool ok_ = true;
};

void writeValue(Writer& w, const Value& v) {
  w.u8(static_cast<uint8_t>(v.type()));
  switch (v.type()) {
    case ValueType::Null: break;
    case ValueType::Number: w.f64(v.asNumber()); break;
    case ValueType::String: w.str(v.asString()); break;
    case ValueType::Bool: w.u8(v.asBool() ? 1 : 0); break;
    case ValueType::Series:
      w.u32(static_cast<uint32_t>(v.asSeries().size()));
      for (double d : v.asSeries()) w.f64(d);
      break;
  }
}

bool readValue(Reader& r, Value& out) {
  switch (static_cast<ValueType>(r.u8())) {
    case ValueType::Null: out = Value(); return r.ok();
    case ValueType::Number: out = Value::number(r.f64()); return r.ok();
    case ValueType::String: out = Value::string(r.str()); return r.ok();
    case ValueType::Bool: out = Value::boolean(r.u8() != 0); return r.ok();
    case ValueType::Series: {
      uint32_t n = r.u32();
      if (n > kMaxSeries) return false;
      std::vector<double> s;
      for (uint32_t i = 0; i < n; ++i) s.push_back(r.f64());
      out = Value::series(std::move(s));
      return r.ok();
    }
  }
  return false;
}

}  // namespace

SourceState ValueCache::stateOf(const std::string& id) const {
  for (const auto& [k, s] : sources) {
    if (k == id) return s;
  }
  return SourceState();
}

void ValueCache::setState(const std::string& id, const SourceState& state) {
  for (auto& [k, s] : sources) {
    if (k == id) {
      s = state;
      return;
    }
  }
  sources.emplace_back(id, state);
}

std::optional<std::string> ValueCache::tokenFor(const std::string& id, std::optional<int64_t> now) const {
  if (!now) return std::nullopt;
  for (const auto& [k, t] : tokens) {
    if (k == id && *now < t.expiresAt - kTokenMargin) return t.token;
  }
  return std::nullopt;
}

void ValueCache::setToken(const std::string& id, const std::string& token, int64_t expiresAt) {
  dropToken(id);
  tokens.emplace_back(id, Token{token, expiresAt});
}

void ValueCache::dropToken(const std::string& id) {
  for (auto it = tokens.begin(); it != tokens.end(); ++it) {
    if (it->first == id) {
      tokens.erase(it);
      return;
    }
  }
}

std::vector<std::string> fitCache(ValueCache& cache, size_t maxBytes) {
  std::vector<std::string> dropped;
  size_t size = encodeCache(cache).size();
  while (size > maxBytes && !cache.values.all().empty()) {
    std::string largest;
    size_t largestBytes = 0;
    for (const auto& [ref, v] : cache.values.all()) {
      Writer w;
      w.str(ref);
      writeValue(w, v);
      if (w.out.size() > largestBytes) largestBytes = w.out.size(), largest = ref;
    }
    cache.values.erase(largest);
    dropped.push_back(largest);
    size -= largestBytes;
  }
  return dropped;
}

std::vector<uint8_t> encodeCache(const ValueCache& cache) {
  Writer w;
  w.u32(kMagic);
  w.u32(cache.blobCrc);
  w.u8(static_cast<uint8_t>((cache.lastOnline ? 1 : 0) | (cache.lastRssi ? 2 : 0)));
  w.f64(cache.lastRssi.value_or(0));
  w.u32(static_cast<uint32_t>(cache.sources.size()));
  for (const auto& [id, s] : cache.sources) {
    w.str(id);
    w.u8(static_cast<uint8_t>((s.attempted ? 1 : 0) | (s.ok ? 2 : 0) | (s.everSucceeded ? 4 : 0) |
                              (s.lastAttempt ? 8 : 0) | (s.lastSuccess ? 16 : 0)));
    w.i64(s.lastAttempt.value_or(0));
    w.i64(s.lastSuccess.value_or(0));
  }
  w.u32(static_cast<uint32_t>(cache.tokens.size()));
  for (const auto& [id, t] : cache.tokens) {
    w.str(id);
    w.str(t.token);
    w.i64(t.expiresAt);
  }
  w.u32(static_cast<uint32_t>(cache.values.all().size()));
  for (const auto& [ref, v] : cache.values.all()) {
    w.str(ref);
    writeValue(w, v);
  }
  return w.out;
}

bool decodeCache(ByteSpan bytes, ValueCache& out) {
  Reader r(bytes);
  if (r.u32() != kMagic) return false;
  ValueCache c;
  c.blobCrc = r.u32();
  const uint8_t network = r.u8();
  const double rssi = r.f64();
  c.lastOnline = network & 1;
  if (network & 2) c.lastRssi = rssi;
  uint32_t sources = r.u32();
  for (uint32_t i = 0; i < sources && r.ok(); ++i) {
    std::string id = r.str();
    SourceState s;
    uint8_t flags = r.u8();
    s.attempted = flags & 1;
    s.ok = flags & 2;
    s.everSucceeded = flags & 4;
    const int64_t attempt = r.i64();
    const int64_t success = r.i64();
    if (flags & 8) s.lastAttempt = attempt;
    if (flags & 16) s.lastSuccess = success;
    c.sources.emplace_back(std::move(id), s);
  }
  uint32_t tokens = r.u32();
  for (uint32_t i = 0; i < tokens && r.ok(); ++i) {
    std::string id = r.str();
    ValueCache::Token t;
    t.token = r.str();
    t.expiresAt = r.i64();
    c.tokens.emplace_back(std::move(id), std::move(t));
  }
  uint32_t count = r.u32();
  for (uint32_t i = 0; i < count && r.ok(); ++i) {
    std::string ref = r.str();
    Value v;
    if (!readValue(r, v)) return false;
    c.values.set(ref, std::move(v));
  }
  if (!r.ok() || !r.atEnd()) return false;
  out = std::move(c);
  return true;
}

}  // namespace dither
