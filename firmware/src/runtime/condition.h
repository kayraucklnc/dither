// Conditions (format.md §2 "Conditions").
#pragma once

#include "format.h"
#include "json.h"
#include "value.h"

namespace dither {

// A missing or null condition holds ("always"). Anything malformed - an
// unknown `op`, a node with none of all/any/not/v - does not hold.
// A leaf's optional `f` runs its until/scale/add/steps/map steps first.
bool evalCondition(JsonView cond, const ValueStore& values, const FormatContext& ctx);

// `eq` between a value and a JSON constant: number/number, string/string or
// bool/bool; every other pairing (null included) is a mismatch.
bool valuesEqual(const Value& v, JsonView x);
bool valuesEqual(const Value& a, const Value& b);

}  // namespace dither
