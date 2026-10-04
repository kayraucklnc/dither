#include "log.h"

#include <Arduino.h>

#include <cstdarg>
#include <cstdio>

namespace dither {

void dlog(const char* fmt, ...) {
  char line[256];
  va_list args;
  va_start(args, fmt);
  vsnprintf(line, sizeof line, fmt, args);
  va_end(args);
  Serial.print("[dither] ");
  Serial.println(line);
}

}  // namespace dither
