// What survives a wake: the value cache in NVS (survives power loss too) and
// the hash of what the panel shows in RTC memory (survives deep sleep only;
// after a power loss the panel is simply redrawn once).
#pragma once

#include <cstdint>

#include "../runtime/cache_codec.h"

namespace dither {

// Loads the cache for the blob with `blobCrc`; a cache written for another
// blob (or none) gives an empty one.
ValueCache loadCache(uint32_t blobCrc);
// Keeps it within kMaxCacheBytes (dropping the largest values, loudly) and
// writes only when the encoding changed, to spare the flash.
void saveCache(const ValueCache& cache);

bool panelShows(uint32_t frameHash);
void rememberPanel(uint32_t frameHash);
void forgetPanel();

// Counts this wake and returns its number since power-on (RTC memory).
uint32_t countWake();

// Counts a crash reset (panic, watchdog, brownout) and returns how many
// happened since the last wake that finished; other boots leave it alone.
uint32_t recordReset(bool crashed);
// A wake finished: the run of crashes is over.
void clearCrashes();

}  // namespace dither
