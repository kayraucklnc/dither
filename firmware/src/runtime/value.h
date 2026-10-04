// Values and the store references resolve against (format.md §2).
#pragma once

#include <map>
#include <string>
#include <string_view>
#include <vector>

#include "json.h"

namespace dither {

enum class ValueType : uint8_t { Null, Number, String, Bool, Series };

class Value {
 public:
  Value() = default;
  static Value number(double v);
  static Value string(std::string v);
  static Value boolean(bool v);
  static Value series(std::vector<double> v);

  ValueType type() const { return type_; }
  bool isNull() const { return type_ == ValueType::Null; }
  bool isNumber() const { return type_ == ValueType::Number; }
  bool isString() const { return type_ == ValueType::String; }
  bool isBool() const { return type_ == ValueType::Bool; }
  bool isSeries() const { return type_ == ValueType::Series; }

  double asNumber() const { return number_; }
  bool asBool() const { return bool_; }
  const std::string& asString() const { return string_; }
  const std::vector<double>& asSeries() const { return series_; }

  bool operator==(const Value& o) const;
  bool operator!=(const Value& o) const { return !(*this == o); }

 private:
  ValueType type_ = ValueType::Null;
  bool bool_ = false;
  double number_ = 0;
  std::string string_;
  std::vector<double> series_;
};

constexpr size_t kMaxSeries = 64;

// A JSON scalar as a value: objects and arrays become null.
Value valueFromJsonScalar(JsonView v);

// A JSON array as a series: at most `count` (capped at 64) elements, ending
// early at the first element that is not a number. Non-arrays become null.
Value seriesFromJson(JsonView v, int count);

// For injected values (golden fixtures, overrides): arrays become series.
Value valueFromJson(JsonView v);

class ValueStore {
 public:
  const Value& get(std::string_view ref) const;
  void set(std::string_view ref, Value v);
  void erase(std::string_view ref) { values_.erase(std::string(ref)); }
  const std::map<std::string, Value, std::less<>>& all() const { return values_; }

 private:
  std::map<std::string, Value, std::less<>> values_;
};

}  // namespace dither
