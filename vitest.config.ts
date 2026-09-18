import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Integration tests hit the real local database — load .env for them.
    setupFiles: ["./vitest.setup.ts"],
    // The integration suite shares DB state within its file; files run in
    // parallel workers but touch disjoint rows.
  },
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
