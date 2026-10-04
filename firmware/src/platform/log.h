// Serial log lines, each prefixed "[dither] ".
#pragma once

namespace dither {

void dlog(const char* fmt, ...) __attribute__((format(printf, 1, 2)));

}  // namespace dither
