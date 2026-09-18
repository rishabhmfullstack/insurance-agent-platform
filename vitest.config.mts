import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Loads .env and enforces the local-database guard for integration tests.
    setupFiles: ["./vitest.setup.ts"],
    // Integration suites make many sequential DB roundtrips; generous
    // timeouts so a slow link or CI runner cannot fake a failure.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
