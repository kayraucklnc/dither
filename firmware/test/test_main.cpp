#include <cstring>

#include "check.h"

int main(int argc, char** argv) {
  const char* filter = argc > 1 ? argv[1] : nullptr;
  int ran = 0;
  for (const auto& c : check::registry()) {
    if (filter && std::strstr(c.name, filter) == nullptr) continue;
    int before = check::stats().failures;
    c.fn();
    ++ran;
    if (check::stats().failures != before) std::cerr << "FAILED " << c.name << "\n";
  }
  const auto& s = check::stats();
  std::cout << ran << " tests, " << s.checks << " checks, " << s.failures << " failures";
  if (s.skipped) std::cout << ", " << s.skipped << " skipped";
  std::cout << "\n";
  return s.failures == 0 ? 0 : 1;
}
