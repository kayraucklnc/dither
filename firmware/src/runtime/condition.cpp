#include "condition.h"

#include <string_view>

#include "noinline.h"

namespace dither {
namespace {

constexpr int kMaxDepth = 32;

bool compareNumbers(const Value& v, JsonView x, std::string_view op) {
  if (!v.isNumber() || !x.isNumber()) return false;
  double a = v.asNumber(), b = x.number();
  if (op == "lt") return a < b;
  if (op == "le") return a <= b;
  if (op == "gt") return a > b;
  return a >= b;  // ge
}

bool between(const Value& v, JsonView x) {
  if (!v.isNumber() || !x[size_t{0}].isNumber() || !x[size_t{1}].isNumber()) return false;
  double n = v.asNumber(), a = x[size_t{0}].number(), b = x[size_t{1}].number();
  if (a > b) return n >= a || n < b;
  return a <= n && n < b;
}

bool contains(const Value& v, JsonView x) {
  return v.isString() && x.isString() && v.asString().find(x.string()) != std::string::npos;
}

bool anyEqual(const Value& v, JsonView x) {
  for (JsonView e = x.first(); e.exists() && x.isArray(); e = e.next()) {
    if (valuesEqual(v, e)) return true;
  }
  return false;
}

DITHER_NOINLINE bool evalComparison(JsonView cond, const ValueStore& values, const FormatContext& ctx) {
  const Value& raw = values.get(cond["v"].string());
  Value transformed;
  if (cond["f"].isObject()) {
    auto stepped = applyValueSteps(raw, cond["f"], ctx);
    transformed = stepped ? *stepped : Value();
  }
  const Value& v = cond["f"].isObject() ? transformed : raw;
  std::string_view op = cond["op"].string();
  JsonView x = cond["x"];
  if (op == "eq") return valuesEqual(v, x);
  if (op == "ne") return !valuesEqual(v, x);
  if (op == "lt" || op == "le" || op == "gt" || op == "ge") return compareNumbers(v, x, op);
  if (op == "between") return between(v, x);
  if (op == "in") return anyEqual(v, x);
  if (op == "contains") return contains(v, x);
  if (op == "present") return !v.isNull();
  if (op == "absent") return v.isNull();
  if (op == "true") return v.isBool() && v.asBool();
  if (op == "false") return v.isBool() && !v.asBool();
  return false;
}

bool eval(JsonView cond, const ValueStore& values, const FormatContext& ctx, int depth) {
  if (!cond.exists() || cond.isNull()) return true;
  if (!cond.isObject() || depth > kMaxDepth) return false;
  if (cond["all"].isArray()) {
    for (JsonView c = cond["all"].first(); c.exists(); c = c.next()) {
      if (!eval(c, values, ctx, depth + 1)) return false;
    }
    return true;
  }
  if (cond["any"].isArray()) {
    for (JsonView c = cond["any"].first(); c.exists(); c = c.next()) {
      if (eval(c, values, ctx, depth + 1)) return true;
    }
    return false;
  }
  if (cond["not"].exists()) return !eval(cond["not"], values, ctx, depth + 1);
  if (cond["v"].isString()) return evalComparison(cond, values, ctx);
  return false;
}

}  // namespace

bool valuesEqual(const Value& v, JsonView x) {
  if (v.isNumber() && x.isNumber()) return v.asNumber() == x.number();
  if (v.isString() && x.isString()) return v.asString() == x.string();
  if (v.isBool() && x.isBool()) return v.asBool() == x.boolean();
  return false;
}

bool evalCondition(JsonView cond, const ValueStore& values, const FormatContext& ctx) {
  FormatContext withValues = ctx;
  withValues.values = &values;
  return eval(cond, values, withValues, 0);
}

}  // namespace dither
