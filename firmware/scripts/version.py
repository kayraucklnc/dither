# PlatformIO pre-script: the release version comes from firmware/VERSION and
# ends up in the app descriptor (format.md §8) via DITHER_VERSION.
from pathlib import Path

Import("env")  # noqa: F821 - provided by PlatformIO

version = Path(env.subst("$PROJECT_DIR"), "VERSION").read_text().strip()  # noqa: F821
if not version or len(version) > 31:
    raise SystemExit(f"VERSION must be 1-31 characters, got {version!r}")
env.Append(CPPDEFINES=[("DITHER_VERSION", env.StringifyMacro(version))])  # noqa: F821
print(f"Dither firmware version {version}")
