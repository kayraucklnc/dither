#include "alloc_stats.h"

#include <atomic>
#include <cstdlib>
#include <new>

namespace {

std::atomic<size_t> current{0};
std::atomic<size_t> peak{0};
constexpr size_t kHeader = 16;  // keeps every allocation 16-byte aligned

void* allocate(size_t size) {
  void* raw = std::malloc(size + kHeader);
  if (!raw) throw std::bad_alloc();
  *static_cast<size_t*>(raw) = size;
  size_t now = current += size;
  size_t seen = peak.load();
  while (now > seen && !peak.compare_exchange_weak(seen, now)) {
  }
  return static_cast<char*>(raw) + kHeader;
}

void release(void* p) {
  if (!p) return;
  void* raw = static_cast<char*>(p) - kHeader;
  current -= *static_cast<size_t*>(raw);
  std::free(raw);
}

}  // namespace

namespace allocstats {

void resetPeak() { peak = current.load(); }
size_t currentBytes() { return current.load(); }
size_t peakBytes() { return peak.load(); }

}  // namespace allocstats

void* operator new(size_t size) { return allocate(size); }
void* operator new[](size_t size) { return allocate(size); }
void operator delete(void* p) noexcept { release(p); }
void operator delete[](void* p) noexcept { release(p); }
void operator delete(void* p, size_t) noexcept { release(p); }
void operator delete[](void* p, size_t) noexcept { release(p); }
// The nothrow forms too: std::stable_sort's temporary buffer uses them.
void* operator new(size_t size, const std::nothrow_t&) noexcept {
  try {
    return allocate(size);
  } catch (...) {
    return nullptr;
  }
}
void* operator new[](size_t size, const std::nothrow_t&) noexcept {
  try {
    return allocate(size);
  } catch (...) {
    return nullptr;
  }
}
void operator delete(void* p, const std::nothrow_t&) noexcept { release(p); }
void operator delete[](void* p, const std::nothrow_t&) noexcept { release(p); }
