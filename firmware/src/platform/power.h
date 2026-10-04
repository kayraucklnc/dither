// USB presence, deep sleep, and the awake wait used while a computer is attached.
#pragma once

#include <cstdint>
#include <functional>

namespace dither {

// A USB host is talking to the USB-Serial/JTAG port (SOF frames seen). A
// plain charger does not count, which is what we want: the board only needs
// to stay awake when something might flash it.
bool usbHostConnected();

[[noreturn]] void deepSleep(uint32_t seconds);

enum class AwakeEnd { Elapsed, WakeRequested, UsbGone };

// Waits `seconds` awake, polling `onIdle` (serial commands); returns early
// when it asks for a wake or the USB host goes away, with what was left of
// the interval in `remaining`.
AwakeEnd waitAwake(uint32_t seconds, const std::function<bool()>& onIdle, uint32_t& remaining);

}  // namespace dither
