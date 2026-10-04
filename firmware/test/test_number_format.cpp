#include "../src/runtime/number_format.h"
#include "check.h"

using dither::formatNumber;
using dither::kAutoDecimals;

static std::string fmt(double v, int d, std::string_view sep = {}) {
  auto r = formatNumber(v, d, sep);
  return r ? *r : "<null>";
}

TEST(number_fixed_decimals) {
  CHECK_EQ(fmt(3.14159, 2), "3.14");
  CHECK_EQ(fmt(2, 2), "2.00");
  CHECK_EQ(fmt(0.5, 0), "1");
  CHECK_EQ(fmt(1.5, 0), "2");
  CHECK_EQ(fmt(2.5, 0), "3");    // half away from zero, not to even
  CHECK_EQ(fmt(-2.5, 0), "-3");
  CHECK_EQ(fmt(-0.5, 0), "-1");
  CHECK_EQ(fmt(0.05, 1), "0.1");
  CHECK_EQ(fmt(12, 0), "12");
  CHECK_EQ(fmt(0.001, 3), "0.001");
  CHECK_EQ(fmt(7, 5), "7.00000");
}

TEST(number_rounding_uses_the_double_product) {
  // 1.005 is 1.00499999999999989... so v * 100 is just under 100.5.
  CHECK_EQ(fmt(1.005, 2), "1.00");
  // 0.49999999999999994 must not round up (floor(x + 0.5) would).
  CHECK_EQ(fmt(0.49999999999999994, 0), "0");
  // These follow the product, not the decimal literal (checked against
  // Math.sign(x) * Math.round(Math.abs(x)) in node): 2.675 * 100 rounds to
  // exactly 267.5.
  CHECK_EQ(fmt(2.675, 2), "2.68");
  CHECK_EQ(fmt(1.255, 2), "1.25");
  CHECK_EQ(fmt(8.345, 2), "8.35");
}

TEST(number_negative_zero) {
  CHECK_EQ(fmt(-0.0, 0), "0");
  CHECK_EQ(fmt(-0.0, 2), "0.00");
  CHECK_EQ(fmt(-0.004, 2), "0.00");
  CHECK_EQ(fmt(-0.4, 0), "0");
  CHECK_EQ(fmt(-0.001, kAutoDecimals), "0");
}

TEST(number_automatic) {
  CHECK_EQ(fmt(20.5, kAutoDecimals), "20.5");
  CHECK_EQ(fmt(20.50, kAutoDecimals), "20.5");
  CHECK_EQ(fmt(3.0, kAutoDecimals), "3");
  CHECK_EQ(fmt(3.14159, kAutoDecimals), "3.14");
  CHECK_EQ(fmt(-1.999, kAutoDecimals), "-2");
  CHECK_EQ(fmt(0.1 + 0.2, kAutoDecimals), "0.3");
  CHECK_EQ(fmt(100, kAutoDecimals), "100");
  CHECK_EQ(fmt(0.007, kAutoDecimals), "0.01");
  CHECK_EQ(fmt(0.004, kAutoDecimals), "0");
  CHECK_EQ(fmt(-12.30, kAutoDecimals), "-12.3");
}

TEST(number_thousands_separator) {
  CHECK_EQ(fmt(1234567.891, 2, ","), "1,234,567.89");
  CHECK_EQ(fmt(999, 0, ","), "999");
  CHECK_EQ(fmt(1000, 0, ","), "1,000");
  CHECK_EQ(fmt(-1234.5, 1, "."), "-1.234.5");
  CHECK_EQ(fmt(123456, 0, "\xE2\x80\x89"), "123\xE2\x80\x89" "456");
  CHECK_EQ(fmt(999999.999, 2, ","), "1,000,000.00");
}

TEST(number_out_of_range_is_null) {
  CHECK_EQ(fmt(1.0 / 0.0, 0), "<null>");
  CHECK_EQ(fmt(-1.0 / 0.0, 2), "<null>");
  CHECK_EQ(fmt(1e300, 2), "<null>");
  CHECK_EQ(fmt(9.2e18, 0), "9200000000000000000");
  CHECK_EQ(fmt(-9.2e18, 0), "-9200000000000000000");
}
