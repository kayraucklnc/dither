// A minimal test harness: TEST(name) { CHECK(...); CHECK_EQ(a, b); }
#pragma once

#include <functional>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace check {

struct Case {
  const char* name;
  std::function<void()> fn;
};

inline std::vector<Case>& registry() {
  static std::vector<Case> cases;
  return cases;
}

struct Stats {
  int checks = 0;
  int failures = 0;
  int skipped = 0;
};

inline Stats& stats() {
  static Stats s;
  return s;
}

struct Registrar {
  Registrar(const char* name, std::function<void()> fn) { registry().push_back({name, std::move(fn)}); }
};

inline void fail(const char* file, int line, const std::string& message) {
  stats().failures++;
  std::cerr << "  FAIL " << file << ":" << line << ": " << message << "\n";
}

template <typename T>
std::string show(const T& v) {
  std::ostringstream os;
  os << v;
  return os.str();
}

inline std::string show(const std::vector<std::string>& rows) {
  std::string s = "\n";
  for (const auto& r : rows) s += "    " + r + "\n";
  return s;
}

inline std::string show(bool v) { return v ? "true" : "false"; }

}  // namespace check

#define CHECK_CONCAT_(a, b) a##b
#define CHECK_CONCAT(a, b) CHECK_CONCAT_(a, b)

#define TEST(name)                                                          \
  static void name();                                                       \
  static ::check::Registrar CHECK_CONCAT(registrar_, name)(#name, name);    \
  static void name()

#define CHECK(cond)                                         \
  do {                                                      \
    ::check::stats().checks++;                              \
    if (!(cond)) ::check::fail(__FILE__, __LINE__, #cond);  \
  } while (0)

#define CHECK_EQ(actual, expected)                                                                     \
  do {                                                                                                 \
    ::check::stats().checks++;                                                                         \
    const auto& a_ = (actual);                                                                         \
    const auto& e_ = (expected);                                                                       \
    if (!(a_ == e_)) {                                                                                 \
      ::check::fail(__FILE__, __LINE__,                                                                \
                    std::string(#actual) + " == " + ::check::show(a_) + ", expected " + ::check::show(e_)); \
    }                                                                                                  \
  } while (0)
