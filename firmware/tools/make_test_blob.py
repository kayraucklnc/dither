#!/usr/bin/env python3
"""Write a valid Dither blob (format.md §1) that draws shapes only - no fonts -
for smoke-testing a panel.

    make_test_blob.py OUT.bin
    make_test_blob.py OUT.bin --fixture ../spec/fixtures/handmade-shapes

With --fixture it also writes blob.bin, values.json and expected.pbm into that
folder. expected.pbm comes from the small, independent Python rendering of
format.md §4 below, so the C++ golden runner checks one reading of the spec
against another.
"""
import argparse
import json
import math
import os
import struct
import sys
import zlib

WIDTH, HEIGHT = 800, 480
NOW = 1782907200  # 2026-07-01T12:00:00Z

RUNTIME = {
    "v": 1,
    "board": "xiao-epaper-75",
    "width": WIDTH,
    "height": HEIGHT,
    "rotation": 0,
    "wifi": [],
    "tz": "CET-1CEST,M3.5.0,M10.5.0/3",
    "ntp": "pool.ntp.org",
    "refresh": 300,
    "sources": [],
    "screens": [
        {
            "name": "shapes",
            "elements": [
                {"t": "rect", "x": 10, "y": 10, "w": 780, "h": 460, "fill": False, "stroke": 4, "r": 24},
                {"t": "rect", "x": 40, "y": 40, "w": 200, "h": 120, "r": 16},
                {"t": "rect", "x": 60, "y": 60, "w": 160, "h": 80, "c": 0, "r": 9},
                {"t": "rect", "x": 260, "y": 40, "w": 200, "h": 120, "fill": False, "stroke": 3, "r": 30},
                {"t": "circle", "x": 560, "y": 100, "r": 60},
                {"t": "circle", "x": 560, "y": 100, "r": 40, "c": 0},
                {"t": "circle", "x": 690, "y": 100, "r": 60, "fill": False, "stroke": 5},
                {"t": "line", "x1": 40, "y1": 200, "x2": 760, "y2": 230},
                {"t": "line", "x1": 40, "y1": 250, "x2": 300, "y2": 420, "w": 4},
                {"t": "line", "x1": 300, "y1": 250, "x2": 60, "y2": 430, "w": 3},
                {"t": "hand", "x": 400, "y": 340, "len": 80, "w": 4, "v": "demo.minute", "max": 60},
                {"t": "hand", "x": 400, "y": 340, "len": 50, "w": 6, "v": "demo.hour", "max": 12},
                {"t": "circle", "x": 400, "y": 340, "r": 90, "fill": False, "stroke": 2},
                {"t": "bar", "x": 520, "y": 260, "w": 240, "h": 24, "v": "demo.level", "min": 0, "max": 100},
                {"t": "rect", "x": 520, "y": 260, "w": 240, "h": 24, "fill": False},
                {"t": "bar", "x": 520, "y": 300, "w": 30, "h": 140, "v": "demo.level", "min": 0, "max": 100, "dir": "u"},
                {"t": "chart", "x": 570, "y": 300, "w": 190, "h": 60, "v": "demo.series", "kind": "bars", "gap": 2},
                {"t": "chart", "x": 570, "y": 380, "w": 190, "h": 60, "v": "demo.series", "kind": "line", "lw": 2},
                {"t": "line", "x1": 30, "y1": 440, "x2": 60, "y2": 460, "w": 5,
                 "when": {"v": "device.online", "op": "false"}},
                {"t": "line", "x1": 60, "y1": 440, "x2": 30, "y2": 460, "w": 5,
                 "when": {"v": "device.online", "op": "false"}},
            ],
        }
    ],
    "rules": [{"screen": 0, "when": None}],
    "assets": [],
}

VALUES = {
    "demo.minute": 20,
    "demo.hour": 4.5,
    "demo.level": 62.5,
    "demo.series": [3, 7, 4, 9, 12, 8, 5, 2, 6, 10, 11, 7],
    "device.online": False,
    "device.usb": True,
}


def build_blob(runtime):
    body = json.dumps(runtime, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    runtime_offset = 48
    blob = bytearray(48) + body
    while len(blob) % 4:
        blob.append(0)
    struct.pack_into(
        "<4sHHIIIIIIIIII", blob, 0, b"DTHR", 1, 48, len(blob), 0,
        runtime_offset, len(body), 0, 0, 0, 0, NOW, 0,
    )
    struct.pack_into("<I", blob, 12, zlib.crc32(bytes(blob[48:])) & 0xFFFFFFFF)
    return bytes(blob)


# ---- an independent reading of format.md §4 ---------------------------------

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[0] * w for _ in range(h)]

    def plot(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def fill(self, x, y, w, h, c):
        for py in range(y, y + h):
            for px in range(x, x + w):
                self.plot(px, py, c)


def in_round_rect(px, py, x, y, w, h, r):
    if w <= 0 or h <= 0 or not (x <= px < x + w and y <= py < y + h):
        return False
    r = max(0, min(r, min(w, h) // 2))
    u = min(px - x, x + w - 1 - px)
    v = min(py - y, y + h - 1 - py)
    if u < r and v < r:
        return (2 * (r - u) - 1) ** 2 + (2 * (r - v) - 1) ** 2 <= (2 * r) ** 2
    return True


def draw_rect(cv, e, c):
    x, y, w, h, r = e["x"], e["y"], e["w"], e["h"], e.get("r", 0)
    filled = e.get("fill", True)
    s = e.get("stroke", 1)
    rc = max(0, min(r, min(w, h) // 2))
    for py in range(y, y + h):
        for px in range(x, x + w):
            if not in_round_rect(px, py, x, y, w, h, r):
                continue
            if not filled and in_round_rect(px, py, x + s, y + s, w - 2 * s, h - 2 * s, max(0, rc - s)):
                continue
            cv.plot(px, py, c)


def in_circle(px, py, x, y, r):
    return r >= 0 and (px - x) ** 2 + (py - y) ** 2 <= r * r + r


def draw_circle(cv, e, c):
    x, y, r = e["x"], e["y"], e["r"]
    s = e.get("stroke", 1)
    for py in range(y - r, y + r + 1):
        for px in range(x - r, x + r + 1):
            if not in_circle(px, py, x, y, r):
                continue
            if not e.get("fill", True) and r - s >= 0 and in_circle(px, py, x, y, r - s):
                continue
            cv.plot(px, py, c)


def draw_line(cv, x1, y1, x2, y2, w, c):
    dx, sx = abs(x2 - x1), (1 if x1 < x2 else -1)
    dy, sy = -abs(y2 - y1), (1 if y1 < y2 else -1)
    err, x, y = dx + dy, x1, y1
    k = (w - 1) // 2
    while True:
        cv.fill(x - k, y - k, w, w, c)
        if x == x2 and y == y2:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x += sx
        if e2 <= dx:
            err += dx
            y += sy


def round_away(v: float) -> int:
    """Nearest integer, ties away from zero, exactly (not floor(x + 0.5))."""
    a = abs(v)
    f = math.floor(a)
    r = f + (1 if a - f >= 0.5 else 0)  # a - f is exact
    return int(r if v >= 0 else -r)


def draw_element(cv, e, values):
    c = 0 if e.get("c", 1) == 0 else 1
    when = e.get("when")
    if when is not None and values.get(when["v"]) is not False:
        return  # only the "op": "false" form is used here
    t = e["t"]
    if t == "rect":
        draw_rect(cv, e, c)
    elif t == "circle":
        draw_circle(cv, e, c)
    elif t == "line":
        draw_line(cv, e["x1"], e["y1"], e["x2"], e["y2"], e.get("w", 1), c)
    elif t == "hand":
        v = values.get(e["v"])
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            a = 2 * math.pi * v / e["max"]
            ex = e["x"] + round_away(math.sin(a) * e["len"])
            ey = e["y"] - round_away(math.cos(a) * e["len"])
            draw_line(cv, e["x"], e["y"], ex, ey, e.get("w", 1), c)
    elif t == "bar":
        v = values.get(e["v"])
        f = min(max((v - e["min"]) / (e["max"] - e["min"]), 0.0), 1.0)
        if e.get("dir", "r") == "u":
            fh = math.floor(f * e["h"])
            cv.fill(e["x"], e["y"] + e["h"] - fh, e["w"], fh, c)
        else:
            cv.fill(e["x"], e["y"], math.floor(f * e["w"]), e["h"], c)
    elif t == "chart":
        s = values[e["v"]]
        n = len(s)
        lo, hi = e.get("min", min(s)), e.get("max", max(s))
        if hi <= lo:
            hi = lo + 1
        x, y, w, h = e["x"], e["y"], e["w"], e["h"]
        fr = [min(max((v - lo) / (hi - lo), 0.0), 1.0) for v in s]
        if e.get("kind", "bars") == "bars":
            gap = e.get("gap", 1)
            for i in range(n):
                x0, x1 = x + (i * w) // n, x + ((i + 1) * w) // n - gap
                bh = max(1, math.floor(fr[i] * h))
                cv.fill(x0, y + h - bh, x1 - x0, bh, c)
        else:
            pts = [(x + (i * (w - 1)) // max(1, n - 1), y + (h - 1) - math.floor(fr[i] * (h - 1))) for i in range(n)]
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                draw_line(cv, ax, ay, bx, by, e.get("lw", 2), c)


def render(runtime, values):
    cv = Canvas(runtime["width"], runtime["height"])
    for e in runtime["screens"][0]["elements"]:
        draw_element(cv, e, values)
    return cv


def pbm(cv):
    out = bytearray(b"P4\n%d %d\n" % (cv.w, cv.h))
    for row in cv.px:
        for i in range(0, cv.w, 8):
            byte = 0
            for b in range(8):
                if i + b < cv.w and row[i + b]:
                    byte |= 0x80 >> b
            out.append(byte)
    return bytes(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", help="where to write the blob")
    ap.add_argument("--fixture", help="also write a golden fixture into this folder")
    args = ap.parse_args()

    blob = build_blob(RUNTIME)
    with open(args.out, "wb") as f:
        f.write(blob)
    print(f"wrote {args.out}: {len(blob)} bytes, crc {struct.unpack_from('<I', blob, 12)[0]:08x}")

    if args.fixture:
        os.makedirs(args.fixture, exist_ok=True)
        with open(os.path.join(args.fixture, "blob.bin"), "wb") as f:
            f.write(blob)
        with open(os.path.join(args.fixture, "values.json"), "w") as f:
            json.dump({"now": NOW, "values": VALUES}, f, indent=2)
            f.write("\n")
        with open(os.path.join(args.fixture, "expected.pbm"), "wb") as f:
            f.write(pbm(render(RUNTIME, VALUES)))
        print(f"wrote fixture {args.fixture}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
