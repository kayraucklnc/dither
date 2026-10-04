// A minimal UC8179 driver: reset, init, write one 1-bit frame, refresh,
// deep-sleep the controller.
#pragma once

#include "../runtime/framebuffer.h"

namespace dither {

class Uc8179 {
 public:
  // Writes `frame` (panel-sized, 1 = black) and refreshes, then puts the
  // controller into deep sleep. Returns false if the panel never reported
  // ready; the frame is then probably not shown.
  bool show(const Framebuffer& frame);

 private:
  void begin();
  void reset();
  bool waitIdle(uint32_t timeoutMs);
  void command(uint8_t c);
  void data(uint8_t d);
  void data(const uint8_t* bytes, size_t n);
  bool initFast();
  void setFullWindow();
  void writePlane(uint8_t cmd, const Framebuffer& frame);
  bool deepSleep();

  bool begun_ = false;
};

}  // namespace dither
