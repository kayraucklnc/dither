#include "device.h"

#include <Arduino.h>
#include <esp_system.h>

#include "../runtime/crc32.h"
#include "../runtime/notice_screen.h"
#include "../runtime/rotate.h"
#include "../runtime/wake.h"
#include "blob_store.h"
#include "board.h"
#include "http_fetch.h"
#include "log.h"
#include "network.h"
#include "persist.h"
#include "power.h"

namespace dither {
namespace {

bool fitsBoard(const Program& p, std::string& error) {
  if (p.board() != board::kId) {
    error = "blob is for board '" + std::string(p.board()) + "'";
    return false;
  }
  const bool quarter = p.rotation() == 90 || p.rotation() == 270;
  const int w = quarter ? board::kPanelHeight : board::kPanelWidth;
  const int h = quarter ? board::kPanelWidth : board::kPanelHeight;
  if (p.width() != w || p.height() != h) {
    error = "blob is " + std::to_string(p.width()) + "x" + std::to_string(p.height()) + " at rotation " +
            std::to_string(p.rotation());
    return false;
  }
  return true;
}

std::vector<SourceState> statesOf(const Program& p, const ValueCache& cache) {
  std::vector<SourceState> states;
  for (const auto& s : p.sources()) states.push_back(cache.stateOf(s.id));
  return states;
}

}  // namespace

uint32_t Device::wake() {
  const uint32_t number = countWake();
  dlog("wake #%lu: Dither %s on %s, reset reason %d, heap %lu", static_cast<unsigned long>(number), DITHER_VERSION,
       board::kId, static_cast<int>(esp_reset_reason()), static_cast<unsigned long>(ESP.getFreeHeap()));
  MappedBlob blob;
  std::string error;
  switch (blob.open(error)) {
    case MappedBlob::Status::Ok: break;
    case MappedBlob::Status::NoBlob: return notSetUp(error, kNotSetUpSleep);
    case MappedBlob::Status::Unreadable: return notSetUp(error, kRetrySleep);
  }
  const uint32_t parseStart = millis();
  std::unique_ptr<Program> program = Program::load(blob.span(), error);
  if (!program) return notSetUp(error, kNotSetUpSleep);
  if (!fitsBoard(*program, error)) return notSetUp(error, kNotSetUpSleep);
  dlog("blob ok: %lu bytes, crc %08lx, built %lu, %u screens, %u sources, parsed in %lu ms, heap %lu",
       static_cast<unsigned long>(program->header().totalLength), static_cast<unsigned long>(program->header().crc),
       static_cast<unsigned long>(program->header().buildTime), static_cast<unsigned>(program->screenCount()),
       static_cast<unsigned>(program->sources().size()), static_cast<unsigned long>(millis() - parseStart),
       static_cast<unsigned long>(ESP.getFreeHeap()));
  if (!program->timeZoneValid()) dlog("tz not understood, using UTC");
  return run(*program);
}

uint32_t Device::run(const Program& program) {
  std::optional<int64_t> now = clockNow();
  if (now && program.quiet().enabled) {
    CivilTime local = program.timeZone().toLocal(*now);
    if (inQuietHours(program.quiet(), local.hour * 60 + local.minute)) {
      dlog("quiet hours until %02d:%02d", program.quiet().to / 60, program.quiet().to % 60);
      return quietSleepSeconds(local, program.quiet().to);
    }
  }

  ValueCache cache = loadCache(program.header().crc);
  DeviceStatus device;
  device.usb = usbHostConnected();
  if (needsNetwork(program.sources(), statesOf(program, cache), now)) {
    WifiResult wifi = joinWifi(program.wifi());
    device.online = cache.lastOnline = wifi.online;
    device.rssi = cache.lastRssi = wifi.rssi;
    if (wifi.online && syncTime(program.ntpServer())) now = clockNow();
    fetchDue(program, wifi.online, now, cache);
    stopWifi();
    saveCache(cache);  // before drawing, so a crash while drawing does not refetch
  } else {
    device.online = cache.lastOnline;
    device.rssi = cache.lastRssi;
    dlog("nothing due: no network this wake");
  }
  dlog("clock %s, online %s, usb %s", now ? "set" : "unknown", device.online ? "yes" : "no",
       device.usb ? "yes" : "no");

  ValueStore values = cache.values;
  setClockValues(values, now, program.timeZone());
  setDeviceValues(values, device);
  const std::vector<SourceState> states = statesOf(program, cache);
  for (size_t i = 0; i < states.size(); ++i) setSourceStatus(values, program.sources()[i].id, states[i], now);
  program.applyMerges(values, now);  // recomputed each wake, from cached values too

  const int screen = program.chooseScreen(values, now);
  const uint32_t drawStart = millis();
  Framebuffer logical;
  program.render(screen, values, now, logical);
  dlog("screen %d drawn in %lu ms", screen, static_cast<unsigned long>(millis() - drawStart));
  present(rotateToPanel(std::move(logical), program.rotation()));
  return sleepSeconds(program.refreshFor(screen), program.sources(), states, now);
}

void Device::fetchDue(const Program& program, bool online, std::optional<int64_t> now, ValueCache& cache) {
  for (const auto& source : program.sources()) {
    SourceState state = cache.stateOf(source.id);
    if (!sourceDue(state, source.every, now)) continue;
    if (!sourceFetchable(source, now)) {
      dlog("source %s: needs the clock, not fetched", source.id.c_str());
      continue;
    }
    state.attempted = true;
    state.lastAttempt = now;
    if (!online) {
      state.ok = false;
      dlog("source %s: due, but offline", source.id.c_str());
    } else {
      JsonDoc doc;
      std::string error;
      const uint32_t start = millis();
      state.ok = fetchSource(source, program, now, cache, doc, error);
      if (state.ok) {
        applyResponse(source, doc, cache.values, now, program.timeZone());
        state.everSucceeded = true;
        state.lastSuccess = now;  // unknown without a clock: _age reads null
        dlog("source %s: ok in %lu ms (%u values, %u bytes of text kept), heap %lu", source.id.c_str(),
             static_cast<unsigned long>(millis() - start), static_cast<unsigned>(doc.nodeCount()),
             static_cast<unsigned>(doc.stringBytes()), static_cast<unsigned long>(ESP.getFreeHeap()));
      } else {
        dlog("source %s: failed: %s", source.id.c_str(), error.c_str());
      }
    }
    cache.setState(source.id, state);
  }
}

uint32_t Device::notSetUp(const std::string& reason, uint32_t sleepSeconds) {
  dlog("not set up: %s", reason.c_str());
  Framebuffer fb(board::kPanelWidth, board::kPanelHeight);
  drawNotSetUp(fb, std::string("Dither ") + DITHER_VERSION + " - " + reason);
  present(std::move(fb));
  return sleepSeconds;
}

void Device::present(Framebuffer frame) {
  frame_ = std::move(frame);
  const uint32_t hash = crc32(frame_.bytes().data(), frame_.bytes().size());
  if (panelShows(hash)) {
    dlog("panel already shows this frame (%08lx), left alone", static_cast<unsigned long>(hash));
    return;
  }
  // Until the refresh completes the panel shows something unknown.
  forgetPanel();
  if (panel_.show(frame_)) {
    rememberPanel(hash);
    dlog("panel updated (%08lx)", static_cast<unsigned long>(hash));
  } else {
    dlog("panel update failed");
  }
}

}  // namespace dither
