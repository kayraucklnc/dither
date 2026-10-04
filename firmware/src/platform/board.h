// Seeed XIAO 7.5" ePaper Panel: XIAO ESP32-C3 + 800x480 UC8179 (format.md §9).
#pragma once

#include <cstdint>

namespace dither::board {

constexpr const char* kId = "xiao-epaper-75";
constexpr int kPanelWidth = 800;
constexpr int kPanelHeight = 480;

// XIAO pin names -> ESP32-C3 GPIOs (Seeed Setup502 / EPaper driver board).
constexpr int kPinSck = 8;    // D8
constexpr int kPinMosi = 10;  // D10
constexpr int kPinCs = 3;     // D1
constexpr int kPinDc = 5;     // D3
constexpr int kPinBusy = 4;   // D2, low while the controller is busy
constexpr int kPinRst = 2;    // D0

constexpr uint32_t kSpiHz = 10000000;

}  // namespace dither::board
