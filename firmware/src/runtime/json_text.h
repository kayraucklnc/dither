// Reading a validated JSON text in place (JsonDoc's text mode).
#pragma once

#include <cstdint>
#include <string_view>

#include "json.h"

namespace dither {

class JsonText {
 public:
  // Strict JSON check without building anything; iterative, so depth costs
  // no stack. On failure fills `result` and returns false.
  static bool validate(std::string_view text, int maxDepth, JsonParseResult& result);
  // Offset of the root value (after leading whitespace).
  static uint32_t rootOffset(std::string_view text);

  static JsonType type(const JsonView& v);
  static double number(const JsonView& v);
  static bool boolean(const JsonView& v);
  // The string starting with the quote at `offset`, decoded if it has escapes.
  static std::string_view stringAt(const JsonDoc& doc, uint32_t offset);
  static JsonView first(const JsonView& v);
  static JsonView next(const JsonView& v);
};

}  // namespace dither
