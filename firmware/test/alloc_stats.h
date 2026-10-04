// Heap accounting for the host tests: operator new/delete are replaced (in
// alloc_stats.cpp) to track live bytes and the peak since the last reset.
#pragma once

#include <cstddef>

namespace allocstats {

void resetPeak();         // peak := current
size_t currentBytes();
size_t peakBytes();

}  // namespace allocstats
