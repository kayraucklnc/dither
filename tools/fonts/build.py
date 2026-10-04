"""Rasterize Inter into Dither bitmap fonts (DFNT, docs/format.md §3).

Run from the repository root:

    uvx --with freetype-py==2.5.1 python tools/fonts/build.py

Reads the vendored TTFs in tools/fonts/src/ and writes
app/src/assets/fonts/inter-<weight>-<size>.dfnt, fonts.json and
LICENSE-Inter.txt. Output is deterministic for a given freetype-py (it bundles
its own FreeType), so re-running it on an unchanged tree changes nothing.
"""

from __future__ import annotations

import json
import shutil
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

import freetype

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools" / "fonts" / "src"
OUT = ROOT / "app" / "src" / "assets" / "fonts"

FAMILY = "Inter"
SOURCES = {400: SRC / "Inter-Regular.ttf", 700: SRC / "Inter-Bold.ttf"}
LICENSE = SRC / "LICENSE-Inter.txt"
SIZES = (12, 14, 16, 20, 24, 28, 32, 40, 48, 64, 80, 96, 128)
LARGE_FROM = 64  # sizes at or above this get the reduced charset

HEADER = struct.Struct("<4sBBHhhHH")  # 16 bytes
GLYPH = struct.Struct("<IIHHhhHH")  # 20 bytes
VERSION = 1

# Currency signs a revenue or price widget may print: £ ¥ ₩ ₪ ₫ ₴ ₸ ₹ ₺ ₽ ₿
# (skipped where Inter has no glyph, like everything else here).
CURRENCY = (0x00A3, 0x00A5, 0x20A9, 0x20AA, 0x20AB, 0x20B4, 0x20B8, 0x20B9, 0x20BA, 0x20BD, 0x20BF)

# – — ‘ ’ “ ” • … € ← ↑ → ↓ − × ÷ ≤ ≥ ▲ ▼ ● ○
SMALL_EXTRAS = (
    0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC,
    0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x00D7, 0x00F7, 0x2264, 0x2265,
    0x25B2, 0x25BC, 0x25CF, 0x25CB, *CURRENCY,
)
# ° ĞğİıŞşÇçÖöÜü – — … € ← ↑ → ↓ −
LARGE_EXTRAS = (
    0x00B0, 0x011E, 0x011F, 0x0130, 0x0131, 0x015E, 0x015F, 0x00C7, 0x00E7,
    0x00D6, 0x00F6, 0x00DC, 0x00FC, 0x2013, 0x2014, 0x2026, 0x20AC, 0x2190,
    0x2191, 0x2192, 0x2193, 0x2212, *CURRENCY,
)

LOAD_FLAGS = freetype.FT_LOAD_DEFAULT | freetype.FT_LOAD_TARGET_MONO


@dataclass(frozen=True)
class Glyph:
    codepoint: int
    width: int
    height: int
    x_offset: int
    y_offset: int
    advance: int
    bitmap: bytes  # height rows of ceil(width / 8) bytes, MSB first


def round_half_away(value: float) -> int:
    """Round half away from zero (Python's round() is banker's rounding)."""
    return int(value + 0.5) if value >= 0 else -int(-value + 0.5)


def charset(size: int) -> list[int]:
    if size >= LARGE_FROM:
        base = range(0x20, 0x7F)
        return sorted(set(base) | set(LARGE_EXTRAS))
    base = [*range(0x20, 0x7F), *range(0xA0, 0x100), *range(0x100, 0x180)]
    return sorted(set(base) | set(SMALL_EXTRAS))


def pack_rows(bitmap: freetype.Bitmap) -> bytes:
    """Copy a FreeType mono bitmap into tight rows of ceil(width / 8) bytes."""
    if bitmap.pixel_mode != freetype.FT_PIXEL_MODE_MONO:
        raise ValueError(f"expected a mono bitmap, got pixel mode {bitmap.pixel_mode}")
    width, rows, pitch = bitmap.width, bitmap.rows, bitmap.pitch
    if width == 0 or rows == 0:
        return b""
    stride = (width + 7) // 8
    buffer = bytes(bitmap.buffer)
    # A negative pitch means the rows are stored bottom-up.
    order = range(rows) if pitch > 0 else range(rows - 1, -1, -1)
    step = abs(pitch)
    out = bytearray()
    for row in order:
        chunk = bytearray(buffer[row * step: row * step + stride])
        spare = stride * 8 - width
        if spare:  # FreeType leaves padding bits clear, but be certain.
            chunk[-1] &= (0xFF << spare) & 0xFF
        out += chunk
    return bytes(out)


def rasterize(face: freetype.Face, codepoint: int) -> Glyph | None:
    index = face.get_char_index(codepoint)
    if index == 0:
        return None  # the font lacks it; never emit .notdef
    face.load_glyph(index, LOAD_FLAGS)
    slot = face.glyph
    slot.render(freetype.FT_RENDER_MODE_MONO)
    bitmap = slot.bitmap
    data = pack_rows(bitmap)
    # FreeType hands back a blank 1x1 bitmap for outline-less glyphs such as
    # the space; a bitmap with no ink is stored as 0x0 so nothing is drawn.
    empty = not any(data)
    if empty:
        data = b""
    return Glyph(
        codepoint=codepoint,
        width=0 if empty else bitmap.width,
        height=0 if empty else bitmap.rows,
        x_offset=0 if empty else slot.bitmap_left,
        y_offset=0 if empty else -slot.bitmap_top,
        advance=round_half_away(slot.advance.x / 64),
        bitmap=data,
    )


def encode(line_height: int, ascent: int, descent: int, glyphs: list[Glyph]) -> bytes:
    table_end = HEADER.size + GLYPH.size * len(glyphs)
    header = HEADER.pack(b"DFNT", VERSION, 0, line_height, ascent, descent, len(glyphs), 0)
    table = bytearray()
    bitmaps = bytearray()
    for glyph in glyphs:
        offset = table_end + len(bitmaps)
        table += GLYPH.pack(
            glyph.codepoint, offset, glyph.width, glyph.height,
            glyph.x_offset, glyph.y_offset, glyph.advance, 0,
        )
        bitmaps += glyph.bitmap
    return header + bytes(table) + bytes(bitmaps)


def build_font(weight: int, size: int) -> tuple[dict, list[int]]:
    face = freetype.Face(str(SOURCES[weight]))
    face.set_pixel_sizes(0, size)
    ascent = round_half_away(face.size.ascender / 64)
    descent = round_half_away(-face.size.descender / 64)
    line_height = ascent + descent

    glyphs: list[Glyph] = []
    skipped: list[int] = []
    for codepoint in charset(size):
        glyph = rasterize(face, codepoint)
        if glyph is None:
            skipped.append(codepoint)
        else:
            glyphs.append(glyph)

    space = next((g for g in glyphs if g.codepoint == 0x20), None)
    if space is None or space.width or space.height or space.advance <= 0:
        raise RuntimeError(f"inter-{weight}-{size}: bad space glyph {space}")

    font_id = f"inter-{weight}-{size}"
    blob = encode(line_height, ascent, descent, glyphs)
    (OUT / f"{font_id}.dfnt").write_bytes(blob)
    entry = {
        "id": font_id,
        "family": FAMILY,
        "weight": weight,
        "size": size,
        "file": f"{font_id}.dfnt",
        "lineHeight": line_height,
        "ascent": ascent,
        "descent": descent,
        "glyphs": len(glyphs),
        "bytes": len(blob),
    }
    return entry, skipped


def main() -> int:
    for path in [*SOURCES.values(), LICENSE]:
        if not path.is_file():
            print(f"missing {path.relative_to(ROOT)}", file=sys.stderr)
            return 1
    OUT.mkdir(parents=True, exist_ok=True)
    for stale in OUT.glob("*.dfnt"):
        stale.unlink()

    print(f"FreeType {'.'.join(map(str, freetype.version()))}")
    entries = []
    for weight in sorted(SOURCES):
        for size in SIZES:
            entry, skipped = build_font(weight, size)
            entries.append(entry)
            note = ""
            if skipped:
                note = "  skipped " + " ".join(f"U+{cp:04X}" for cp in skipped)
            print(f"{entry['id']:>14}  {entry['glyphs']:>4} glyphs  {entry['bytes']:>7} B"
                  f"  lh {entry['lineHeight']}{note}")

    (OUT / "fonts.json").write_text(json.dumps(entries, indent=2) + "\n")
    shutil.copyfile(LICENSE, OUT / "LICENSE-Inter.txt")
    total = sum(e["bytes"] for e in entries)
    print(f"{len(entries)} fonts, {total} bytes -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
