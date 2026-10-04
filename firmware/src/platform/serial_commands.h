// Line commands accepted over USB serial while the board is awake:
//   CMD:SCREENSHOT  "SCREENSHOT_START:<n>\n", then the panel frame (P4 layout)
//   CMD:WAKE        run a wake now
//   CMD:SLEEP:<s>   deep-sleep for s seconds (1-600), to test a sleep cycle
//   CMD:INFO        version and board
#pragma once

#include <string>

#include "../runtime/framebuffer.h"

namespace dither {

class SerialCommands {
 public:
  // Reads what has arrived; true when a wake was requested.
  bool poll(const Framebuffer& lastFrame);

 private:
  void run(const std::string& line, const Framebuffer& lastFrame, bool& wake);
  std::string line_;
};

}  // namespace dither
