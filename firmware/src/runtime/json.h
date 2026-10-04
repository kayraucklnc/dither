// A small JSON document model.
//
// Why not ArduinoJson: v7 stores any number whose mantissa fits in a float
// *as* a float (80.66 reads back as 80.659996), and even in double mode its
// decimal-to-binary step multiplies by inexact powers of ten. The panel has to
// produce the same pixels as JSON.parse in the browser, so numbers here are
// parsed with strtod, which is correctly rounded on both newlib and the host.
#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace dither {

enum class JsonType : uint8_t { Null, Bool, Number, String, Array, Object };

class JsonDoc;

// A cheap handle to one node of a JsonDoc. A default-constructed view is
// "missing": it reports type Null and exists() == false.
class JsonView {
 public:
  JsonView() = default;

  bool exists() const { return doc_ != nullptr; }
  JsonType type() const;
  bool isNull() const { return type() == JsonType::Null; }
  bool isBool() const { return type() == JsonType::Bool; }
  bool isNumber() const { return type() == JsonType::Number; }
  bool isString() const { return type() == JsonType::String; }
  bool isArray() const { return type() == JsonType::Array; }
  bool isObject() const { return type() == JsonType::Object; }

  double number(double fallback = 0) const;
  bool boolean(bool fallback = false) const;
  std::string_view string() const;  // empty unless isString()
  // Integer fields: a finite number truncated towards zero, else `fallback`.
  int integer(int fallback = 0) const;

  size_t size() const;  // members of an array or object, else 0
  JsonView operator[](size_t index) const;
  JsonView operator[](std::string_view key) const;  // last member with that key

  // Child iteration: for (JsonView c = v.first(); c.exists(); c = c.next())
  JsonView first() const;
  JsonView next() const;
  std::string_view key() const;  // the member name, for children of an object

  // Follows a dotted path: a digits-only segment indexes an array, and on an
  // object it is a key. Missing anywhere: a missing view.
  JsonView path(std::string_view dotted) const;

 private:
  friend class JsonDoc;
  friend class JsonParser;
  JsonView(const JsonDoc* doc, uint32_t index) : doc_(doc), index_(index) {}
  const JsonDoc* doc_ = nullptr;
  uint32_t index_ = 0;
};

// Where the parser reads characters from: memory, or an HTTP body.
class CharSource {
 public:
  virtual ~CharSource() = default;
  virtual int peek() = 0;  // -1 at the end
  virtual int get() = 0;   // -1 at the end
};

class MemorySource : public CharSource {
 public:
  MemorySource(const char* data, size_t size) : p_(data), end_(data + size) {}
  explicit MemorySource(std::string_view s) : MemorySource(s.data(), s.size()) {}
  int peek() override { return p_ < end_ ? static_cast<unsigned char>(*p_) : -1; }
  int get() override { return p_ < end_ ? static_cast<unsigned char>(*p_++) : -1; }

 private:
  const char* p_;
  const char* end_;
};

// Which parts of a response to keep, built from the source's dotted paths.
// Everything off those paths is skipped while parsing (without recursion), so
// a large response never has to fit in memory. At the end of a path a plain
// value keeps only a scalar - an object or array there would read as null
// anyway - and a `count` value keeps the first scalars of an array.
class JsonFilter {
 public:
  void addPath(std::string_view dottedPath, int count = -1);
  // An aggregate over the array at `dottedPath`, worked out while the array
  // streams past: the count of its elements, or the sum of each element's
  // `field`. Only those fields are ever kept, and only per element.
  enum class AggKind { Count, Sum };
  void addAggregate(std::string_view dottedPath, AggKind kind, std::string_view field, int id);
  // Call once all paths are in: elements that are also wanted by index
  // learn to keep the aggregate fields too.
  void finalize();
  int aggregateCount() const { return aggregateCount_; }
  const JsonFilter* child(std::string_view key) const;
  bool keepsScalar() const { return scalar_; }
  int seriesItems() const { return series_; }  // -1: not a series
  bool hasChildren() const { return !children_.empty(); }
  // The highest all-digit child key, or -1: array elements up to it keep
  // their positions even when skipped.
  long highestIndex() const;
  size_t longestKey() const { return longestKey_; }

  struct Aggregate {
    int id;
    AggKind kind;
    std::string field;
  };
  const std::vector<Aggregate>& aggregates() const { return aggregates_; }
  // The fields every element of an aggregated array keeps; null if none.
  const JsonFilter* elementFields() const { return each_.empty() ? nullptr : &each_[0]; }

 private:
  JsonFilter* node(std::string_view dottedPath);
  void merge(const JsonFilter& other);

  std::vector<std::pair<std::string, JsonFilter>> children_;
  bool scalar_ = false;
  int series_ = -1;
  size_t longestKey_ = 0;  // on the root: the longest segment of any path
  std::vector<Aggregate> aggregates_;
  std::vector<JsonFilter> each_;  // zero or one
  int aggregateCount_ = 0;        // on the root
};

struct JsonLimits {
  size_t maxNodes;
  size_t maxStringBytes;  // keys and string values together
  int maxDepth;           // of kept nesting; skipped parts are not limited
  size_t maxStringLength; // longer kept strings are cut (at a UTF-8 boundary); 0: no limit

  static JsonLimits runtime() { return {200000, 4u << 20, 32, 0}; }
  static JsonLimits response() { return {2048, 16 * 1024, 20, 256}; }
};

struct JsonParseResult {
  bool ok = false;
  std::string error;
  size_t offset = 0;  // characters consumed when the error was found
};

class JsonDoc {
 public:
  JsonParseResult parse(CharSource& source, const JsonFilter* filter, const JsonLimits& limits);
  // Unfiltered documents in memory (the runtime JSON, test inputs). Reserves
  // exactly once from a quick scan, so the vectors never double while parsing.
  JsonParseResult parse(std::string_view text, const JsonFilter* filter = nullptr,
                        const JsonLimits& limits = JsonLimits::runtime());
  JsonView root() const;
  size_t nodeCount() const { return nodes_.size(); }
  size_t stringBytes() const { return strings_.size(); }
  // The result of the filter's aggregate `id`: null when its target was
  // missing or not an array.
  std::optional<double> aggregate(int id) const;

 private:
  friend class JsonView;
  friend class JsonParser;
  static constexpr uint32_t kNone = 0xFFFFFFFFu;

  struct Node {
    JsonType type = JsonType::Null;
    bool boolean = false;
    uint32_t keyOffset = 0, keyLength = 0;
    uint32_t next = kNone;
    union {
      double number;
      struct {
        uint32_t offset, length;
      } str;
      struct {
        uint32_t first, count;
      } kids;
    };
    Node() : number(0) {}
  };

  std::vector<Node> nodes_;
  std::string strings_;
  std::vector<std::optional<double>> aggregates_;
};

}  // namespace dither
