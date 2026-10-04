// Golden fixtures (format.md §7): for each spec/fixtures/<name>/ render the
// blob with the given values and compare with expected.pbm pixel for pixel.
// On a mismatch actual.pbm is written to $DITHER_TEST_OUT/<name>/.
#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>

#include "../src/runtime/program.h"
#include "../src/runtime/wake.h"
#include "check.h"
#include "pbm.h"

namespace fs = std::filesystem;
using namespace dither;

namespace {

std::vector<uint8_t> readFile(const fs::path& p) {
  std::ifstream in(p, std::ios::binary);
  return std::vector<uint8_t>((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
}

struct Mismatch {
  int count = 0;
  int firstX = -1, firstY = -1;
};

Mismatch compare(const Framebuffer& a, const Framebuffer& b) {
  Mismatch m;
  for (int y = 0; y < a.height(); ++y) {
    for (int x = 0; x < a.width(); ++x) {
      if (a.get(x, y) == b.get(x, y)) continue;
      if (m.count++ == 0) m.firstX = x, m.firstY = y;
    }
  }
  return m;
}

// Returns an empty string on success, else what went wrong.
std::string runFixture(const fs::path& dir, const fs::path& outDir) {
  auto blob = readFile(dir / "blob.bin");
  std::string error;
  auto program = Program::load({blob.data(), blob.size()}, error);
  if (!program) return "blob does not load: " + error;

  auto valuesText = readFile(dir / "values.json");
  JsonDoc doc;
  auto parsed = doc.parse(std::string_view(reinterpret_cast<const char*>(valuesText.data()), valuesText.size()));
  if (!parsed.ok) return "values.json: " + parsed.error;
  JsonView now = doc.root()["now"];
  if (!now.isNumber()) return "values.json has no \"now\"";
  const int64_t nowSeconds = static_cast<int64_t>(now.number());

  ValueStore values;
  setClockValues(values, nowSeconds, program->timeZone());
  for (JsonView v = doc.root()["values"].first(); v.exists(); v = v.next()) {
    values.set(v.key(), valueFromJson(v));
  }

  auto expected = testutil::readPbm((dir / "expected.pbm").string());
  if (!expected) return "expected.pbm missing or not P4";

  Framebuffer actual;
  program->render(program->chooseScreen(values, nowSeconds), values, nowSeconds, actual);
  if (actual.width() != expected->width() || actual.height() != expected->height()) {
    return "size " + std::to_string(actual.width()) + "x" + std::to_string(actual.height()) + " != expected " +
           std::to_string(expected->width()) + "x" + std::to_string(expected->height());
  }
  Mismatch m = compare(actual, *expected);
  if (m.count == 0) return "";
  fs::create_directories(outDir);
  testutil::writePbm((outDir / "actual.pbm").string(), actual);
  std::ostringstream os;
  os << m.count << " pixels differ, first at (" << m.firstX << ", " << m.firstY << "); wrote "
     << (outDir / "actual.pbm").string();
  return os.str();
}

}  // namespace

TEST(golden_fixtures) {
  const char* root = std::getenv("DITHER_FIXTURES");
  const char* out = std::getenv("DITHER_TEST_OUT");
  fs::path fixtures = root ? root : "../spec/fixtures";
  fs::path outRoot = out ? out : "build/golden-out";
  std::vector<fs::path> dirs;
  std::error_code ec;
  if (fs::is_directory(fixtures, ec)) {
    for (const auto& entry : fs::directory_iterator(fixtures, ec)) {
      if (entry.is_directory() && fs::exists(entry.path() / "blob.bin")) dirs.push_back(entry.path());
    }
  }
  std::sort(dirs.begin(), dirs.end());
  if (dirs.empty()) {
    std::cout << "golden: no fixtures in " << fixtures.string() << ", skipped\n";
    check::stats().skipped++;
    return;
  }
  int passed = 0;
  for (const auto& dir : dirs) {
    std::string problem = runFixture(dir, outRoot / dir.filename());
    check::stats().checks++;
    if (problem.empty()) {
      ++passed;
    } else {
      check::fail(__FILE__, __LINE__, dir.filename().string() + ": " + problem);
    }
  }
  std::cout << "golden: " << passed << "/" << dirs.size() << " fixtures match\n";
}
