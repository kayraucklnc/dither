// The wake history line the panel keeps in flash, and the ring it lives in.
#include <string>
#include <vector>

#include "../src/runtime/history.h"
#include "check.h"

using namespace dither;

namespace {

WakeRecord sample() {
  WakeRecord r;
  r.at = 1792094280;
  r.reset = 8;
  r.wake = 14;
  r.state = "ran";
  r.frame = "updated";
  r.online = true;
  r.clockSet = true;
  r.network = true;
  r.rssi = -61;
  r.ok = 3;
  r.fail = 1;
  r.sleep = 1800;
  r.awakeMs = 9450;
  r.lowestHeap = 29648;
  r.version = "0.15.0";
  r.error = "s3:the body took too long";
  return r;
}

}  // namespace

TEST(history_line_has_every_field_and_the_error_last) {
  CHECK_EQ(historyLine(sample()),
           std::string("at=1792094280 v=0.15.0 reset=8 wake=14 state=ran frame=updated online=yes clock=set usb=no "
                       "net=used rssi=-61 ok=3 fail=1 offline=0 noclock=0 sleep=1800 ms=9450 heap=29648 "
                       "err=s3:the body took too long"));
}

TEST(history_line_without_clock_rssi_or_error) {
  WakeRecord r = sample();
  r.at.reset();
  r.rssi.reset();
  r.error.clear();
  r.network = false;
  const std::string line = historyLine(r);
  CHECK(line.rfind("at=- ", 0) == 0);
  CHECK(line.find("rssi=-") == std::string::npos);
  CHECK(line.find("net=skipped") != std::string::npos);
  CHECK(line.find("err=") == std::string::npos);
}

TEST(history_line_is_cut_at_a_character_boundary) {
  WakeRecord r = sample();
  r.error = "s0:" + std::string(200, 'x') + "é";
  std::string line = historyLine(r);
  CHECK_EQ(line.size(), kHistoryLineMax);
  r.error = "s0:" + std::string(kHistoryLineMax, 'x');
  const std::string head = historyLine(r).substr(0, historyLine(r).find("err=") + 4);
  // A two-byte character straddling the limit is dropped whole, never split.
  r.error = "s0:" + std::string(kHistoryLineMax - head.size() - 4, 'x') + "éé";
  line = historyLine(r);
  CHECK(line.size() <= kHistoryLineMax);
  CHECK((static_cast<unsigned char>(line.back()) & 0xC0) != 0xC0);
  CHECK(line.size() < 2 || static_cast<unsigned char>(line[line.size() - 2]) != 0xC3 ||
        (static_cast<unsigned char>(line.back()) & 0xC0) == 0x80);
}

TEST(history_order_before_the_ring_fills) {
  CHECK(historyOrder(0, 4).empty());
  CHECK(historyOrder(3, 4) == (std::vector<size_t>{0, 1, 2}));
}

TEST(history_order_after_the_ring_wraps) {
  CHECK(historyOrder(4, 4) == (std::vector<size_t>{0, 1, 2, 3}));
  CHECK(historyOrder(6, 4) == (std::vector<size_t>{2, 3, 0, 1}));
  CHECK_EQ(historySlot(6, 4), static_cast<size_t>(2));
}
