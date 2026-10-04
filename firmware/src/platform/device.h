// One wake of the panel, format.md §5, from reading the blob to choosing how
// long to sleep.
#pragma once

#include <cstdint>
#include <optional>
#include <string>

#include "../runtime/cache_codec.h"
#include "../runtime/framebuffer.h"
#include "../runtime/program.h"
#include "epd_uc8179.h"

namespace dither {

class Device {
 public:
  // Runs one wake and returns the seconds to sleep afterwards.
  uint32_t wake();
  // The frame most recently computed for the panel (for CMD:SCREENSHOT).
  const Framebuffer& panelFrame() const { return frame_; }

 private:
  uint32_t notSetUp(const std::string& reason, uint32_t sleepSeconds);
  uint32_t run(const Program& program);
  void fetchDue(const Program& program, bool online, std::optional<int64_t> now, ValueCache& cache);
  void present(Framebuffer frame);

  Uc8179 panel_;
  Framebuffer frame_;
};

}  // namespace dither
