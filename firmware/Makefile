# Dither firmware.
#
#   make test        host unit tests + golden fixtures (clang++/g++, ASan+UBSan)
#   make build       device firmware (pioarduino via uvx)
#   make image       build, merge bootloader+partitions+app, verify, copy to
#                    ../app/public/firmware/ with manifest.json
#   make flash       write the merged image at 0x0 (PORT=/dev/cu.usbmodem101)
#   make test-blob   tools/make_test_blob.py -> build/test-blob.bin
#   make flash-blob  write build/test-blob.bin at 0x300000

CXX      ?= c++
ENV      ?= xiao-epaper-75
PORT     ?= /dev/cu.usbmodem101
PIO      ?= uvx --python 3.13 --from "https://github.com/pioarduino/platformio-core/archive/refs/tags/v6.1.19.zip" pio
ESPTOOL  ?= $(HOME)/Library/Arduino15/packages/esp32/tools/esptool_py/4.9.dev3/esptool
FIXTURES ?= $(abspath ../spec/fixtures)

HOST_DIR  := build/host
RUNTIME   := $(wildcard src/runtime/*.cpp)
TESTS     := $(wildcard test/*.cpp)
OBJS      := $(patsubst %.cpp,$(HOST_DIR)/%.o,$(RUNTIME) $(TESTS))
CXXFLAGS  := -std=c++17 -O1 -g -Wall -Wextra -Wshadow -Werror -fsanitize=address,undefined -fno-omit-frame-pointer
LDFLAGS   := -fsanitize=address,undefined

.PHONY: test build image flash test-blob flash-blob clean

test: $(HOST_DIR)/tests
	DITHER_FIXTURES="$(FIXTURES)" DITHER_TEST_OUT="$(abspath build/golden-out)" $(HOST_DIR)/tests $(FILTER)

$(HOST_DIR)/tests: $(OBJS)
	$(CXX) $(LDFLAGS) -o $@ $^

$(HOST_DIR)/%.o: %.cpp $(wildcard src/runtime/*.h) $(wildcard test/*.h)
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build:
	$(PIO) run -e $(ENV)

image: build
	python3 tools/package.py --env $(ENV) --version "$$(cat VERSION)" --out ../app/public/firmware

flash:
	$(ESPTOOL) --chip esp32c3 --port $(PORT) --baud 921600 write_flash 0x0 build/$(ENV).bin

test-blob:
	@mkdir -p build
	python3 tools/make_test_blob.py build/test-blob.bin

flash-blob: test-blob
	$(ESPTOOL) --chip esp32c3 --port $(PORT) --baud 921600 write_flash 0x300000 build/test-blob.bin

clean:
	rm -rf build .pio
