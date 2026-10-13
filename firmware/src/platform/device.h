// One wake of the panel, format.md §5, from reading the blob to choosing how
// long to sleep.
#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <utility>
#include <vector>

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
  // What happened to the frame this wake, for the summary line.
  enum class Frame { None, Updated, Same, Failed };

  uint32_t openAndRun(uint32_t number);
  void logSummary(uint32_t number, uint32_t sleepSeconds) const;
  void noteSource(const std::string& id, const char* outcome);
  uint32_t notSetUp(const std::string& reason, uint32_t sleepSeconds);
  uint32_t run(const Program& program);
  void fetchDue(const Program& program, bool online, std::optional<int64_t> now, ValueCache& cache);
  void present(Framebuffer frame);

  Uc8179 panel_;
  Framebuffer frame_;
  // Reset at the start of every wake; read by logSummary().
  const char* state_ = "ran";
  int screen_ = -1;
  Frame frameResult_ = Frame::None;
  bool online_ = false;
  bool clockSet_ = false;
  std::vector<std::pair<std::string, const char*>> outcomes_;
};

}  // namespace dither
