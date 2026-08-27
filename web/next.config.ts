import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The repository root holds the Ruby app's package.json too; without this
  // Next picks that one and warns on every boot.
  turbopack: { root: path.join(import.meta.dirname) },
  // Playwright and sharp are native; bundling them breaks the binaries.
  serverExternalPackages: ["playwright", "sharp"],
};

export default nextConfig;
