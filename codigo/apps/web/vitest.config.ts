import { defineConfig } from "vitest/config";

// Package-local runner (`npm test -w @shelfie/web`). The root `npm test` picks the same files up
// through its own config; each test file selects jsdom with a docblock, so both runs agree.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
  },
});
