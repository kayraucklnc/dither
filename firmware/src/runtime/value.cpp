#include "value.h"

#include <algorithm>

namespace dither {

Value Value::number(double v) {
  Value r;
  r.type_ = ValueType::Number;
  r.number_ = v;
  return r;
}

Value Value::string(std::string v) {
  Value r;
  r.type_ = ValueType::String;
  r.string_ = std::move(v);
  return r;
}

Value Value::boolean(bool v) {
  Value r;
  r.type_ = ValueType::Bool;
  r.bool_ = v;
  return r;
}

Value Value::series(std::vector<double> v) {
  Value r;
  r.type_ = ValueType::Series;
  r.series_ = std::move(v);
  return r;
}

bool Value::operator==(const Value& o) const {
  if (type_ != o.type_) return false;
  switch (type_) {
    case ValueType::Null: return true;
    case ValueType::Number: return number_ == o.number_;
    case ValueType::String: return string_ == o.string_;
    case ValueType::Bool: return bool_ == o.bool_;
    case ValueType::Series: return series_ == o.series_;
  }
  return false;
}

Value valueFromJsonScalar(JsonView v) {
  switch (v.type()) {
    case JsonType::Number: return Value::number(v.number());
    case JsonType::String: return Value::string(std::string(v.string()));
    case JsonType::Bool: return Value::boolean(v.boolean());
    default: return Value();
  }
}

Value seriesFromJson(JsonView v, int count) {
  if (!v.isArray()) return Value();
  size_t limit = std::min(static_cast<size_t>(std::max(count, 0)), kMaxSeries);
  std::vector<double> out;
  for (JsonView e = v.first(); e.exists() && out.size() < limit; e = e.next()) {
    if (!e.isNumber()) break;
    out.push_back(e.number());
  }
  return Value::series(std::move(out));
}

Value valueFromJson(JsonView v) {
  if (v.isArray()) return seriesFromJson(v, static_cast<int>(kMaxSeries));
  return valueFromJsonScalar(v);
}

const Value& ValueStore::get(std::string_view ref) const {
  static const Value kNull;
  auto it = values_.find(ref);
  return it == values_.end() ? kNull : it->second;
}

void ValueStore::set(std::string_view ref, Value v) {
  auto it = values_.find(ref);
  if (it == values_.end()) {
    values_.emplace(std::string(ref), std::move(v));
  } else {
    it->second = std::move(v);
  }
}

}  // namespace dither
