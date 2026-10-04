// The JSON reader: filtered, budgeted, and recursive only along kept paths.
#include <algorithm>
#include <cstdlib>
#include <string>

#include "json.h"
#include "noinline.h"

namespace dither {

// ---- JsonFilter -------------------------------------------------------------

JsonFilter* JsonFilter::node(std::string_view path) {
  JsonFilter* node = this;
  while (true) {
    size_t dot = path.find('.');
    std::string_view seg = path.substr(0, dot);
    longestKey_ = std::max(longestKey_, seg.size());
    JsonFilter* next = nullptr;
    for (auto& [k, f] : node->children_) {
      if (k == seg) next = &f;
    }
    if (!next) {
      node->children_.emplace_back(std::string(seg), JsonFilter());
      next = &node->children_.back().second;
    }
    node = next;
    if (dot == std::string_view::npos) break;
    path.remove_prefix(dot + 1);
  }
  return node;
}

void JsonFilter::addPath(std::string_view path, int count) {
  JsonFilter* node = this->node(path);
  if (count < 0) {
    node->scalar_ = true;
  } else {
    node->series_ = std::max(node->series_, count);
  }
}

void JsonFilter::addAggregate(std::string_view path, AggKind kind, std::string_view field, int id) {
  JsonFilter* target = node(path);
  target->aggregates_.push_back({id, kind, std::string(field)});
  if (target->each_.empty()) target->each_.emplace_back();
  if (kind == AggKind::Sum) {
    target->each_[0].addPath(field);
    // Keys inside the elements are matched against the root's cap too.
    longestKey_ = std::max(longestKey_, target->each_[0].longestKey_);
  }
  aggregateCount_ = std::max(aggregateCount_, id + 1);
}

void JsonFilter::merge(const JsonFilter& other) {
  scalar_ = scalar_ || other.scalar_;
  series_ = std::max(series_, other.series_);
  for (const auto& [k, f] : other.children_) {
    JsonFilter* mine = nullptr;
    for (auto& [mk, mf] : children_) {
      if (mk == k) mine = &mf;
    }
    if (mine) {
      mine->merge(f);
    } else {
      children_.emplace_back(k, f);
    }
  }
}

void JsonFilter::finalize() {
  for (auto& [k, f] : children_) f.finalize();
  if (each_.empty()) return;
  for (auto& [k, f] : children_) {
    if (!k.empty() && std::all_of(k.begin(), k.end(), [](char c) { return c >= '0' && c <= '9'; })) {
      f.merge(each_[0]);
    }
  }
}

long JsonFilter::highestIndex() const {
  long highest = -1;
  for (const auto& [k, f] : children_) {
    if (k.empty() || k.size() > 9 || !std::all_of(k.begin(), k.end(), [](char c) { return c >= '0' && c <= '9'; })) {
      continue;
    }
    long index = 0;
    for (char c : k) index = index * 10 + (c - '0');
    highest = std::max(highest, index);
  }
  return highest;
}

const JsonFilter* JsonFilter::child(std::string_view key) const {
  for (const auto& [k, f] : children_) {
    if (k == key) return &f;
  }
  return nullptr;
}

// ---- Parser -----------------------------------------------------------------

namespace {

// What the parser wants from the value it is about to read.
struct Want {
  // Item: an element inside a series' range. Hole: an element that is not
  // wanted but keeps its position for a later index.
  enum Kind { All, Path, Item, Hole, Skip } kind;
  const JsonFilter* filter;
};

bool isDigit(int c) {
  return c >= '0' && c <= '9';
}

// Drops a trailing incomplete UTF-8 sequence left by a cut.
void trimPartialUtf8(std::string& s) {
  size_t i = s.size();
  size_t back = 0;
  while (i > 0 && back < 4 && (static_cast<unsigned char>(s[i - 1]) & 0xC0) == 0x80) --i, ++back;
  if (i == 0) return;
  unsigned char lead = static_cast<unsigned char>(s[i - 1]);
  size_t need = lead < 0x80 ? 0 : (lead & 0xE0) == 0xC0 ? 1 : (lead & 0xF0) == 0xE0 ? 2 : 3;
  if (lead >= 0x80 && back < need) s.resize(i - 1);
}

}  // namespace

class JsonParser {
 public:
  JsonParser(JsonDoc& doc, CharSource& src, const JsonFilter* filter, const JsonLimits& limits)
      : doc_(doc), src_(src), filter_(filter), limits_(limits) {}

  JsonParseResult run() {
    doc_.nodes_.clear();
    doc_.strings_.clear();
    doc_.aggregates_.assign(filter_ ? static_cast<size_t>(filter_->aggregateCount()) : 0, std::nullopt);
    skipSpace();
    uint32_t root = JsonDoc::kNone;
    Want want = filter_ ? Want{Want::Path, filter_} : Want{Want::All, nullptr};
    bool ok = value(want, 0, root);
    if (ok) {
      skipSpace();
      if (src_.peek() != -1) ok = fail("trailing characters");
    }
    JsonParseResult r;
    r.ok = ok;
    if (ok && root == JsonDoc::kNone) {
      // Nothing on the declared paths: an empty object stands in for the root.
      root = addContainer(JsonType::Object);
      r.ok = root != JsonDoc::kNone;
    }
    if (!r.ok) {
      r.error = error_.empty() ? "empty document" : error_;
      r.offset = consumed_;
      doc_.nodes_.clear();
      doc_.strings_.clear();
      doc_.aggregates_.clear();
    }
    return r;
  }

 private:
  JsonDoc& doc_;
  CharSource& src_;
  const JsonFilter* filter_;
  JsonLimits limits_;
  std::string error_;
  size_t consumed_ = 0;

  int get() {
    int c = src_.get();
    if (c >= 0) ++consumed_;
    return c;
  }

  bool fail(const char* message) {
    if (error_.empty()) error_ = message;
    return false;
  }

  void skipSpace() {
    for (int c = src_.peek(); c == ' ' || c == '\t' || c == '\n' || c == '\r'; c = src_.peek()) get();
  }

  uint32_t addNode(JsonType type) {
    if (doc_.nodes_.size() >= limits_.maxNodes) {
      fail("too many values");
      return JsonDoc::kNone;
    }
    doc_.nodes_.emplace_back();
    doc_.nodes_.back().type = type;
    return static_cast<uint32_t>(doc_.nodes_.size() - 1);
  }

  uint32_t addContainer(JsonType type) {
    uint32_t idx = addNode(type);
    if (idx != JsonDoc::kNone) {
      doc_.nodes_[idx].kids.first = JsonDoc::kNone;
      doc_.nodes_[idx].kids.count = 0;
    }
    return idx;
  }

  DITHER_NOINLINE bool storeString(const std::string& s, uint32_t& offset) {
    if (doc_.strings_.size() + s.size() > limits_.maxStringBytes) return fail("too much text");
    offset = static_cast<uint32_t>(doc_.strings_.size());
    doc_.strings_ += s;
    return true;
  }

  void link(uint32_t parent, uint32_t& last, uint32_t child) {
    auto& p = doc_.nodes_[parent];
    if (last == JsonDoc::kNone) {
      p.kids.first = child;
    } else {
      doc_.nodes_[last].next = child;
    }
    p.kids.count++;
    last = child;
  }

  // ---- values ----

  bool value(const Want& want, int depth, uint32_t& out) {
    out = JsonDoc::kNone;
    if (want.kind == Want::Skip) return skip();
    if (want.kind == Want::Hole) return skip() && keepNull(out);
    const int c = src_.peek();
    const bool container = c == '{' || c == '[';
    // The last occurrence of a path decides, as with JSON.parse: anything
    // but an array here resets its aggregates to null.
    if (want.kind == Want::Path && c != '[') clearAggregates(*want.filter);
    if (container) {
      if (want.kind == Want::Item) return skip() && keepNull(out);
      if (want.kind == Want::Path) {
        const JsonFilter& f = *want.filter;
        bool wanted = f.hasChildren() || (c == '[' && (f.seriesItems() >= 0 || !f.aggregates().empty()));
        if (!wanted) return skip();
      }
      if (depth >= limits_.maxDepth) return fail("nested too deeply");
      return c == '{' ? object(want, depth, out) : array(want, depth, out);
    }
    const bool keep = want.kind != Want::Path || want.filter->keepsScalar();
    return scalar(keep, out);
  }

  DITHER_NOINLINE bool keepNull(uint32_t& out) {
    out = addNode(JsonType::Null);
    return out != JsonDoc::kNone;
  }

  DITHER_NOINLINE bool scalar(bool keep, uint32_t& out) {
    int c = src_.peek();
    if (c == '"') {
      std::string s;
      bool truncated = false;
      if (!string(keep ? &s : nullptr, limits_.maxStringLength, truncated)) return false;
      if (!keep) return true;
      if (truncated) trimPartialUtf8(s);
      if ((out = addNode(JsonType::String)) == JsonDoc::kNone) return false;
      uint32_t offset = 0;
      if (!storeString(s, offset)) return false;
      doc_.nodes_[out].str.offset = offset;
      doc_.nodes_[out].str.length = static_cast<uint32_t>(s.size());
      return true;
    }
    if (c == 't' || c == 'f' || c == 'n') {
      const char* word = c == 't' ? "true" : c == 'f' ? "false" : "null";
      for (const char* p = word; *p; ++p) {
        if (get() != *p) return fail("invalid literal");
      }
      if (!keep) return true;
      if ((out = addNode(c == 'n' ? JsonType::Null : JsonType::Bool)) == JsonDoc::kNone) return false;
      doc_.nodes_[out].boolean = c == 't';
      return true;
    }
    double v = 0;
    if (!number(v)) return false;
    if (!keep) return true;
    if ((out = addNode(JsonType::Number)) == JsonDoc::kNone) return false;
    doc_.nodes_[out].number = v;
    return true;
  }

  bool object(const Want& want, int depth, uint32_t& out) {
    get();  // '{'
    if ((out = addContainer(JsonType::Object)) == JsonDoc::kNone) return false;
    uint32_t last = JsonDoc::kNone;
    skipSpace();
    if (src_.peek() == '}') {
      get();
      return true;
    }
    // A key longer than any on the filter's paths cannot match; stop
    // collecting it there.
    const size_t keyCap = want.kind == Want::Path ? filter_->longestKey() + 1 : 0;
    while (true) {
      skipSpace();
      if (src_.peek() != '"') return fail("expected a key");
      std::string key;
      bool truncated = false;
      if (!string(&key, keyCap, truncated)) return false;
      skipSpace();
      if (get() != ':') return fail("expected ':'");
      skipSpace();
      const Want child = want.kind == Want::Path ? memberWant(*want.filter, key, truncated) : want;
      uint32_t node = JsonDoc::kNone;
      if (!value(child, depth + 1, node)) return false;
      if (node != JsonDoc::kNone) {
        uint32_t offset = 0;
        if (!storeString(key, offset)) return false;
        doc_.nodes_[node].keyOffset = offset;
        doc_.nodes_[node].keyLength = static_cast<uint32_t>(key.size());
        link(out, last, node);
      }
      skipSpace();
      int c = get();
      if (c == '}') return true;
      if (c != ',') return fail("expected ',' or '}'");
    }
  }

  bool array(const Want& want, int depth, uint32_t& out) {
    get();  // '['
    if ((out = addContainer(JsonType::Array)) == JsonDoc::kNone) return false;
    uint32_t last = JsonDoc::kNone;
    const long highest = want.kind == Want::Path ? want.filter->highestIndex() : -1;
    const bool aggregating = want.kind == Want::Path && !want.filter->aggregates().empty();
    if (aggregating) startAggregates(*want.filter);
    skipSpace();
    if (src_.peek() == ']') {
      get();
      return true;
    }
    for (size_t index = 0;; ++index) {
      skipSpace();
      const Want child = want.kind == Want::Path ? elementWant(*want.filter, index, highest) : want;
      uint32_t node = JsonDoc::kNone;
      if (aggregating) {
        if (!aggregateElement(*want.filter, child, depth + 1, node)) return false;
      } else if (!value(child, depth + 1, node)) {
        return false;
      }
      if (node != JsonDoc::kNone) link(out, last, node);
      skipSpace();
      int c = get();
      if (c == ']') return true;
      if (c != ',') return fail("expected ',' or ']'");
    }
  }

  // ---- aggregates ----

  DITHER_NOINLINE void clearAggregates(const JsonFilter& f) {
    for (const auto& a : f.aggregates()) doc_.aggregates_[static_cast<size_t>(a.id)].reset();
  }

  DITHER_NOINLINE void startAggregates(const JsonFilter& f) {
    for (const auto& a : f.aggregates()) doc_.aggregates_[static_cast<size_t>(a.id)] = 0.0;
  }

  DITHER_NOINLINE void addFields(const JsonFilter& f, uint32_t element) {
    const JsonView view(&doc_, element);
    for (const auto& a : f.aggregates()) {
      auto& total = doc_.aggregates_[static_cast<size_t>(a.id)];
      if (a.kind == JsonFilter::AggKind::Count) {
        *total += 1;
        continue;
      }
      JsonView v = element == JsonDoc::kNone ? JsonView() : view.path(a.field);
      if (v.isNumber()) *total += v.number();
    }
  }

  // One element of an aggregated array: counted, its fields summed, and kept
  // only as far as some other path wants it. An element nothing else wants
  // is parsed with just the aggregate fields, then dropped again.
  DITHER_NOINLINE bool aggregateElement(const JsonFilter& f, const Want& child, int depth, uint32_t& out) {
    const int c = src_.peek();
    const JsonFilter* fields = f.elementFields();
    const bool needsFields = c == '{' || c == '[';
    if (child.kind == Want::Path || !needsFields || fields == nullptr || !fields->hasChildren()) {
      // finalize() merged the fields into indexed children already.
      if (!value(child, depth, out)) return false;
      addFields(f, child.kind == Want::Path ? out : JsonDoc::kNone);
      return true;
    }
    const size_t nodes = doc_.nodes_.size(), bytes = doc_.strings_.size();
    uint32_t transient = JsonDoc::kNone;
    if (!value(Want{Want::Path, fields}, depth, transient)) return false;
    addFields(f, transient);
    doc_.nodes_.resize(nodes);
    doc_.strings_.resize(bytes);
    if (child.kind == Want::Item || child.kind == Want::Hole) return keepNull(out);
    return true;
  }

  // Kept out of object() and array(), whose frames repeat once per level.
  static DITHER_NOINLINE Want memberWant(const JsonFilter& filter, const std::string& key, bool truncated) {
    const JsonFilter* f = truncated ? nullptr : filter.child(key);
    return f ? Want{Want::Path, f} : Want{Want::Skip, nullptr};
  }

  static DITHER_NOINLINE Want elementWant(const JsonFilter& filter, size_t index, long highest) {
    const JsonFilter* f = filter.hasChildren() ? filter.child(std::to_string(index)) : nullptr;
    if (f) return {Want::Path, f};
    if (index < static_cast<size_t>(std::max(filter.seriesItems(), 0))) return {Want::Item, nullptr};
    if (static_cast<long>(index) < highest) return {Want::Hole, nullptr};
    return {Want::Skip, nullptr};
  }

  // ---- skipping, without recursion ----

  DITHER_NOINLINE bool skip() {
    int c = src_.peek();
    if (c == '"') {
      bool truncated = false;
      return string(nullptr, 0, truncated);
    }
    if (c != '{' && c != '[') {
      uint32_t ignored = JsonDoc::kNone;
      return scalar(false, ignored);
    }
    size_t depth = 0;
    while (true) {
      c = src_.peek();
      if (c < 0) return fail("unterminated value");
      if (c == '"') {
        bool truncated = false;
        if (!string(nullptr, 0, truncated)) return false;
        continue;
      }
      get();
      if (c == '{' || c == '[') {
        ++depth;
      } else if (c == '}' || c == ']') {
        if (--depth == 0) return true;
      }
    }
  }

  // ---- strings and numbers ----

  static void appendUtf8(std::string& s, uint32_t cp) {
    if (cp < 0x80) {
      s += static_cast<char>(cp);
    } else if (cp < 0x800) {
      s += static_cast<char>(0xC0 | (cp >> 6));
      s += static_cast<char>(0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
      s += static_cast<char>(0xE0 | (cp >> 12));
      s += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      s += static_cast<char>(0x80 | (cp & 0x3F));
    } else {
      s += static_cast<char>(0xF0 | (cp >> 18));
      s += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
      s += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      s += static_cast<char>(0x80 | (cp & 0x3F));
    }
  }

  bool readHex4(uint32_t& v) {
    v = 0;
    for (int i = 0; i < 4; ++i) {
      int c = get();
      int d = (c >= '0' && c <= '9')   ? c - '0'
              : (c >= 'a' && c <= 'f') ? c - 'a' + 10
              : (c >= 'A' && c <= 'F') ? c - 'A' + 10
                                       : -1;
      if (d < 0) return fail("bad \\u escape");
      v = (v << 4) | static_cast<uint32_t>(d);
    }
    return true;
  }

  // `out` null: validate and discard. `cap` > 0: keep at most that many
  // bytes and report the rest as `truncated`.
  DITHER_NOINLINE bool string(std::string* out, size_t cap, bool& truncated) {
    get();  // opening quote
    std::string scratch;
    while (true) {
      int c = get();
      if (c < 0) return fail("unterminated string");
      if (c == '"') break;
      if (c < 0x20) return fail("control character in string");
      if (c != '\\') {
        scratch += static_cast<char>(c);
      } else if (!escape(scratch)) {
        return false;
      }
      if (out == nullptr) {
        scratch.clear();
      } else if (cap > 0 && out->size() + scratch.size() > cap) {
        truncated = true;
        scratch.clear();
      } else {
        *out += scratch;
        scratch.clear();
      }
    }
    return true;
  }

  DITHER_NOINLINE bool escape(std::string& s) {
    int e = get();
    switch (e) {
      case '"': s += '"'; return true;
      case '\\': s += '\\'; return true;
      case '/': s += '/'; return true;
      case 'b': s += '\b'; return true;
      case 'f': s += '\f'; return true;
      case 'n': s += '\n'; return true;
      case 'r': s += '\r'; return true;
      case 't': s += '\t'; return true;
      case 'u': break;
      default: return fail("bad escape");
    }
    uint32_t cp = 0;
    if (!readHex4(cp)) return false;
    if (cp >= 0xD800 && cp < 0xDC00 && src_.peek() == '\\') {
      get();
      if (get() != 'u') return fail("bad surrogate pair");
      uint32_t lo = 0;
      if (!readHex4(lo)) return false;
      if (lo >= 0xDC00 && lo < 0xE000) {
        cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
      } else {
        appendUtf8(s, 0xFFFD);
        cp = lo;
      }
    }
    if (cp >= 0xD800 && cp < 0xE000) cp = 0xFFFD;  // lone surrogate
    appendUtf8(s, cp);
    return true;
  }

  // Validates the JSON number grammar, then converts with strtod.
  DITHER_NOINLINE bool number(double& v) {
    char buf[64];
    size_t n = 0;
    auto take = [&]() {
      int c = get();
      if (n + 1 < sizeof(buf)) buf[n++] = static_cast<char>(c);
      return c;
    };
    if (src_.peek() == '-') take();
    if (!isDigit(src_.peek())) return fail("unexpected character");
    if (src_.peek() == '0') {
      take();
    } else {
      while (isDigit(src_.peek())) take();
    }
    if (src_.peek() == '.') {
      take();
      if (!isDigit(src_.peek())) return fail("bad number");
      while (isDigit(src_.peek())) take();
    }
    if (src_.peek() == 'e' || src_.peek() == 'E') {
      take();
      if (src_.peek() == '+' || src_.peek() == '-') take();
      if (!isDigit(src_.peek())) return fail("bad number");
      while (isDigit(src_.peek())) take();
    }
    if (n + 1 >= sizeof(buf)) return fail("number too long");
    buf[n] = '\0';
    v = std::strtod(buf, nullptr);
    return true;
  }
};

namespace {

// Upper bounds on nodes and string bytes, so an in-memory document can be
// parsed into vectors reserved once.
void prescan(std::string_view text, size_t& nodes, size_t& bytes) {
  nodes = 1;
  bytes = 0;
  bool inString = false;
  for (size_t i = 0; i < text.size(); ++i) {
    char c = text[i];
    if (inString) {
      if (c == '\\') {
        ++i;
        bytes += 4;
      } else if (c == '"') {
        inString = false;
      } else {
        ++bytes;
      }
    } else if (c == '"') {
      inString = true;
    } else if (c == ',' || c == '[' || c == '{') {
      ++nodes;
    }
  }
}

}  // namespace

JsonParseResult JsonDoc::parse(CharSource& source, const JsonFilter* filter, const JsonLimits& limits) {
  return JsonParser(*this, source, filter, limits).run();
}

JsonParseResult JsonDoc::parse(std::string_view text, const JsonFilter* filter, const JsonLimits& limits) {
  if (filter == nullptr) {
    size_t nodes = 0, bytes = 0;
    prescan(text, nodes, bytes);
    nodes_.reserve(std::min(nodes, limits.maxNodes));
    strings_.reserve(std::min(bytes, limits.maxStringBytes));
  }
  MemorySource src(text);
  return parse(src, filter, limits);
}

std::optional<double> JsonDoc::aggregate(int id) const {
  if (id < 0 || static_cast<size_t>(id) >= aggregates_.size()) return std::nullopt;
  return aggregates_[static_cast<size_t>(id)];
}

JsonView JsonDoc::root() const {
  return nodes_.empty() ? JsonView() : JsonView(this, 0);
}

}  // namespace dither
