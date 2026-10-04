// Screen elements (format.md §2 "Elements", §4 "Drawing").
#pragma once

#include <string>
#include <vector>

#include "bytes.h"
#include "format.h"
#include "framebuffer.h"
#include "json.h"
#include "value.h"

namespace dither {

struct RenderContext {
  const ValueStore* values = nullptr;
  FormatContext format;
  const std::vector<ByteSpan>* assets = nullptr;
};

// The text of a `text` element's parts, concatenated.
std::string buildText(JsonView parts, const RenderContext& ctx);

void drawElement(Framebuffer& fb, JsonView element, const RenderContext& ctx);

// Clears to white, then draws every element in order.
void renderElements(Framebuffer& fb, JsonView elements, const RenderContext& ctx);

}  // namespace dither
