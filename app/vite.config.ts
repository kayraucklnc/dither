import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwind()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  assetsInclude: ["**/*.dfnt", "**/*.pack"],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
