#pragma once

// For helpers called from recursive functions: kept out of line so their
// locals are not part of the frame that repeats at every level.
#if defined(__GNUC__) || defined(__clang__)
#define DITHER_NOINLINE __attribute__((noinline))
#else
#define DITHER_NOINLINE
#endif
